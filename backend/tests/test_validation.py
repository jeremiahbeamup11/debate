"""SECURITY.md §5: strict request validation — lengths, extra fields forbidden."""

import pytest
from pydantic import ValidationError

from app.rooms import JoinRoomRequest
from app.words import contains_blocked_word


def test_join_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        JoinRoomRequest.model_validate(
            {"code": "BCDF", "display_name": "sam", "role": "debater_pro"}
        )


def test_join_rejects_oversized_name() -> None:
    with pytest.raises(ValidationError):
        JoinRoomRequest.model_validate({"code": "BCDF", "display_name": "x" * 25})


def test_join_rejects_bad_code_length() -> None:
    with pytest.raises(ValidationError):
        JoinRoomRequest.model_validate({"code": "BCDFG", "display_name": "sam"})


def test_join_rejects_blocked_display_name() -> None:
    with pytest.raises(ValidationError):
        JoinRoomRequest.model_validate({"code": "BCDF", "display_name": "fuck2024"})


def test_join_normalizes_code_case() -> None:
    req = JoinRoomRequest.model_validate({"code": "bcdf", "display_name": "sam"})
    assert req.code == "BCDF"


def test_wordlist() -> None:
    assert contains_blocked_word("you absolute FuCk")
    assert not contains_blocked_word("scunthorpe problem avoided")
