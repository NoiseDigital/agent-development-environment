"""GET /api/v1/clients — read-only platform client directory.

The handler does a single SELECT against the `clients` table and shapes
the rows into JSON. Tests pin the contract: the route exists, the
auth seam is wired (no header → dev uid resolves cleanly), and the
response shape matches what the frontend expects.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import FakePool


def test_list_clients_returns_rows_as_array(
    client: TestClient,
    fake_pool: FakePool,
) -> None:
    fake_pool._rows = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "slug": "noi",
            "name": "Noise",
            "initials": "NO",
            "accent_color": "#10b981",
            "logo_path": "/clients/noi.png",
        },
    ]
    res = client.get("/api/v1/clients")
    assert res.status_code == 200
    body = res.json()
    assert "clients" in body
    assert len(body["clients"]) == 1
    row = body["clients"][0]
    # Field shape pinned — the frontend reads exactly these keys.
    assert row["slug"] == "noi"
    assert row["accent_color"] == "#10b981"
    assert row["logo_path"] == "/clients/noi.png"


def test_list_clients_empty_directory(
    client: TestClient,
    fake_pool: FakePool,
) -> None:
    # Zero-row case — the dashboards page should still render, so the route
    # must return `{ "clients": [] }`, never null / 204.
    res = client.get("/api/v1/clients")
    assert res.status_code == 200
    assert res.json() == {"clients": []}


def test_list_clients_query_is_deterministic(
    client: TestClient,
    fake_pool: FakePool,
) -> None:
    # Pin the ORDER BY contract — sidebar listing relies on stable ordering.
    client.get("/api/v1/clients")
    assert len(fake_pool.fetch_calls) == 1
    query, _args = fake_pool.fetch_calls[0]
    assert "ORDER BY created_at ASC" in query
