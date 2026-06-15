"""/api/v1/access-rules — the configurable allowlist + the role-resolution logic
(exact email beats domain, then bootstrap admins)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.access import normalize_pattern
from api.auth import _role_for_email
from .conftest import FakePool

RULE = {
    "id": "22222222-2222-2222-2222-222222222222",
    "pattern": "@noisedigital.com",
    "kind": "domain",
    "role": "member",
    "is_active": True,
    "note": None,
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
}


def test_normalize_pattern() -> None:
    assert normalize_pattern("@Example.com") == ("@example.com", "domain")
    assert normalize_pattern(" Jane@Example.com ") == ("jane@example.com", "email")
    for bad in ["nope", "@nodot", "a@b"]:
        with pytest.raises(ValueError):
            normalize_pattern(bad)


def test_list_rules(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool._rows = [RULE]
    res = client.get("/api/v1/access-rules")
    assert res.status_code == 200
    assert res.json() == {"rules": [RULE]}


def test_add_domain_rule(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool.set_row(RULE)
    res = client.post(
        "/api/v1/access-rules", json={"pattern": "@NoiseDigital.com", "role": "member"}
    )
    assert res.status_code == 201
    # normalized + kind derived before the DB call
    assert fake_pool.fetch_calls[-1][1][0] == "@noisedigital.com"
    assert fake_pool.fetch_calls[-1][1][1] == "domain"


def test_add_rule_rejects_bad_pattern(client: TestClient) -> None:
    res = client.post("/api/v1/access-rules", json={"pattern": "not-valid"})
    assert res.status_code == 422


def test_add_rule_rejects_bad_role(client: TestClient) -> None:
    res = client.post(
        "/api/v1/access-rules", json={"pattern": "a@b.com", "role": "root"}
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_role_for_email_exact_beats_domain(fake_pool: FakePool) -> None:
    """The access_rules query orders exact-email first; we just confirm a match
    returns its role, and a miss falls through to deny / bootstrap."""
    fake_pool.set_row({"role": "viewer"})
    assert await _role_for_email(fake_pool, "jane@x.com") == "viewer"


@pytest.mark.asyncio
async def test_role_for_email_bootstrap(
    fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    import api.auth

    monkeypatch.setattr(api.auth, "BOOTSTRAP_ADMINS", {"boss@x.com"})
    fake_pool.set_row(None)  # no rule matches
    assert await _role_for_email(fake_pool, "boss@x.com") == "admin"
    assert await _role_for_email(fake_pool, "nobody@x.com") is None
