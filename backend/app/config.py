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

import httpx
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPABASE_URL_RE = re.compile(r"^https://([a-z0-9]+)\.supabase\.co/?$")


class ConfigError(Exception):
    """Configuration is present but wrong. Always fatal."""


class Settings(BaseSettings):
    # str_strip_whitespace: a stray space/newline from a dashboard paste would
    # otherwise travel into an auth header and produce an opaque 401.
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", str_strip_whitespace=True
    )

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

    if any(c.isspace() for c in s.supabase_service_role_key):
        raise ConfigError("SUPABASE_SERVICE_ROLE_KEY contains whitespace — check the paste.")

    if not s.perplexity_api_key.startswith("pplx-"):
        raise ConfigError("PERPLEXITY_API_KEY does not look like a sonar key (expected 'pplx-' prefix).")


def verify_supabase_credentials(s: Settings) -> None:
    """Prove the service_role key is actually accepted by Supabase.

    Shape checks can't distinguish a valid key from one that is truncated,
    rotated, or re-signed — those decode fine and then 401 on every request.
    A 401/403 here is fatal: the deploy is misconfigured and must not serve.
    Network failures are NOT fatal; we don't want a transient Supabase blip to
    prevent boot.
    """
    try:
        resp = httpx.get(
            f"{s.supabase_url}/rest/v1/topics",
            params={"select": "id", "limit": 1},
            headers={
                "apikey": s.supabase_service_role_key,
                "Authorization": f"Bearer {s.supabase_service_role_key}",
            },
            timeout=15,
        )
    except httpx.HTTPError as e:
        print(
            f"WARNING: could not reach Supabase to verify credentials ({type(e).__name__}). "
            "Continuing; requests may fail.",
            file=sys.stderr,
        )
        return
    if resp.status_code in (401, 403):
        raise ConfigError(
            f"SUPABASE_SERVICE_ROLE_KEY was rejected by Supabase ({resp.status_code}) for "
            f"project {supabase_project_ref(s.supabase_url)!r}. The key has the right shape, "
            "so it is likely truncated, rotated, or re-signed — copy it again from "
            "Settings > API Keys > service_role."
        )
    if resp.status_code != 200:
        print(
            f"WARNING: Supabase credential check returned {resp.status_code}.",
            file=sys.stderr,
        )
        return
    print("config OK: service_role key verified against Supabase", file=sys.stderr)


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
        print(
            f"config OK: supabase project={supabase_project_ref(s.supabase_url)}",
            file=sys.stderr,
        )
        verify_supabase_credentials(s)
    except ConfigError as e:
        print(f"FATAL: {e} Refusing to start (SECURITY.md §1).", file=sys.stderr)
        raise SystemExit(1) from e
    return s


settings = load_settings()
