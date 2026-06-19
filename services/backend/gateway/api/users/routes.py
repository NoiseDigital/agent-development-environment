"""Admin user directory — the people who've actually signed in (`/api/v1/users`).

Every route is admin-only. Rows are JIT-created on first sign-in from the
matching access rule (see api/access.py + auth.py). Admins can override a
person's role and deactivate them here (an override/disable beats their domain
rule). Who is *allowed* (emails + domains) lives in api/access.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.auth import CurrentUser, require_role
from api.db import get_pool

router = APIRouter(prefix="/users", tags=["users"])

ROLES = {"admin", "member", "viewer"}

_COLS = "id, uid, email, display_name, role, is_active, created_at, last_seen_at"


def _validate_role(v: str | None) -> str | None:
    if v is not None and v not in ROLES:
        raise ValueError(f"role must be one of {sorted(ROLES)}")
    return v


class UpdateBody(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    _ck_role = field_validator("role")(_validate_role)


@router.get("")
async def list_users(_: CurrentUser = Depends(require_role("admin"))):
    """Every directory row — people who have signed in."""
    pool = await get_pool()
    rows = await pool.fetch(f"SELECT {_COLS} FROM users ORDER BY created_at")
    return {"users": [dict(r) for r in rows]}


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateBody,
    actor: CurrentUser = Depends(require_role("admin")),
):
    """Change a user's role and/or active state."""
    if body.role is None and body.is_active is None:
        raise HTTPException(status_code=400, detail="nothing to update")
    pool = await get_pool()
    target = await pool.fetchrow(
        "SELECT uid, role FROM users WHERE id = $1::uuid", user_id
    )
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    # Self-lockout guard: an admin can't demote or disable their own access.
    if target["uid"] == actor.uid and (
        (body.role is not None and body.role != "admin") or body.is_active is False
    ):
        raise HTTPException(
            status_code=400, detail="cannot remove your own admin access"
        )
    row = await pool.fetchrow(
        f"""
        UPDATE users
           SET role = COALESCE($2, role),
               is_active = COALESCE($3, is_active),
               updated_at = now()
         WHERE id = $1::uuid
        RETURNING {_COLS}
        """,
        user_id,
        body.role,
        body.is_active,
    )
    return dict(row)


@router.delete("/{user_id}", status_code=204)
async def remove_user(
    user_id: str,
    actor: CurrentUser = Depends(require_role("admin")),
):
    """Delete a directory row (revokes access)."""
    pool = await get_pool()
    target = await pool.fetchrow("SELECT uid FROM users WHERE id = $1::uuid", user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    if target["uid"] == actor.uid:
        raise HTTPException(status_code=400, detail="cannot remove yourself")
    await pool.execute("DELETE FROM users WHERE id = $1::uuid", user_id)
