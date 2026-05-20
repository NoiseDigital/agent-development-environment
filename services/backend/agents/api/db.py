"""Shared asyncpg pool for the platform's own tables.

ADK manages session/event storage itself; these are the tables the platform
owns — uploaded sources, message feedback, session names. One lazily-created
pool is shared across the ``api.*`` repositories, each of which bootstraps its
own schema on first use via :func:`ensure_schema`.
"""

from __future__ import annotations

import asyncio
import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None
_lock = asyncio.Lock()
_schemas_ready: set[str] = set()


def dsn() -> str:
    """Plain asyncpg DSN from DATABASE_URL (asyncpg rejects SQLAlchemy's +asyncpg)."""
    url = os.environ.get(
        "DATABASE_URL", "postgresql://user:password@postgres:5432/postgres"
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def get_pool() -> asyncpg.Pool:
    """The shared connection pool, created on first use."""
    global _pool
    if _pool is None:
        async with _lock:
            if _pool is None:
                _pool = await asyncpg.create_pool(dsn=dsn(), min_size=1, max_size=10)
    return _pool


async def ensure_schema(key: str, ddl: str) -> asyncpg.Pool:
    """Return the shared pool, running ``ddl`` once per process for ``key``.

    Lets each repository own its table definition while sharing one pool. The
    DDL is expected to be idempotent so it also works on provisioned volumes.
    """
    pool = await get_pool()
    if key not in _schemas_ready:
        async with _lock:
            if key not in _schemas_ready:
                async with pool.acquire() as conn:
                    await conn.execute(ddl)
                _schemas_ready.add(key)
    return pool
