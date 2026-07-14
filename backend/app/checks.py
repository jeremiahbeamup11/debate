"""Judge-triggered fact-check endpoint (M3).

Server-enforced limits (PROJECT.md + SECURITY.md §3):
- judges only; only during a live round (debating or voting);
- 1 check per judge per round (DB unique constraint, race-proof);
- 3 checks per round across all judges (counted, compensating delete on overflow);
- 1 Perplexity call per check row (idempotent: the unique constraint blocks a
  judge's retry from creating a second row, so no second call);
- daily global spend circuit breaker over the llm_calls ledger.

The Perplexity call runs in a background task so the request returns immediately
with a 'pending' card; the Main Screen and phones see pending -> done via
realtime. The debate timer is never blocked.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth import get_current_user_id
from app.config import settings
from app.db import get_db
from app.factcheck import CLAIM_CHAR_CAP, fact_check, sanitize_claim
from app.game import CHECKS_PER_ROUND, DomainError, check_factcheck_allowed
from app.limits import limiter

logger = logging.getLogger("app.checks")

router = APIRouter()


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim: str = Field(min_length=1, max_length=CLAIM_CHAR_CAP)

    @field_validator("claim")
    @classmethod
    def clean_claim(cls, v: str) -> str:
        cleaned = sanitize_claim(v)
        if not cleaned:
            raise ValueError("claim is empty")
        return cleaned


def _start_of_utc_day() -> str:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _breaker_tripped(db: Any) -> bool:
    today = (
        db.table("llm_calls")
        .select("id", count="exact")
        .gte("created_at", _start_of_utc_day())
        .execute()
    )
    count = today.count if today.count is not None else len(today.data)
    return count >= settings.daily_llm_call_ceiling


def _run_check(check_id: str, claim: str) -> None:
    """Background: call Perplexity once and write the verdict onto the check row."""
    db = get_db()
    verdict = fact_check(claim)
    if verdict is None:
        db.table("checks").update({"status": "failed"}).eq("id", check_id).execute()
        return
    db.table("checks").update(
        {
            "status": "done",
            "verdict": verdict.verdict,
            "explanation": verdict.explanation,
            "source_url": verdict.source_url,
        }
    ).eq("id", check_id).execute()


@router.post("/rooms/{room_id}/checks", status_code=201)
@limiter.limit("20/minute")
def request_check(
    request: Request,
    room_id: UUID,
    body: CheckRequest,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    db = get_db()
    rooms = (
        db.table("rooms").select("id,current_game_id").eq("id", str(room_id)).execute()
    )
    if not rooms.data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms.data[0]
    if not room["current_game_id"]:
        raise HTTPException(status_code=409, detail="No game in progress")
    games = (
        db.table("games")
        .select("id,status,current_round")
        .eq("id", room["current_game_id"])
        .execute()
    )
    if not games.data:
        raise HTTPException(status_code=409, detail="No game in progress")
    game = games.data[0]

    players = (
        db.table("players")
        .select("id")
        .eq("room_id", str(room_id))
        .eq("auth_user_id", user_id)
        .execute()
    )
    if not players.data:
        raise HTTPException(status_code=403, detail="You are not in this room")
    player = players.data[0]
    role_rows = (
        db.table("game_players")
        .select("role")
        .eq("game_id", game["id"])
        .eq("player_id", player["id"])
        .execute()
    )
    role = role_rows.data[0]["role"] if role_rows.data else None
    round_number = game["current_round"]

    existing = (
        db.table("checks")
        .select("id,judge_player_id")
        .eq("game_id", game["id"])
        .eq("round_number", round_number)
        .execute()
    )
    round_total = len(existing.data)
    judge_checked = any(c["judge_player_id"] == player["id"] for c in existing.data)

    try:
        check_factcheck_allowed(game, role, round_total, judge_checked)
    except DomainError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from None

    # Spend breaker: refuse before creating a row or spending anything (§3).
    if _breaker_tripped(db):
        logger.warning("daily LLM circuit breaker tripped; refusing check")
        raise HTTPException(status_code=503, detail="TruthCore is at capacity — try later")

    # Insert pending row. The (game, round, judge) unique constraint makes the
    # per-judge limit race-proof; a retry lands here as 23505.
    try:
        inserted = (
            db.table("checks")
            .insert(
                {
                    "game_id": game["id"],
                    "room_id": room["id"],
                    "round_number": round_number,
                    "judge_player_id": player["id"],
                    "claim": body.claim,
                    "status": "pending",
                }
            )
            .execute()
        )
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(
                status_code=409, detail="You already used your fact-check this round"
            ) from None
        raise
    check_id = inserted.data[0]["id"]

    # Compensating guard for the per-round cap under concurrency: if our insert
    # pushed the round over the limit, roll it back and reject.
    after = (
        db.table("checks")
        .select("id,created_at")
        .eq("game_id", game["id"])
        .eq("round_number", round_number)
        .order("created_at")
        .execute()
    )
    if len(after.data) > CHECKS_PER_ROUND:
        allowed_ids = {row["id"] for row in after.data[:CHECKS_PER_ROUND]}
        if check_id not in allowed_ids:
            db.table("checks").delete().eq("id", check_id).execute()
            raise HTTPException(status_code=409, detail="No fact-checks left this round")

    # Committed to spending: record the ledger row (before the call, so a crash
    # over-counts rather than under-counts the breaker), then run the call.
    db.table("llm_calls").insert({"kind": "factcheck"}).execute()
    background.add_task(_run_check, check_id, body.claim)

    remaining = max(0, CHECKS_PER_ROUND - len(after.data))
    return {"check_id": check_id, "status": "pending", "remaining_this_round": remaining}
