"""Liveness probe — guards against an accidental router-include reorder or
an import-time exception breaking startup."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz_returns_ok(client: TestClient) -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
