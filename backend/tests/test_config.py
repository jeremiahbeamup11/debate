"""SECURITY.md §1: the app must hard-fail at startup on missing OR malformed config."""

import base64
import json

import pytest
from pydantic_settings import SettingsConfigDict

from app import config
from app.config import ConfigError, Settings, load_settings, supabase_project_ref, validate_settings

REQUIRED = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FRONTEND_ORIGIN", "PERPLEXITY_API_KEY")


def fake_key(ref: str = "example", role: str = "service_role") -> str:
    """A structurally valid (unsigned) Supabase-style JWT for tests."""
    payload = base64.urlsafe_b64encode(
        json.dumps({"iss": "supabase", "ref": ref, "role": role}).encode()
    ).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{payload}.sig"


def make(**overrides: str) -> Settings:
    values = {
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": fake_key(),
        "frontend_origin": "https://app.example.com",
        "perplexity_api_key": "pplx-test",
    }
    values.update(overrides)
    return Settings.model_construct(**values)


def test_boot_fails_with_missing_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in REQUIRED:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(
        Settings, "model_config", SettingsConfigDict(env_file=None, extra="ignore")
    )
    with pytest.raises(SystemExit):
        load_settings()


def test_boot_succeeds_with_valid_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", fake_key())
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("PERPLEXITY_API_KEY", "pplx-test")
    # Stub the live credential probe — unit tests must not hit the network.
    monkeypatch.setattr(config, "verify_supabase_credentials", lambda s: None)
    settings = load_settings()
    assert settings.supabase_url == "https://example.supabase.co"


# --- live credential probe (catches a right-shaped but invalid key) ----------


class _Resp:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


def test_live_probe_fatal_when_key_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.httpx, "get", lambda *a, **k: _Resp(401))
    with pytest.raises(ConfigError, match="rejected by Supabase"):
        config.verify_supabase_credentials(make())


def test_live_probe_passes_when_key_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.httpx, "get", lambda *a, **k: _Resp(200))
    config.verify_supabase_credentials(make())


def test_live_probe_tolerates_network_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: object, **k: object) -> None:
        raise config.httpx.ConnectError("no route")

    monkeypatch.setattr(config.httpx, "get", boom)
    config.verify_supabase_credentials(make())  # must not raise — transient blip


# --- URL shape --------------------------------------------------------------


def test_key_pasted_into_url_field_rejected() -> None:
    with pytest.raises(ConfigError, match="not a Supabase project URL"):
        validate_settings(make(supabase_url="sb_publishable_abc123"))


def test_non_supabase_url_rejected() -> None:
    with pytest.raises(ConfigError):
        validate_settings(make(supabase_url="https://debate-night.onrender.com"))


def test_project_ref_extracted() -> None:
    assert supabase_project_ref("https://abcdef.supabase.co") == "abcdef"
    assert supabase_project_ref("https://abcdef.supabase.co/") == "abcdef"


# --- key/URL project agreement (the real deploy bug) ------------------------


def test_service_key_from_wrong_project_rejected() -> None:
    with pytest.raises(ConfigError, match="belongs to project"):
        validate_settings(make(supabase_service_role_key=fake_key(ref="otherproject")))


def test_anon_key_where_service_role_required_rejected() -> None:
    with pytest.raises(ConfigError, match="role 'anon'"):
        validate_settings(make(supabase_service_role_key=fake_key(role="anon")))


def test_publishable_key_rejected() -> None:
    with pytest.raises(ConfigError, match="publishable key"):
        validate_settings(make(supabase_service_role_key="sb_publishable_abc"))


def test_new_style_secret_key_accepted() -> None:
    # Opaque sb_secret_ keys can't be ref-checked; shape check only.
    validate_settings(make(supabase_service_role_key="sb_secret_abc123"))


def test_garbage_key_rejected() -> None:
    with pytest.raises(ConfigError):
        validate_settings(make(supabase_service_role_key="hunter2"))


# --- origin / perplexity ----------------------------------------------------


def test_frontend_origin_trailing_slash_rejected() -> None:
    with pytest.raises(ConfigError, match="must not end with"):
        validate_settings(make(frontend_origin="https://app.example.com/"))


def test_frontend_origin_without_scheme_rejected() -> None:
    with pytest.raises(ConfigError, match="full origin"):
        validate_settings(make(frontend_origin="app.example.com"))


def test_frontend_origin_comma_separated_allowlist() -> None:
    s = make(frontend_origin="https://debate.truthcore.ai, https://debate-livid.vercel.app")
    validate_settings(s)  # both valid → no raise
    assert s.frontend_origins == [
        "https://debate.truthcore.ai",
        "https://debate-livid.vercel.app",
    ]


def test_frontend_origin_rejects_bad_entry_in_list() -> None:
    with pytest.raises(ConfigError):
        validate_settings(make(frontend_origin="https://ok.example.com,app.example.com"))


def test_bad_perplexity_key_rejected() -> None:
    with pytest.raises(ConfigError, match="sonar key"):
        validate_settings(make(perplexity_api_key="sk-wrongprovider"))


def test_valid_config_passes() -> None:
    validate_settings(make())
