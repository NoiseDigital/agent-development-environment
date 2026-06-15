"""GET /api/v1/me — the current user, upserting the directory row on read.

The frontend calls this after sign-in to register the user in the `users`
directory (the RBAC / user-management source of truth) and to read its role.
Identity comes from `current_user` (the BFF-forwarded, verified Firebase user).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .auth import CurrentUser, current_user
from .db import get_pool

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def me(user: CurrentUser = Depends(current_user)):
    """Return the current user; upsert email + last_seen into the directory."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO users (uid, email, last_seen_at)
        VALUES ($1, $2, now())
        ON CONFLICT (uid) DO UPDATE
          SET email        = COALESCE(EXCLUDED.email, users.email),
              last_seen_at = now(),
              updated_at   = now()
        RETURNING uid, email, display_name, role
        """,
        user.uid,
        user.email,
    )
    return dict(row)
