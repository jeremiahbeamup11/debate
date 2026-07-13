"""Pure game logic: room codes and role assignment. Kept side-effect-free for testing."""

import secrets

# Consonants only, minus ambiguous letters — avoids accidental words and I/O vs 1/0 confusion.
CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"
CODE_LENGTH = 4

MIN_PLAYERS = 3
MAX_PLAYERS = 8


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
