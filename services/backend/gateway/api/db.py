"""Shared asyncpg pool for the gateway's runtime DB reads/writes.

Alembic owns the schema (sync via psycopg); the pool here is the runtime
read/write path for platform-owned tables (`clients`, `user_dashboards`,
`share_links`). Lazily built on first use so the gateway boots cleanly even
when DATABASE_URL is unreachable at startup.
"""

from __future__ import annotations

import asyncio
import os

import asyncpg

_pool: asyncpg.Pool | None = None
_lock = asyncio.Lock()


def _dsn() -> str:
    """Plain asyncpg DSN.

    The rest of the platform exports DATABASE_URL with the asyncpg driver
    suffix (`postgresql+asyncpg://`) so SQLAlchemy in Alembic resolves to
    the right dialect; asyncpg itself rejects that prefix, so strip it here.
    """
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
                _pool = await asyncpg.create_pool(dsn=_dsn(), min_size=1, max_size=10)
    return _pool
