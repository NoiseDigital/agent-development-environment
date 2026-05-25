"""Postgres repository for user-facing session metadata.

Keyed by the ADK session's identity (app_name, user_id, session_id). The
composite key *is* the identity — one metadata row per session — so it doubles
as the primary key and powers the upsert in set_name() / hide_session().

The row carries the user-set `display_name` and a `hidden` flag. Soft-delete:
the ADK session row is left intact so it can be undeleted later; the frontend
just skips any session whose id appears in `hidden`.

Schema ownership: this table is created by the gateway's Alembic migration
(`baseline_metadata_tables`); the agent only reads and writes it. To change
the shape, add a new migration in `services/backend/gateway/alembic/versions/`.
"""

from __future__ import annotations

from typing import Any

import asyncpg

from api.db import get_pool


async def _pool() -> asyncpg.Pool:
    return await get_pool()


async def list_meta(app_name: str, user_id: str) -> dict[str, Any]:
    """Session metadata for one app + user.

    Returns `{ "names": { sid: name }, "hidden": [sid, ...] }` — display names
    only for rows with a non-empty name, and the list of soft-deleted ids.
    """
    pool = await _pool()
    rows = await pool.fetch(
        """
        SELECT session_id, display_name, hidden FROM session_metadata
        WHERE app_name = $1 AND user_id = $2
        """,
        app_name,
        user_id,
    )
    return {
        "names": {
            r["session_id"]: r["display_name"] for r in rows if r["display_name"]
        },
        "hidden": [r["session_id"] for r in rows if r["hidden"]],
    }


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


async def hide_session(app_name: str, user_id: str, session_id: str) -> None:
    """Soft-delete — mark the session hidden but leave ADK's data intact."""
    pool = await _pool()
    await pool.execute(
        """
        INSERT INTO session_metadata (app_name, user_id, session_id, hidden)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (app_name, user_id, session_id)
        DO UPDATE SET hidden = TRUE, updated_at = now()
        """,
        app_name,
        user_id,
        session_id,
    )


async def delete_meta(app_name: str, user_id: str, session_id: str) -> None:
    """Hard-delete the metadata row — used when the ADK session is hard-deleted
    (e.g. the auto-cleanup of empty sessions)."""
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
