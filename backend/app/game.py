"""Pure game logic: room codes, role assignment, and the debate state machine.
Side-effect-free so the security-critical transitions are unit-testable.

The backend is the source of truth for whose turn it is, timer expiry, round
count, and state transitions (SECURITY.md §6). Deadlines are server timestamps;
clients can only *poke* /advance, never move state themselves.
"""

import secrets
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

# Consonants only, minus ambiguous letters — avoids accidental words and I/O vs 1/0 confusion.
CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"
CODE_LENGTH = 4

MIN_PLAYERS = 3
MAX_PLAYERS = 8

TOTAL_ROUNDS = 3
TURN_SECONDS = 60
VOTE_SECONDS = 20
TURN_CHAR_CAP = 500

# Judge-triggered fact-checks (PROJECT.md "Fact-checking: on-demand"):
# a game mechanic as much as a cost control.
CHECKS_PER_ROUND = 3  # across all judges combined
CHECKS_PER_JUDGE_PER_ROUND = 1
CLAIM_CHAR_CAP = 200
# Submission grace after the deadline (network latency); /advance gets none.
GRACE = timedelta(seconds=2)


class DomainError(Exception):
    """Game-rule violation, mapped to an HTTP status by the endpoint layer."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _deadline(room: Mapping[str, Any]) -> datetime:
    raw = room.get("phase_deadline")
    if not raw:
        raise DomainError(409, "Game is not in a timed phase")
    return parse_ts(raw)


def role_side(role: str | None) -> str | None:
    return {"debater_pro": "pro", "debater_con": "con"}.get(role or "")


def initial_debate_state(now: datetime) -> dict[str, Any]:
    return {
        "status": "debating",
        "current_round": 1,
        "current_turn": "pro",
        "phase_deadline": (now + timedelta(seconds=TURN_SECONDS)).isoformat(),
    }


def check_turn_allowed(room: Mapping[str, Any], role: str | None, now: datetime) -> str:
    """Validate a turn submission; returns the side it will be recorded under."""
    side = role_side(role)
    if side is None:
        raise DomainError(403, "Only debaters can submit turns")
    if room["status"] != "debating":
        raise DomainError(409, "Not accepting turns right now")
    if room["current_turn"] != side:
        raise DomainError(409, "It is not your turn")
    if now > _deadline(room) + GRACE:
        raise DomainError(409, "Time is up for this turn")
    return side


def state_after_turn(room: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    if room["current_turn"] == "pro":
        return {
            "current_turn": "con",
            "phase_deadline": (now + timedelta(seconds=TURN_SECONDS)).isoformat(),
        }
    return {
        "status": "voting",
        "current_turn": None,
        "phase_deadline": (now + timedelta(seconds=VOTE_SECONDS)).isoformat(),
    }


def check_vote_allowed(room: Mapping[str, Any], role: str | None, now: datetime) -> None:
    if role != "judge":
        raise DomainError(403, "Only judges can vote")
    if room["status"] != "voting":
        raise DomainError(409, "Voting is not open")
    if now > _deadline(room) + GRACE:
        raise DomainError(409, "Voting time is up")


def state_after_round_close(room: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    if room["current_round"] >= TOTAL_ROUNDS:
        return {"status": "complete", "current_turn": None, "phase_deadline": None}
    return {
        "status": "debating",
        "current_round": room["current_round"] + 1,
        "current_turn": "pro",
        "phase_deadline": (now + timedelta(seconds=TURN_SECONDS)).isoformat(),
    }


def state_after_advance(room: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    """Advance past an expired deadline (skipped turn or closed voting window).

    Callers can only poke; this refuses unless the server-side deadline has
    truly passed, so nobody can rush a phase.
    """
    if room["status"] not in ("debating", "voting"):
        raise DomainError(409, "Nothing to advance")
    if now <= _deadline(room):
        raise DomainError(409, "Deadline has not passed")
    if room["status"] == "debating":
        return state_after_turn(room, now)
    return state_after_round_close(room, now)


def check_factcheck_allowed(
    room: Mapping[str, Any],
    role: str | None,
    round_checks_total: int,
    judge_checked_this_round: bool,
) -> None:
    """Validate a fact-check request against the server-enforced limits.

    Checks are allowed during both the debating and voting phases of a live
    round (a check is a decision aid), by judges only.
    """
    if role != "judge":
        raise DomainError(403, "Only judges can request fact-checks")
    if room["status"] not in ("debating", "voting"):
        raise DomainError(409, "Fact-checks are only open during a round")
    if judge_checked_this_round:
        raise DomainError(409, "You already used your fact-check this round")
    if round_checks_total >= CHECKS_PER_ROUND:
        raise DomainError(409, "No fact-checks left this round")


def utcnow() -> datetime:
    return datetime.now(UTC)


def generate_room_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def assign_roles(player_ids: list[str]) -> dict[str, str]:
    """Randomly pick 2 debaters (pro/con assigned, not chosen) — everyone else judges."""
    if len(player_ids) < MIN_PLAYERS:
        raise ValueError(f"need at least {MIN_PLAYERS} players")
    shuffled = list(player_ids)
    for i in range(len(shuffled) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
    roles = {shuffled[0]: "debater_pro", shuffled[1]: "debater_con"}
    for pid in shuffled[2:]:
        roles[pid] = "judge"
    return roles
