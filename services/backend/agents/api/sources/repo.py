"""Postgres repository for uploaded data sources.

Only uploaded files are persisted here — the platform owns those artifacts and
must track their storage. BigQuery tables are NOT registered: they already live
in BigQuery (the system of record) and are referenced live by dataset.table.
"""

from __future__ import annotations

import json
from typing import Any, Optional

import asyncpg

from api.db import ensure_schema

# Schema bootstrap. CREATE is idempotent for fresh databases; the ALTERs migrate
# an older `sources` table that still carried BigQuery columns (BigQuery tables
# are now referenced live instead of registered).
_SCHEMA = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS sources (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    file_ext    TEXT,
    size_bytes  BIGINT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sources DROP COLUMN IF EXISTS kind;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_project;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_dataset;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_table;
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources (user_id, created_at DESC);
"""


async def _pool() -> asyncpg.Pool:
    return await ensure_schema("sources", _SCHEMA)


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    d = dict(row)
    # asyncpg returns JSONB as a string unless a codec is registered.
    if isinstance(d.get("metadata"), str):
        d["metadata"] = json.loads(d["metadata"])
    d["id"] = str(d["id"])
    if d.get("created_at") is not None:
        d["created_at"] = d["created_at"].isoformat()
    return d


async def list_uploads(user_id: str) -> list[dict]:
    pool = await _pool()
    rows = await pool.fetch(
        "SELECT * FROM sources WHERE user_id = $1 ORDER BY created_at DESC", user_id
    )
    return [_row_to_dict(r) for r in rows]


async def get_upload(source_id: str) -> Optional[dict]:
    pool = await _pool()
    row = await pool.fetchrow("SELECT * FROM sources WHERE id = $1", source_id)
    return _row_to_dict(row) if row else None


async def create_upload(
    user_id: str,
    name: str,
    storage_key: str,
    file_ext: str,
    size_bytes: int,
    metadata: dict,
) -> dict:
    pool = await _pool()
    row = await pool.fetchrow(
        """
        INSERT INTO sources (user_id, name, storage_key, file_ext, size_bytes, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING *
        """,
        user_id,
        name,
        storage_key,
        file_ext,
        size_bytes,
        json.dumps(metadata),
    )
    return _row_to_dict(row)


async def delete_upload(source_id: str) -> Optional[dict]:
    pool = await _pool()
    row = await pool.fetchrow(
        "DELETE FROM sources WHERE id = $1 RETURNING *", source_id
    )
    return _row_to_dict(row) if row else None
