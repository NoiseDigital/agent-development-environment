"""/api/v1/users — the admin user directory (people who've signed in) + the
access gate. Invites/allowlist live in test_access.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from .conftest import FakePool

ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "uid": "user-1",
    "email": "dev@local",
    "display_name": None,
    "role": "admin",
    "is_active": True,
    "created_at": "2026-01-01T00:00:00Z",
    "last_seen_at": None,
}


def test_list_users_returns_array(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool._rows = [ROW]
    res = client.get("/api/v1/users")
    assert res.status_code == 200
    assert res.json() == {"users": [ROW]}


def test_cannot_demote_self(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool.set_row({"uid": "user-1", "role": "admin"})
    res = client.patch(f"/api/v1/users/{ROW['id']}", json={"role": "member"})
    assert res.status_code == 400


def test_cannot_delete_self(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool.set_row({"uid": "user-1"})
    res = client.delete(f"/api/v1/users/{ROW['id']}")
    assert res.status_code == 400


def test_update_missing_user_404(client: TestClient, fake_pool: FakePool) -> None:
    fake_pool.set_row(None)
    res = client.patch(f"/api/v1/users/{ROW['id']}", json={"role": "viewer"})
    assert res.status_code == 404


def test_gate_requires_identity(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Enforced + no forwarded identity → 401 (no fail-open to the dev admin)."""
    import api.auth

    monkeypatch.setattr(api.auth, "DEV_AUTH", False)
    res = client.get("/api/v1/me")  # no X-User-Id header
    assert res.status_code == 401


def test_gate_blocks_unprovisioned(
    client: TestClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Enforced + no directory row + no matching rule → 403."""
    import api.auth

    monkeypatch.setattr(api.auth, "DEV_AUTH", False)
    fake_pool.set_row(None)  # not in users, no access rule matches
    res = client.get(
        "/api/v1/me",
        headers={"X-User-Id": "fb-uid-9", "X-User-Email": "stranger@evil.com"},
    )
    assert res.status_code == 403


def test_gate_allows_existing_user(
    client: TestClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Enforced + an active directory row → allowed, role from the row."""
    import api.auth

    monkeypatch.setattr(api.auth, "DEV_AUTH", False)
    fake_pool.set_row(
        {
            "uid": "fb-uid-9",
            "email": "ok@noisedigital.com",
            "role": "member",
            "is_active": True,
            "display_name": None,
        }
    )
    res = client.get(
        "/api/v1/me",
        headers={"X-User-Id": "fb-uid-9", "X-User-Email": "ok@noisedigital.com"},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "member"
