"""Postgres-backed registry of uploaded data sources.

Only uploaded files are persisted here — the platform owns those artifacts and
must track their storage. BigQuery tables are NOT registered: they already live
in BigQuery (the system of record) and are referenced live by dataset.table.

Uses a lazily-created asyncpg pool, separate from the SQLAlchemy pool ADK uses
for sessions. The schema is created (and migrated) on first use so it works
against an already-provisioned database volume.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None
_lock = asyncio.Lock()


def _dsn() -> str:
    url = os.environ.get(
        "DATABASE_URL", "postgresql://user:password@postgres:5432/postgres"
    )
    # asyncpg needs a plain DSN, not SQLAlchemy's postgresql+asyncpg:// scheme.
    return url.replace("postgresql+asyncpg://", "postgresql://")


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


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _lock:
            if _pool is None:
                pool = await asyncpg.create_pool(dsn=_dsn(), min_size=1, max_size=5)
                async with pool.acquire() as conn:
                    await conn.execute(_SCHEMA)
                _pool = pool
    return _pool


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
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM sources WHERE user_id = $1 ORDER BY created_at DESC", user_id
    )
    return [_row_to_dict(r) for r in rows]


async def get_upload(source_id: str) -> Optional[dict]:
    pool = await get_pool()
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
    pool = await get_pool()
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
    pool = await get_pool()
    row = await pool.fetchrow(
        "DELETE FROM sources WHERE id = $1 RETURNING *", source_id
    )
    return _row_to_dict(row) if row else None
