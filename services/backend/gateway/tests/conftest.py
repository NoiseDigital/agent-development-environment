"""Shared pytest fixtures for the gateway. The harness wires FastAPI's
TestClient against `main.app` with the DB pool stubbed — we want to exercise
routing + auth + serialization without standing up Postgres.

Run from inside the gateway container:
    docker compose exec gateway uv run pytest tests -v
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient


class FakePool:
    """asyncpg pool stand-in. Tests pass a list of dict rows via the marker
    `pytest.mark.fake_db_rows([...])` and the fake `.fetch(...)` returns
    them as `asyncpg.Record`-compatible mappings. Good enough for the
    gateway's read-only routes; tests that need writes can extend later."""

    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self._rows = rows or []
        # Explicit single-row result for `fetchrow`; falls back to _rows[0].
        # Set to a sentinel-free None to force "no row" (e.g. un-provisioned).
        self._row: dict[str, Any] | None = None
        self._row_set = False
        self.fetch_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.fetch_calls.append((query, args))
        return self._rows

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetch_calls.append((query, args))
        if self._row_set:
            return self._row
        return self._rows[0] if self._rows else None

    async def execute(self, query: str, *args: Any) -> str:
        self.execute_calls.append((query, args))
        return "OK"

    def set_row(self, row: dict[str, Any] | None) -> None:
        """Pin the next `fetchrow` result (use None for 'no row')."""
        self._row = row
        self._row_set = True


@pytest.fixture
def fake_pool() -> FakePool:
    """Override the DB pool with an in-memory fake. Each test gets a fresh
    instance — set `pool._rows` to whatever the route should return."""
    return FakePool()


@pytest.fixture
def client(
    fake_pool: FakePool, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    """FastAPI TestClient with the DB pool stubbed at EVERY consumer.

    Each route does `from .db import get_pool` at module load, so patching
    `api.db.get_pool` after import is a no-op — the route's local binding
    still points at the real coroutine. We patch the bound name on each
    consumer module instead. Add a line here when a new route is wired in
    that touches Postgres."""

    async def _get_pool() -> FakePool:
        return fake_pool

    import api.auth
    import api.clients
    import api.db
    import api.me
    import api.users

    monkeypatch.setattr(api.db, "get_pool", _get_pool)
    monkeypatch.setattr(api.clients, "get_pool", _get_pool)
    monkeypatch.setattr(api.me, "get_pool", _get_pool)
    monkeypatch.setattr(api.users, "get_pool", _get_pool)
    monkeypatch.setattr(api.auth, "get_pool", _get_pool)

    from main import app

    with TestClient(app) as c:
        yield c
