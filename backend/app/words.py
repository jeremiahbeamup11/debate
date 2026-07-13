"""Minimal profanity/slur wordlist (SECURITY.md §8). MVP-grade, expand post-MVP."""

import re

_BLOCKED = {
    "fuck",
    "shit",
    "cunt",
    "nigger",
    "nigga",
    "faggot",
    "kike",
    "spic",
    "chink",
    "tranny",
    "retard",
    "whore",
    "slut",
}

_WORD_RE = re.compile(r"[a-z]+")


def contains_blocked_word(text: str) -> bool:
    words = set(_WORD_RE.findall(text.lower()))
    return not words.isdisjoint(_BLOCKED)
