"""Room lifecycle endpoints. All writes go through the service role here —
clients are read-only via RLS (SECURITY.md §4, §6).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
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

    players = db.table("players").select("id").eq("room_id", str(room_id)).execute()
    player_ids = [p["id"] for p in players.data]
    if len(player_ids) < MIN_PLAYERS:
        raise HTTPException(
            status_code=409, detail=f"Need at least {MIN_PLAYERS} players to start"
        )

    topic_text = _begin_game(db, str(room_id), player_ids, from_status="lobby")
    return {"status": "debating", "topic": topic_text}


def _begin_game(db, room_id: str, player_ids: list[str], from_status: str) -> str:
    """Draw a topic, reshuffle roles, and flip the room into a fresh round 1.

    Roles are written before the status flip so clients reacting to the game
    starting already see them. The status compare-and-swap guards against a
    double-start / double-replay race.
    """
    topic = db.rpc("pick_random_topic").execute()
    if not topic.data:
        raise HTTPException(status_code=503, detail="No topics available")
    topic_text = topic.data[0]["topic_text"] if isinstance(topic.data, list) else topic.data

    roles = assign_roles(player_ids)
    for pid, role in roles.items():
        db.table("players").update({"role": role}).eq("id", pid).execute()
    new_state = initial_debate_state(utcnow()) | {
        "topic_text": topic_text,
        "reroll_used": False,
    }
    db.table("rooms").update(new_state).eq("id", room_id).eq("status", from_status).execute()
    return topic_text


@router.post("/rooms/{room_id}/replay")
@limiter.limit("30/hour")
def replay_game(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host-only "Play again": reshuffle debaters in the SAME room for a fresh
    game. Clears the prior game's turns/votes/checks (their unique keys would
    otherwise collide on reused round numbers). The prior recap is overwritten —
    a permanent per-game archive would need a separate games table (deferred)."""
    db = get_db()
    rooms = (
        db.table("rooms").select("id,status,host_user_id").eq("id", str(room_id)).execute()
    )
    if not rooms.data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms.data[0]
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can start a new game")
    if room["status"] != "complete":
        raise HTTPException(status_code=409, detail="Finish the current game first")

    players = db.table("players").select("id").eq("room_id", str(room_id)).execute()
    player_ids = [p["id"] for p in players.data]
    if len(player_ids) < MIN_PLAYERS:
        raise HTTPException(status_code=409, detail=f"Need at least {MIN_PLAYERS} players")

    for table in ("checks", "votes", "turns"):
        db.table(table).delete().eq("room_id", str(room_id)).execute()
    topic_text = _begin_game(db, str(room_id), player_ids, from_status="complete")
    return {"status": "debating", "topic": topic_text}
