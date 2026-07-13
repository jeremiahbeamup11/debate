"""Debate-loop endpoints. Turn author and vote author always come from the
authenticated JWT (SECURITY.md §6); all state transitions are validated by the
pure logic in game.py and written under compare-and-swap conditions so races
can't double-apply.
"""

import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_current_user_id
from app.db import get_db
from app.game import (
    TURN_CHAR_CAP,
    DomainError,
    check_turn_allowed,
    check_vote_allowed,
    state_after_advance,
    state_after_round_close,
    state_after_turn,
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


def _get_room(db: Any, room_id: UUID) -> dict:
    rows = (
        db.table("rooms")
        .select("id,status,host_user_id,current_round,current_turn,phase_deadline,reroll_used")
        .eq("id", str(room_id))
        .execute()
    )
    if not rows.data:
        raise HTTPException(status_code=404, detail="Room not found")
    return rows.data[0]


def _get_player(db: Any, room_id: UUID, user_id: str) -> dict | None:
    rows = (
        db.table("players")
        .select("id,role")
        .eq("room_id", str(room_id))
        .eq("auth_user_id", user_id)
        .execute()
    )
    return rows.data[0] if rows.data else None


def _apply_room_state(db: Any, room: dict, new_state: dict) -> bool:
    """Compare-and-swap the room's phase; returns False if state already moved."""
    result = (
        db.table("rooms")
        .update(new_state)
        .eq("id", room["id"])
        .eq("status", room["status"])
        .eq("current_round", room["current_round"])
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
    now = utcnow()
    try:
        side = check_turn_allowed(room, player["role"], now)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    if contains_blocked_word(body.content):
        raise HTTPException(status_code=422, detail="Keep it clean — try rewording that")
    try:
        db.table("turns").insert(
            {
                "room_id": room["id"],
                "player_id": player["id"],
                "round_number": room["current_round"],
                "side": side,
                "content": body.content,
            }
        ).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status_code=409, detail="Turn already submitted") from None
        raise
    _apply_room_state(db, room, state_after_turn(room, now))
    return {"ok": True, "round": room["current_round"], "side": side}


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
    now = utcnow()
    try:
        check_vote_allowed(room, player["role"], now)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    try:
        db.table("votes").insert(
            {
                "room_id": room["id"],
                "judge_player_id": player["id"],
                "round_number": room["current_round"],
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
        .eq("room_id", room["id"])
        .eq("round_number", room["current_round"])
        .execute()
    )
    judges = (
        db.table("players").select("id").eq("room_id", room["id"]).eq("role", "judge").execute()
    )
    if len(votes.data) >= len(judges.data):
        _apply_room_state(db, room, state_after_round_close(room, now))
    return {"ok": True, "round": room["current_round"]}


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
    try:
        new_state = state_after_advance(room, utcnow())
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None
    _apply_room_state(db, room, new_state)
    return {"ok": True}


@router.post("/rooms/{room_id}/reroll")
@limiter.limit("10/hour")
def reroll_topic(
    request: Request,
    room_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    """Host may redraw the topic once per game, before any turn is submitted."""
    db = get_db()
    room = _get_room(db, room_id)
    if room["host_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the host can re-roll")
    if room["reroll_used"]:
        raise HTTPException(status_code=409, detail="Re-roll already used")
    if not (
        room["status"] == "debating"
        and room["current_round"] == 1
        and room["current_turn"] == "pro"
    ):
        raise HTTPException(status_code=409, detail="Too late to re-roll")
    turns = db.table("turns").select("id").eq("room_id", room["id"]).limit(1).execute()
    if turns.data:
        raise HTTPException(status_code=409, detail="Too late to re-roll")

    topic = db.rpc("pick_random_topic").execute()
    if not topic.data:
        raise HTTPException(status_code=503, detail="No topics available")
    topic_text = topic.data[0]["topic_text"] if isinstance(topic.data, list) else topic.data
    result = (
        db.table("rooms")
        .update({"topic_text": topic_text, "reroll_used": True})
        .eq("id", room["id"])
        .eq("reroll_used", False)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=409, detail="Re-roll already used")
    return {"topic": topic_text}
