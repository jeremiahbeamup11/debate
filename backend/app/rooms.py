"""Room lifecycle endpoints. All writes go through the service role here —
clients are read-only via RLS (SECURITY.md §4, §6).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth import get_current_user_id
from app.db import get_db
from app.game import (
    MAX_PLAYERS,
    MIN_PLAYERS,
    assign_roles,
    generate_room_code,
    initial_debate_state,
    utcnow,
)
from app.limits import limiter
from app.words import contains_blocked_word

logger = logging.getLogger("app.rooms")

router = APIRouter()


class JoinRoomRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=4, max_length=4)
    display_name: str = Field(min_length=1, max_length=24)

    @field_validator("code")
    @classmethod
    def uppercase_code(cls, v: str) -> str:
        return v.upper()

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display name is empty")
        if contains_blocked_word(v):
            raise ValueError("display name not allowed")
        return v


@router.post("/rooms", status_code=201)
@limiter.limit("5/hour;15/day")
def create_room(request: Request, user_id: str = Depends(get_current_user_id)) -> dict:
    db = get_db()
    for _ in range(5):
        code = generate_room_code()
        existing = (
            db.table("rooms").select("id").eq("code", code).eq("status", "lobby").execute()
        )
        if not existing.data:
            break
    else:
        raise HTTPException(status_code=503, detail="Could not allocate a room code")
    row = (
        db.table("rooms")
        .insert({"code": code, "status": "lobby", "host_user_id": user_id})
        .execute()
    )
    room = row.data[0]
    return {"room_id": room["id"], "code": room["code"]}


@router.post("/rooms/join", status_code=201)
@limiter.limit("30/hour")
def join_room(
    request: Request,
    body: JoinRoomRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    db = get_db()
    rooms = (
        db.table("rooms")
        .select("id,status")
        .eq("code", body.code)
        .eq("status", "lobby")
        .execute()
    )
    if not rooms.data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms.data[0]

    existing = (
        db.table("players")
        .select("id")
        .eq("room_id", room["id"])
        .eq("auth_user_id", user_id)
        .execute()
    )
    if existing.data:
        return {"room_id": room["id"], "player_id": existing.data[0]["id"]}

    count = db.table("players").select("id").eq("room_id", room["id"]).execute()
    if len(count.data) >= MAX_PLAYERS:
        raise HTTPException(status_code=409, detail="Room is full")

    player = (
        db.table("players")
        .insert(
            {
                "room_id": room["id"],
                "auth_user_id": user_id,
                "display_name": body.display_name,
            }
        )
        .execute()
    )
    return {"room_id": room["id"], "player_id": player.data[0]["id"]}


@router.post("/rooms/{room_id}/start")
@limiter.limit("30/hour")
def start_game(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    db = get_db()
    rooms = (
        db.table("rooms")
        .select("id,status,host_user_id")
        .eq("id", str(room_id))
        .execute()
    )
    if not rooms.data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms.data[0]
    if room["host_user_id"] != user_id:
        logger.warning("non-host start attempt: room=%s", room_id)
        raise HTTPException(status_code=403, detail="Only the host can start the game")
    if room["status"] != "lobby":
        raise HTTPException(status_code=409, detail="Game already started")

    player_ids = _room_player_ids(db, str(room_id))
    game_id, topic_text = _begin_game(db, str(room_id), player_ids, game_number=1)
    return {"status": "debating", "topic": topic_text, "game_id": game_id}


@router.post("/rooms/{room_id}/replay")
@limiter.limit("30/hour")
def replay_game(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host-only "Play again": start a NEW game in the same room. The prior
    game and all its turns/votes/checks are left untouched, so its recap stays
    permanent and immutable (M5). Only the room's current_game_id moves forward.
    """
    db = get_db()
    rooms = (
        db.table("rooms")
        .select("id,status,host_user_id,current_game_id")
        .eq("id", str(room_id))
        .execute()
    )
    if not rooms.data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms.data[0]
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can start a new game")

    current = (
        db.table("games").select("status,game_number").eq("id", room["current_game_id"]).execute()
        if room["current_game_id"]
        else None
    )
    if not current or not current.data or current.data[0]["status"] != "complete":
        raise HTTPException(status_code=409, detail="Finish the current game first")

    player_ids = _room_player_ids(db, str(room_id))
    next_number = current.data[0]["game_number"] + 1
    game_id, topic_text = _begin_game(db, str(room_id), player_ids, game_number=next_number)
    return {"status": "debating", "topic": topic_text, "game_id": game_id}


def _room_player_ids(db, room_id: str) -> list[str]:
    players = db.table("players").select("id").eq("room_id", room_id).execute()
    player_ids = [p["id"] for p in players.data]
    if len(player_ids) < MIN_PLAYERS:
        raise HTTPException(status_code=409, detail=f"Need at least {MIN_PLAYERS} players")
    return player_ids


def _begin_game(db, room_id: str, player_ids: list[str], game_number: int) -> tuple[str, str]:
    """Create a new game: draw a topic, insert the game row, assign per-game
    roles, then point the room at it. Nothing from prior games is modified.
    Returns (game_id, topic_text). The (room_id, game_number) unique constraint
    makes concurrent starts/replays collide instead of double-creating."""
    topic = db.rpc("pick_random_topic").execute()
    if not topic.data:
        raise HTTPException(status_code=503, detail="No topics available")
    topic_text = topic.data[0]["topic_text"] if isinstance(topic.data, list) else topic.data

    game_row = initial_debate_state(utcnow()) | {
        "room_id": room_id,
        "game_number": game_number,
        "topic_text": topic_text,
    }
    try:
        inserted = db.table("games").insert(game_row).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="A game is already starting") from None
        raise
    game_id = inserted.data[0]["id"]

    roles = assign_roles(player_ids)
    db.table("game_players").insert(
        [{"game_id": game_id, "player_id": pid, "role": role} for pid, role in roles.items()]
    ).execute()

    # Point the room at the new game last, so clients that react to the change
    # already see roles and game state in place.
    db.table("rooms").update({"status": "active", "current_game_id": game_id}).eq(
        "id", room_id
    ).execute()
    return game_id, topic_text
