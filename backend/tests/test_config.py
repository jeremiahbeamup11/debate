"""SECURITY.md §1: app must hard-fail at startup when required env vars are missing."""

import pytest
from pydantic_settings import SettingsConfigDict

from app.config import Settings, load_settings


def test_boot_fails_with_missing_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FRONTEND_ORIGIN"):
        monkeypatch.delenv(var, raising=False)
    # Point away from the real .env so only process env matters.
    monkeypatch.setattr(
        Settings, "model_config", SettingsConfigDict(env_file=None, extra="ignore")
    )
    with pytest.raises(SystemExit):
        load_settings()


def test_boot_succeeds_with_all_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:3000")
    settings = load_settings()
    assert settings.supabase_url == "https://example.supabase.co"
