"""Admin user management — the provisioning + RBAC surface (`/api/v1/users`).

Every route is admin-only (`require_role("admin")`). Admins invite users by
email (a row with no uid yet — bound on first sign-in, see auth.py), set roles,
and activate/deactivate access. This is the management side of the allowlist the
gateway enforces in production.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from .auth import CurrentUser, require_role
from .db import get_pool

router = APIRouter(prefix="/users", tags=["users"])

ROLES = {"admin", "member", "viewer"}

_COLS = "id, uid, email, display_name, role, is_active, created_at, last_seen_at"


def _validate_role(v: str | None) -> str | None:
    if v is not None and v not in ROLES:
        raise ValueError(f"role must be one of {sorted(ROLES)}")
    return v


def _validate_email(v: str) -> str:
    v = v.strip().lower()
    if "@" not in v or "." not in v.split("@")[-1]:
        raise ValueError("invalid email")
    return v


class InviteBody(BaseModel):
    email: str
    role: str = "member"

    _ck_email = field_validator("email")(_validate_email)
    _ck_role = field_validator("role")(_validate_role)


class UpdateBody(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    _ck_role = field_validator("role")(_validate_role)


@router.get("")
async def list_users(_: CurrentUser = Depends(require_role("admin"))):
    """Every directory row — the user-management list."""
    pool = await get_pool()
    rows = await pool.fetch(f"SELECT {_COLS} FROM users ORDER BY created_at")
    return {"users": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def invite_user(
    body: InviteBody,
    _: CurrentUser = Depends(require_role("admin")),
):
    """Invite (or re-activate) a user by email. Re-inviting updates the role."""
    pool = await get_pool()
    row = await pool.fetchrow(
        f"""
        INSERT INTO users (email, role) VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE
          SET role = EXCLUDED.role, is_active = true, updated_at = now()
        RETURNING {_COLS}
        """,
        body.email,
        body.role,
    )
    return dict(row)


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
