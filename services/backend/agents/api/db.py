"""Shared asyncpg pool for the platform's own tables.

ADK manages its session/event tables itself and ships its own migrations on
version updates. The platform's other tables (session_metadata, event_metadata,
sources) are owned by the gateway service via Alembic — the agent only reads
and writes them. The gateway runs `alembic upgrade head` in its entrypoint
and the agent waits on `gateway: service_healthy`, so by the time this pool
is used the schema is always at head (see docker-compose.yml).
"""

from __future__ import annotations

import asyncio
import os
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None
_lock = asyncio.Lock()


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
