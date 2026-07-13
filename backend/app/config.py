"""Startup configuration. Hard-fails if any required env var is missing (SECURITY.md §1)."""

import sys

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    frontend_origin: str
    perplexity_api_key: str

    # Daily global LLM-call ceiling; breaker trips above this (SECURITY.md §3).
    daily_llm_call_ceiling: int = 200


def load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        missing = ", ".join(str(err["loc"][0]).upper() for err in e.errors())
        print(
            f"FATAL: missing required environment variable(s): {missing}. "
            "Refusing to start (SECURITY.md §1).",
            file=sys.stderr,
        )
        raise SystemExit(1) from e


settings = load_settings()
