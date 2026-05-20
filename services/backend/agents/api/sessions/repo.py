"""Postgres repository for user-facing session display names.

Keyed by the ADK session's identity (app_name, user_id, session_id). The
composite key *is* the identity — one display name per session — so it doubles
as the primary key and powers the upsert in set_name().
"""

from __future__ import annotations

import asyncpg

from api.db import ensure_schema

# Schema bootstrap — idempotent so it also works on a provisioned volume.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS session_metadata (
    app_name     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    display_name TEXT NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_name, user_id, session_id)
);
"""


async def _pool() -> asyncpg.Pool:
    return await ensure_schema("sessions", _SCHEMA)


async def list_names(app_name: str, user_id: str) -> dict[str, str]:
    """All session display names for one app + user, as { session_id: name }."""
    pool = await _pool()
    rows = await pool.fetch(
        """
        SELECT session_id, display_name FROM session_metadata
        WHERE app_name = $1 AND user_id = $2
        """,
        app_name,
        user_id,
    )
    return {r["session_id"]: r["display_name"] for r in rows}


async def set_name(
    app_name: str, user_id: str, session_id: str, display_name: str
) -> None:
    pool = await _pool()
    await pool.execute(
        """
        INSERT INTO session_metadata (app_name, user_id, session_id, display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (app_name, user_id, session_id)
        DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
        """,
        app_name,
        user_id,
        session_id,
        display_name,
    )


async def delete_name(app_name: str, user_id: str, session_id: str) -> None:
    """Remove a session's name — call when the session is deleted."""
    pool = await _pool()
    await pool.execute(
        """
        DELETE FROM session_metadata
        WHERE app_name = $1 AND user_id = $2 AND session_id = $3
        """,
        app_name,
        user_id,
        session_id,
    )
