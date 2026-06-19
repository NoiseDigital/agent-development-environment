"""GET /api/v1/me — the current user (identity + role).

The frontend calls this after sign-in to read its role and confirm access.
`current_user` already authorized the request (and, in prod, bound the Firebase
uid to the invite), so this just reads back the directory row and stamps
last_seen. In dev (gate off) there may be no row — we synthesize from the
resolved identity so the local stack still works.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from api.auth import CurrentUser, current_user
from api.db import get_pool

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def me(user: CurrentUser = Depends(current_user)):
    """Return the current user; stamp last_seen on the directory row."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE users SET last_seen_at = now()
         WHERE uid = $1
        RETURNING uid, email, display_name, role, is_active
        """,
        user.uid,
    )
    if row is not None:
        return dict(row)

    # Dev / gate-off: no provisioned row — reflect the resolved identity.
    return {
        "uid": user.uid,
        "email": user.email,
        "display_name": None,
        "role": user.role,
        "is_active": True,
    }
