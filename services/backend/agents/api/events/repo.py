"""Postgres repository for per-message feedback (thumb ratings).

Feedback is keyed by the ADK event the message came from. ADK events are
immutable and ADK owns the `events`/`sessions` schema, so feedback lives in the
platform's own `event_metadata` table, referencing the event's composite key
(app_name, user_id, session_id, event_id) rather than mutating ADK's rows.
"""

from __future__ import annotations

from typing import Any, Optional

import asyncpg

from api.db import get_pool

VALID_RATINGS = ("up", "down")

# Schema ownership: `event_metadata` is created by the gateway's Alembic
# migration (`baseline_metadata_tables`). To change the shape, add a new
# migration in `services/backend/gateway/alembic/versions/`.


async def _pool() -> asyncpg.Pool:
    return await get_pool()


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    d = dict(row)
    d["id"] = str(d["id"])
    for key in ("created_at", "updated_at"):
        if d.get(key) is not None:
            d[key] = d[key].isoformat()
    return d


async def list_for_session(app_name: str, user_id: str, session_id: str) -> list[dict]:
    pool = await _pool()
    rows = await pool.fetch(
        """
        SELECT * FROM event_metadata
        WHERE app_name = $1 AND user_id = $2 AND session_id = $3
        ORDER BY updated_at DESC
        """,
        app_name,
        user_id,
        session_id,
    )
    return [_row_to_dict(r) for r in rows]


async def set_rating(
    app_name: str,
    user_id: str,
    session_id: str,
    event_id: str,
    rating: str,
    comment: Optional[str] = None,
) -> dict:
    """Insert or update the rating for one message."""
    pool = await _pool()
    row = await pool.fetchrow(
        """
        INSERT INTO event_metadata
            (app_name, user_id, session_id, event_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (app_name, user_id, session_id, event_id)
        DO UPDATE SET rating = EXCLUDED.rating,
                      comment = EXCLUDED.comment,
                      updated_at = now()
        RETURNING *
        """,
        app_name,
        user_id,
        session_id,
        event_id,
        rating,
        comment,
    )
    return _row_to_dict(row)


async def clear_rating(
    app_name: str, user_id: str, session_id: str, event_id: str
) -> bool:
    pool = await _pool()
    result = await pool.execute(
        """
        DELETE FROM event_metadata
        WHERE app_name = $1 AND user_id = $2 AND session_id = $3 AND event_id = $4
        """,
        app_name,
        user_id,
        session_id,
        event_id,
    )
    return result != "DELETE 0"


async def delete_for_session(app_name: str, user_id: str, session_id: str) -> int:
    """Remove all feedback for a session — call when the session is deleted."""
    pool = await _pool()
    result = await pool.execute(
        """
        DELETE FROM event_metadata
        WHERE app_name = $1 AND user_id = $2 AND session_id = $3
        """,
        app_name,
        user_id,
        session_id,
    )
    return int(result.split()[-1]) if result.startswith("DELETE") else 0
