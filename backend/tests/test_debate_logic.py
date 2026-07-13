"""SECURITY.md §3/§6: server-enforced turn order, timer expiry, round caps."""

from datetime import UTC, datetime, timedelta

import pytest

from app.debate import TurnRequest
from app.game import (
    GRACE,
    DomainError,
    check_turn_allowed,
    check_vote_allowed,
    initial_debate_state,
    state_after_advance,
    state_after_round_close,
    state_after_turn,
)
from pydantic import ValidationError

NOW = datetime(2026, 7, 13, 12, 0, 0, tzinfo=UTC)


def room(**overrides: object) -> dict:
    base: dict = {
        "id": "r1",
        "status": "debating",
        "current_round": 1,
        "current_turn": "pro",
        "phase_deadline": (NOW + timedelta(seconds=60)).isoformat(),
    }
    return base | overrides


# --- turn order -------------------------------------------------------------


def test_correct_debater_may_submit() -> None:
    assert check_turn_allowed(room(), "debater_pro", NOW) == "pro"


def test_out_of_turn_rejected() -> None:
    with pytest.raises(DomainError) as e:
        check_turn_allowed(room(), "debater_con", NOW)
    assert e.value.status_code == 409


def test_judge_cannot_submit_turn() -> None:
    with pytest.raises(DomainError) as e:
        check_turn_allowed(room(), "judge", NOW)
    assert e.value.status_code == 403


def test_no_turns_outside_debating() -> None:
    for status in ("lobby", "voting", "complete"):
        with pytest.raises(DomainError):
            check_turn_allowed(room(status=status), "debater_pro", NOW)


def test_turn_after_deadline_rejected() -> None:
    late = NOW + timedelta(seconds=60) + GRACE + timedelta(seconds=1)
    with pytest.raises(DomainError) as e:
        check_turn_allowed(room(), "debater_pro", late)
    assert e.value.status_code == 409


def test_turn_within_grace_allowed() -> None:
    just_late = NOW + timedelta(seconds=60) + timedelta(seconds=1)
    assert check_turn_allowed(room(), "debater_pro", just_late) == "pro"


# --- transitions ------------------------------------------------------------


def test_pro_turn_passes_to_con() -> None:
    state = state_after_turn(room(current_turn="pro"), NOW)
    assert state["current_turn"] == "con"


def test_con_turn_opens_voting() -> None:
    state = state_after_turn(room(current_turn="con"), NOW)
    assert state["status"] == "voting"
    assert state["current_turn"] is None


def test_round_close_advances_round() -> None:
    state = state_after_round_close(room(status="voting", current_round=1), NOW)
    assert state == {
        "status": "debating",
        "current_round": 2,
        "current_turn": "pro",
        "phase_deadline": state["phase_deadline"],
    }


def test_round_three_close_completes_game() -> None:
    state = state_after_round_close(room(status="voting", current_round=3), NOW)
    assert state["status"] == "complete"
    assert state["phase_deadline"] is None


def test_initial_state_is_round_one_pro() -> None:
    state = initial_debate_state(NOW)
    assert (state["status"], state["current_round"], state["current_turn"]) == (
        "debating",
        1,
        "pro",
    )


# --- advance (timer expiry) --------------------------------------------------


def test_advance_before_deadline_refused() -> None:
    with pytest.raises(DomainError) as e:
        state_after_advance(room(), NOW)
    assert e.value.status_code == 409


def test_advance_skips_expired_pro_turn() -> None:
    late = NOW + timedelta(seconds=61)
    state = state_after_advance(room(current_turn="pro"), late)
    assert state["current_turn"] == "con"


def test_advance_closes_expired_voting() -> None:
    late = NOW + timedelta(seconds=61)
    state = state_after_advance(room(status="voting", current_round=2), late)
    assert (state["status"], state["current_round"]) == ("debating", 3)


def test_advance_refused_when_complete() -> None:
    with pytest.raises(DomainError):
        state_after_advance(room(status="complete"), NOW)


# --- votes ------------------------------------------------------------------


def test_only_judges_vote() -> None:
    with pytest.raises(DomainError) as e:
        check_vote_allowed(room(status="voting"), "debater_pro", NOW)
    assert e.value.status_code == 403


def test_vote_outside_voting_rejected() -> None:
    with pytest.raises(DomainError):
        check_vote_allowed(room(status="debating"), "judge", NOW)


def test_vote_after_deadline_rejected() -> None:
    late = NOW + timedelta(seconds=60) + GRACE + timedelta(seconds=1)
    with pytest.raises(DomainError):
        check_vote_allowed(room(status="voting"), "judge", late)


# --- char caps (SECURITY.md §3/§5) -------------------------------------------


def test_turn_char_cap_enforced() -> None:
    with pytest.raises(ValidationError):
        TurnRequest.model_validate({"content": "x" * 501})
    assert TurnRequest.model_validate({"content": "x" * 500}).content


def test_turn_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        TurnRequest.model_validate({"content": "hi", "side": "pro"})


def test_empty_turn_rejected() -> None:
    with pytest.raises(ValidationError):
        TurnRequest.model_validate({"content": ""})
