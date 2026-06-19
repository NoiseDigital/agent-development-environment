"""Admin access rules — the configurable allowlist (`/api/v1/access-rules`).

Admin-only. Each rule grants access (+ a default role) to a specific email
('jane@x.com') or a whole domain ('@x.com'). The gateway resolves a user's role
from these on first sign-in (an exact email beats a domain — see auth.py). This
is the UI-managed source of truth that replaces the ALLOWED_EMAIL_DOMAINS env.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.auth import CurrentUser, require_role
from api.db import get_pool

router = APIRouter(prefix="/access-rules", tags=["access-rules"])

ROLES = {"admin", "member", "viewer"}

_COLS = "id, pattern, kind, role, is_active, note, created_at, updated_at"


def normalize_pattern(raw: str) -> tuple[str, str]:
    """Return (normalized_pattern, kind). '@x.com' -> domain; 'a@x.com' -> email."""
    p = raw.strip().lower()
    if p.startswith("@"):
        if "." not in p[1:] or len(p) < 4:
            raise ValueError("invalid domain (use @example.com)")
        return p, "domain"
    if "@" not in p or "." not in p.split("@")[-1]:
        raise ValueError("use an email (name@example.com) or a domain (@example.com)")
    return p, "email"


def _validate_role(v: str | None) -> str | None:
    if v is not None and v not in ROLES:
        raise ValueError(f"role must be one of {sorted(ROLES)}")
    return v


class RuleBody(BaseModel):
    pattern: str
    role: str = "member"
    note: str | None = None

    _ck_role = field_validator("role")(_validate_role)


class RuleUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    _ck_role = field_validator("role")(_validate_role)


@router.get("")
async def list_rules(_: CurrentUser = Depends(require_role("admin"))):
    """Every access rule — the allowlist."""
    pool = await get_pool()
    rows = await pool.fetch(f"SELECT {_COLS} FROM access_rules ORDER BY kind, pattern")
    return {"rules": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def add_rule(body: RuleBody, _: CurrentUser = Depends(require_role("admin"))):
    """Allow an email or a domain (or re-activate / re-role an existing one)."""
    try:
        pattern, kind = normalize_pattern(body.pattern)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    pool = await get_pool()
    row = await pool.fetchrow(
        f"""
        INSERT INTO access_rules (pattern, kind, role, note) VALUES ($1, $2, $3, $4)
        ON CONFLICT (pattern) DO UPDATE
          SET role = EXCLUDED.role, note = EXCLUDED.note,
              is_active = true, updated_at = now()
        RETURNING {_COLS}
        """,
        pattern,
        kind,
        body.role,
        body.note,
    )
    return dict(row)


@router.patch("/{rule_id}")
async def update_rule(
    rule_id: str,
    body: RuleUpdate,
    _: CurrentUser = Depends(require_role("admin")),
):
    """Change a rule's role and/or active state."""
    if body.role is None and body.is_active is None:
        raise HTTPException(status_code=400, detail="nothing to update")
    pool = await get_pool()
    row = await pool.fetchrow(
        f"""
        UPDATE access_rules
           SET role = COALESCE($2, role),
               is_active = COALESCE($3, is_active),
               updated_at = now()
         WHERE id = $1::uuid
        RETURNING {_COLS}
        """,
        rule_id,
        body.role,
        body.is_active,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="rule not found")
    return dict(row)


@router.delete("/{rule_id}", status_code=204)
async def remove_rule(
    rule_id: str,
    _: CurrentUser = Depends(require_role("admin")),
):
    """Delete an access rule (revokes the grant; existing signed-in users keep
    their `users` row until separately deactivated)."""
    pool = await get_pool()
    await pool.execute("DELETE FROM access_rules WHERE id = $1::uuid", rule_id)
