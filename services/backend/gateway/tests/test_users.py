"""/api/v1/users — admin user management + the invite-only access gate.

Tests pin: the admin routes' contract (list/invite/validation/self-lockout) and
that REQUIRE_PROVISIONED turns the `users` table into an allowlist (403 for an
un-provisioned user, 200 once provisioned). The default test identity is the dev
admin (gate off), matching local dev.
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


def test_invite_user_creates_row(client: TestClient, fake_pool: FakePool) -> None:
    invited = {**ROW, "uid": None, "email": "newbie@noisedigital.com", "role": "member"}
    fake_pool.set_row(invited)
    res = client.post(
        "/api/v1/users", json={"email": "Newbie@NoiseDigital.com", "role": "member"}
    )
    assert res.status_code == 201
    assert res.json()["email"] == "newbie@noisedigital.com"
    # email is normalised lower-case before hitting the DB
    assert fake_pool.fetch_calls[-1][1][0] == "newbie@noisedigital.com"


def test_invite_rejects_bad_role(client: TestClient) -> None:
    res = client.post(
        "/api/v1/users", json={"email": "x@noisedigital.com", "role": "root"}
    )
    assert res.status_code == 422


def test_invite_rejects_bad_email(client: TestClient) -> None:
    res = client.post("/api/v1/users", json={"email": "not-an-email", "role": "member"})
    assert res.status_code == 422


def test_cannot_demote_self(client: TestClient, fake_pool: FakePool) -> None:
    # target uid == actor uid (dev "user-1") → demoting self is blocked
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


def test_provisioning_gate(
    client: TestClient, fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With the gate on, an un-provisioned user is 403; a provisioned one is OK."""
    import api.auth

    monkeypatch.setattr(api.auth, "REQUIRE_PROVISIONED", True)

    # No directory row for this uid/email → rejected.
    fake_pool.set_row(None)
    res = client.get(
        "/api/v1/me",
        headers={"X-User-Id": "fb-uid-9", "X-User-Email": "stranger@evil.com"},
    )
    assert res.status_code == 403

    # Provisioned + active → allowed, role from the DB.
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
