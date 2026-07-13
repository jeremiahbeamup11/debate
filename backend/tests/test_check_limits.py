"""SECURITY.md §3 / PROJECT.md: server-enforced fact-check limits (pure logic)."""

import pytest

from app.checks import CheckRequest
from app.factcheck import CLAIM_CHAR_CAP
from app.game import (
    CHECKS_PER_ROUND,
    DomainError,
    check_factcheck_allowed,
)
from pydantic import ValidationError


def room(status: str = "debating") -> dict:
    return {"id": "r1", "status": status, "current_round": 1}


def test_judge_first_check_allowed() -> None:
    check_factcheck_allowed(room(), "judge", round_checks_total=0, judge_checked_this_round=False)


def test_non_judge_rejected() -> None:
    for role in ("debater_pro", "debater_con", None):
        with pytest.raises(DomainError) as e:
            check_factcheck_allowed(room(), role, 0, False)
        assert e.value.status_code == 403


def test_second_check_same_judge_rejected() -> None:
    with pytest.raises(DomainError) as e:
        check_factcheck_allowed(room(), "judge", round_checks_total=1, judge_checked_this_round=True)
    assert e.value.status_code == 409


def test_fourth_check_in_round_rejected() -> None:
    with pytest.raises(DomainError) as e:
        check_factcheck_allowed(
            room(), "judge", round_checks_total=CHECKS_PER_ROUND, judge_checked_this_round=False
        )
    assert e.value.status_code == 409


def test_checks_allowed_during_voting() -> None:
    check_factcheck_allowed(room("voting"), "judge", 0, False)


def test_checks_rejected_outside_live_round() -> None:
    for status in ("lobby", "complete"):
        with pytest.raises(DomainError):
            check_factcheck_allowed(room(status), "judge", 0, False)


# --- request validation -----------------------------------------------------


def test_claim_char_cap() -> None:
    with pytest.raises(ValidationError):
        CheckRequest.model_validate({"claim": "x" * (CLAIM_CHAR_CAP + 1)})
    assert CheckRequest.model_validate({"claim": "x" * CLAIM_CHAR_CAP}).claim


def test_claim_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        CheckRequest.model_validate({"claim": "hi", "verdict": "True"})


def test_claim_rejects_empty_after_sanitize() -> None:
    with pytest.raises(ValidationError):
        CheckRequest.model_validate({"claim": "   "})
