"""Debate-loop endpoints. Turn/vote author always comes from the authenticated
JWT (SECURITY.md §6); state transitions are validated by the pure logic in
game.py and written under compare-and-swap so races can't double-apply.

Endpoints are addressed by room, but all game state lives on the room's current
game (M5). Per-game roles come from game_players.
"""

import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth import get_current_user_id
from app.db import get_db
from app.game import (
    TOPIC_CHAR_CAP,
    TURN_CHAR_CAP,
    DomainError,
    check_turn_allowed,
    check_vote_allowed,
    state_after_advance,
    state_after_round_close,
    state_after_turn,
    state_to_debating,
    utcnow,
)
from app.limits import limiter
from app.words import contains_blocked_word

logger = logging.getLogger("app.debate")

router = APIRouter()


class TurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=TURN_CHAR_CAP)


class VoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vote: Literal["pro", "con"]


class TopicRequest(BaseModel):
    """Host-typed custom topic — user text, so §5/§8 apply: capped, filtered,
    and only ever rendered as plain text."""

    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=1, max_length=TOPIC_CHAR_CAP)

    @field_validator("topic")
    @classmethod
    def clean_topic(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("topic is empty")
        if contains_blocked_word(v):
            raise ValueError("topic not allowed")
        return v


def _get_room(db: Any, room_id: UUID) -> dict:
    rows = (
        db.table("rooms")
        .select("id,status,host_user_id,current_game_id")
        .eq("id", str(room_id))
        .execute()
    )
    if not rows.data:
        raise HTTPException(status_code=404, detail="Room not found")
    return rows.data[0]


def _get_current_game(db: Any, room: dict) -> dict:
    if not room["current_game_id"]:
        raise HTTPException(status_code=409, detail="No game in progress")
    rows = (
        db.table("games")
        .select("id,room_id,status,current_round,current_turn,phase_deadline,reroll_used")
        .eq("id", room["current_game_id"])
        .execute()
    )
    if not rows.data:
        raise HTTPException(status_code=409, detail="No game in progress")
    return rows.data[0]


def _get_player(db: Any, room_id: UUID, user_id: str) -> dict | None:
    rows = (
        db.table("players")
        .select("id")
        .eq("room_id", str(room_id))
        .eq("auth_user_id", user_id)
        .execute()
    )
    return rows.data[0] if rows.data else None


def _get_role(db: Any, game_id: str, player_id: str) -> str | None:
    rows = (
        db.table("game_players")
        .select("role")
        .eq("game_id", game_id)
        .eq("player_id", player_id)
        .execute()
    )
    return rows.data[0]["role"] if rows.data else None


def _apply_game_state(db: Any, game: dict, new_state: dict) -> bool:
    """Compare-and-swap the game's phase; returns False if state already moved.
    Stamps completed_at when the game reaches 'complete'."""
    if new_state.get("status") == "complete" and "completed_at" not in new_state:
        new_state = new_state | {"completed_at": utcnow().isoformat()}
    result = (
        db.table("games")
        .update(new_state)
        .eq("id", game["id"])
        .eq("status", game["status"])
        .eq("current_round", game["current_round"])
        .execute()
    )
    return bool(result.data)


@router.post("/rooms/{room_id}/turns", status_code=201)
@limiter.limit("30/minute")
def submit_turn(
    request: Request,
    room_id: UUID,
    body: TurnRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    db = get_db()
    room = _get_room(db, room_id)
    player = _get_player(db, room_id, user_id)
    if player is None:
        raise HTTPException(status_code=403, detail="You are not in this room")
    game = _get_current_game(db, room)
    role = _get_role(db, game["id"], player["id"])
    now = utcnow()
    try:
        side = check_turn_allowed(game, role, now)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    if contains_blocked_word(body.content):
        raise HTTPException(status_code=422, detail="Keep it clean — try rewording that")
    try:
        db.table("turns").insert(
            {
                "game_id": game["id"],
                "room_id": room["id"],
                "player_id": player["id"],
                "round_number": game["current_round"],
                "side": side,
                "content": body.content,
            }
        ).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="Turn already submitted") from None
        raise
    _apply_game_state(db, game, state_after_turn(game, now))
    return {"ok": True, "round": game["current_round"], "side": side}


@router.post("/rooms/{room_id}/votes", status_code=201)
@limiter.limit("30/minute")
def submit_vote(
    request: Request,
    room_id: UUID,
    body: VoteRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    db = get_db()
    room = _get_room(db, room_id)
    player = _get_player(db, room_id, user_id)
    if player is None:
        raise HTTPException(status_code=403, detail="You are not in this room")
    game = _get_current_game(db, room)
    role = _get_role(db, game["id"], player["id"])
    now = utcnow()
    try:
        check_vote_allowed(game, role, now)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    try:
        db.table("votes").insert(
            {
                "game_id": game["id"],
                "room_id": room["id"],
                "judge_player_id": player["id"],
                "round_number": game["current_round"],
                "vote": body.vote,
            }
        ).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="You already voted this round") from None
        raise

    # Close the round early once every judge has voted.
    votes = (
        db.table("votes")
        .select("id")
        .eq("game_id", game["id"])
        .eq("round_number", game["current_round"])
        .execute()
    )
    judges = (
        db.table("game_players")
        .select("id")
        .eq("game_id", game["id"])
        .eq("role", "judge")
        .execute()
    )
    if len(votes.data) >= len(judges.data):
        _apply_game_state(db, game, state_after_round_close(game, now))
    return {"ok": True, "round": game["current_round"]}


@router.post("/rooms/{room_id}/advance")
def advance(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Poke past an expired deadline. Any room member may call; the server
    clock decides, so this can never rush a phase (SECURITY.md §6)."""
    db = get_db()
    room = _get_room(db, room_id)
    player = _get_player(db, room_id, user_id)
    if player is None and room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="You are not in this room")
    game = _get_current_game(db, room)
    try:
        new_state = state_after_advance(game, utcnow())
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    _apply_game_state(db, game, new_state)
    return {"ok": True}


@router.post("/rooms/{room_id}/begin")
@limiter.limit("30/minute")
def begin_debate(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host skips the rest of the topic-reveal window and opens round 1."""
    db = get_db()
    room = _get_room(db, room_id)
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can start the debate")
    game = _get_current_game(db, room)
    if game["status"] != "topic":
        raise HTTPException(status_code=409, detail="The debate has already started")
    _apply_game_state(db, game, state_to_debating(utcnow()))
    return {"ok": True}


@router.post("/rooms/{room_id}/topic")
@limiter.limit("30/minute")
def set_custom_topic(
    request: Request,
    room_id: UUID,
    body: TopicRequest,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host replaces the drawn topic with their own, during the topic phase only."""
    db = get_db()
    room = _get_room(db, room_id)
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can set the topic")
    game = _get_current_game(db, room)
    if game["status"] != "topic":
        raise HTTPException(status_code=409, detail="Too late to change the topic")
    result = (
        db.table("games")
        .update({"topic_text": body.topic})
        .eq("id", game["id"])
        .eq("status", "topic")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=409, detail="Too late to change the topic")
    return {"topic": body.topic}


@router.post("/rooms/{room_id}/reroll")
@limiter.limit("10/hour")
def reroll_topic(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host may redraw the topic once per game, during the topic phase."""
    db = get_db()
    room = _get_room(db, room_id)
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can re-roll")
    game = _get_current_game(db, room)
    if game["reroll_used"]:
        raise HTTPException(status_code=409, detail="Re-roll already used")
    if game["status"] != "topic":
        raise HTTPException(status_code=409, detail="Too late to re-roll")

    topic = db.rpc("pick_random_topic").execute()
    if not topic.data:
        raise HTTPException(status_code=503, detail="No topics available")
    topic_text = topic.data[0]["topic_text"] if isinstance(topic.data, list) else topic.data
    result = (
        db.table("games")
        .update({"topic_text": topic_text, "reroll_used": True})
        .eq("id", game["id"])
        .eq("reroll_used", False)
        .eq("status", "topic")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=409, detail="Re-roll already used")
    return {"topic": topic_text}
