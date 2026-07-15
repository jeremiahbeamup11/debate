"""Startup configuration. Hard-fails if any required env var is missing OR
malformed (SECURITY.md §1).

Presence alone is not enough: a key pasted into a URL field, or a key from the
wrong Supabase project, boots "fine" and then fails every request at runtime as
an opaque 401. These checks turn that class of mistake into a boot-time error
that names the actual problem.
"""

import base64
import binascii
import json
import re
import sys

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPABASE_URL_RE = re.compile(r"^https://([a-z0-9]+)\.supabase\.co/?$")


class ConfigError(Exception):
    """Configuration is present but wrong. Always fatal."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    frontend_origin: str
    perplexity_api_key: str

    # Daily global LLM-call ceiling; breaker trips above this (SECURITY.md §3).
    daily_llm_call_ceiling: int = 200


def _jwt_payload(token: str) -> dict | None:
    """Decode a JWT payload without verifying. Returns None if not a JWT."""
    parts = token.split(".")
    if len(parts) != 3 or not token.startswith("eyJ"):
        return None
    seg = parts[1]
    seg += "=" * (-len(seg) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(seg))
    except (ValueError, binascii.Error):
        return None


def supabase_project_ref(url: str) -> str:
    match = SUPABASE_URL_RE.match(url.strip())
    if not match:
        raise ConfigError(
            f"SUPABASE_URL is not a Supabase project URL: {url[:24]!r}... "
            "Expected https://<project-ref>.supabase.co "
            "(a key pasted into a URL field is the usual cause)."
        )
    return match.group(1)


def validate_settings(s: Settings) -> None:
    """Fail fast on well-formed-but-wrong configuration."""
    ref = supabase_project_ref(s.supabase_url)

    if not s.frontend_origin.startswith(("http://", "https://")):
        raise ConfigError(
            f"FRONTEND_ORIGIN must be a full origin, got {s.frontend_origin[:24]!r}..."
        )
    if s.frontend_origin.endswith("/"):
        raise ConfigError(
            "FRONTEND_ORIGIN must not end with '/' — CORS compares exact origins."
        )

    # Legacy Supabase keys are JWTs carrying their project ref and role, so we
    # can prove the key belongs to the same project the URL points at. Newer
    # sb_secret_/sb_publishable_ keys are opaque; shape-check those instead.
    payload = _jwt_payload(s.supabase_service_role_key)
    if payload is not None:
        key_ref, role = payload.get("ref"), payload.get("role")
        if key_ref != ref:
            raise ConfigError(
                f"SUPABASE_SERVICE_ROLE_KEY belongs to project {key_ref!r} but "
                f"SUPABASE_URL points at {ref!r}. They must be the same project."
            )
        if role != "service_role":
            raise ConfigError(
                f"SUPABASE_SERVICE_ROLE_KEY has role {role!r}, expected 'service_role'. "
                "The anon/publishable key cannot write turns or scores."
            )
    elif s.supabase_service_role_key.startswith("sb_publishable_"):
        raise ConfigError(
            "SUPABASE_SERVICE_ROLE_KEY is a publishable key. The backend needs the "
            "secret service_role key."
        )
    elif not s.supabase_service_role_key.startswith("sb_secret_"):
        raise ConfigError(
            "SUPABASE_SERVICE_ROLE_KEY is neither a legacy service_role JWT nor an "
            "sb_secret_ key."
        )

    if not s.perplexity_api_key.startswith("pplx-"):
        raise ConfigError("PERPLEXITY_API_KEY does not look like a sonar key (expected 'pplx-' prefix).")


def load_settings() -> Settings:
    try:
        s = Settings()
    except ValidationError as e:
        missing = ", ".join(str(err["loc"][0]).upper() for err in e.errors())
        print(
            f"FATAL: missing required environment variable(s): {missing}. "
            "Refusing to start (SECURITY.md §1).",
            file=sys.stderr,
        )
        raise SystemExit(1) from e
    try:
        validate_settings(s)
    except ConfigError as e:
        print(f"FATAL: {e} Refusing to start (SECURITY.md §1).", file=sys.stderr)
        raise SystemExit(1) from e
    print(f"config OK: supabase project={supabase_project_ref(s.supabase_url)}", file=sys.stderr)
    return s


settings = load_settings()
