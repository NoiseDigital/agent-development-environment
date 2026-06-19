"""Postgres repository for pinned charts (FloatingAssistant → Save → dashboard).

Pins are keyed by (user, dashboard, tab); the schema lives in the gateway's
Alembic migration `20260710_0000_pinned_charts`. The Vega-Lite spec is stored
as JSONB so the chart re-renders identically on any device. Order is by
creation time so the dashboard tile strip is stable across reloads.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg

from api.db import get_pool


async def list_pins(
    user_id: str, dashboard_id: str, tab_id: str
) -> list[dict[str, Any]]:
    """All pins for one user + dashboard + tab, oldest first."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, spec, created_at
        FROM pinned_charts
        WHERE user_id = $1 AND dashboard_id = $2 AND tab_id = $3
        ORDER BY created_at ASC
        """,
        user_id,
        dashboard_id,
        tab_id,
    )
    return [_row(r) for r in rows]


async def create_pin(
    user_id: str, dashboard_id: str, tab_id: str, spec: dict[str, Any]
) -> dict[str, Any]:
    """Pin a chart spec to a dashboard tab; returns the new row's id + spec."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO pinned_charts (user_id, dashboard_id, tab_id, spec)
        VALUES ($1, $2, $3, $4)
        RETURNING id, spec, created_at
        """,
        user_id,
        dashboard_id,
        tab_id,
        json.dumps(spec),
    )
    assert row is not None  # INSERT ... RETURNING always yields a row
    return _row(row)


async def delete_pin(user_id: str, pin_id: str) -> None:
    """Unpin one chart. Scoped by user so a client can't delete another user's pin."""
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM pinned_charts WHERE id = $1::uuid AND user_id = $2",
        pin_id,
        user_id,
    )


def _row(row: asyncpg.Record) -> dict[str, Any]:
    """Normalise an asyncpg Record into the JSON shape the frontend consumes —
    `id` is a string (uuid → str), `spec` is parsed JSON, `created_at` is ISO."""
    d = dict(row)
    d["id"] = str(d["id"])
    if isinstance(d.get("spec"), str):
        d["spec"] = json.loads(d["spec"])
    if d.get("created_at") is not None:
        d["created_at"] = d["created_at"].isoformat()
    return d
