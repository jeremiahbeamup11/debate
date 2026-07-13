import pytest

from app.game import CODE_ALPHABET, assign_roles, generate_room_code


def test_room_code_shape() -> None:
    for _ in range(50):
        code = generate_room_code()
        assert len(code) == 4
        assert all(c in CODE_ALPHABET for c in code)


@pytest.mark.parametrize("n", [3, 4, 8])
def test_assign_roles(n: int) -> None:
    players = [f"p{i}" for i in range(n)]
    roles = assign_roles(players)
    assert set(roles) == set(players)
    values = list(roles.values())
    assert values.count("debater_pro") == 1
    assert values.count("debater_con") == 1
    assert values.count("judge") == n - 2


def test_assign_roles_rejects_too_few() -> None:
    with pytest.raises(ValueError):
        assign_roles(["p1", "p2"])
