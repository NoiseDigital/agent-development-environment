import os
import asyncpg
import datetime
from typing import Optional, Dict, Any

_pool = None


def _get_db_url() -> str:
    db_url = os.environ.get(
        "DATABASE_URL", "postgresql://user:password@postgres:5432/postgres"
    )
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return db_url


async def get_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(_get_db_url())
    return _pool


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def save_asana_token(
    user_id: str,
    access_token: str,
    refresh_token: str,
    expires_at: datetime.datetime,
    asana_user_gid: Optional[str] = None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_asana_tokens (user_id, access_token, refresh_token, expires_at, asana_user_gid, updated_at)
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (user_id) DO UPDATE
            SET access_token = EXCLUDED.access_token,
                refresh_token = EXCLUDED.refresh_token,
                expires_at = EXCLUDED.expires_at,
                asana_user_gid = COALESCE(EXCLUDED.asana_user_gid, user_asana_tokens.asana_user_gid),
                updated_at = now()
            """,
            user_id,
            access_token,
            refresh_token,
            expires_at,
            asana_user_gid,
        )


async def get_asana_token(user_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT user_id, access_token, refresh_token, expires_at, asana_user_gid
            FROM user_asana_tokens
            WHERE user_id = $1
            """,
            user_id,
        )
        if row:
            return dict(row)
        return None
