"""Gateway-side auth seam — the single source of identity AND access for the
platform.

Identity is established at the BFF (the Next.js frontend): it verifies the
Firebase session cookie and forwards the verified user as `X-User-Id` /
`X-User-Email`. The gateway TRUSTS the identity because the BFF strips any
client-supplied `X-User-*` first, and in production only the BFF (Cloud Run IAM
invoker) can reach the gateway's internal-ingress endpoint.

Access + role are resolved HERE from the `users` table (the DB is authoritative
— we don't trust a forwarded role header), so admins control who gets in and
with what role:

  * REQUIRE_PROVISIONED_USERS unset (local dev + tests): no gating, and the
    user is always `admin`, so the stack runs without a login.
  * REQUIRE_PROVISIONED_USERS set (production, via cloudrun.tf): only an active
    row in `users` may proceed; an un-provisioned user gets 403. First sign-in
    binds the Firebase uid to the matching invite (row created by email).

`require_role` is the per-route RBAC gate (e.g. the admin user-management API).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

from .db import get_pool

# Kept in sync with services/backend/agents/api/auth/__init__.py so the dev
# identity is identical across services and ADK sessions resolve consistently.
DEV_UID = "user-1"

# Production sets this (gateway Cloud Run env) to turn on the invite-only gate +
# DB-resolved roles. Absent in local dev / tests, where every user is admin.
REQUIRE_PROVISIONED = os.getenv("REQUIRE_PROVISIONED_USERS", "").lower() in (
    "1",
    "true",
    "yes",
)

# Bootstrap admins: emails that auto-provision as admin on first sign-in. Solves
# the chicken-and-egg (someone must be admin to invite the first users). Set per
# tenant in cloudrun.tf (var.admin_emails). Empty → no auto-admin.
BOOTSTRAP_ADMINS = {
    e.strip().lower()
    for e in os.getenv("BOOTSTRAP_ADMIN_EMAILS", "").split(",")
    if e.strip()
}


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None = None
    role: str = "admin"
    org_id: str | None = None


async def current_user(
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),  # legacy fallback
) -> CurrentUser:
    """Resolve + authorize the request's user.

    Dev/tests (gate off): never blocks; local dev user is always admin.
    Prod (gate on): the `users` table is the allowlist and the role source.
    """
    uid = x_user_id or x_dev_user or DEV_UID

    if not REQUIRE_PROVISIONED:
        # Local dev / tests: keep the stack usable without provisioning.
        return CurrentUser(uid=uid, email=x_user_email, role="admin")

    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT uid, email, role, is_active FROM users WHERE uid = $1",
        uid,
    )

    # First sign-in: bind the Firebase uid to an active invite created by email.
    if row is None and x_user_email:
        row = await pool.fetchrow(
            """
            UPDATE users
               SET uid = $1, updated_at = now()
             WHERE uid IS NULL
               AND lower(email) = lower($2)
               AND is_active
            RETURNING uid, email, role, is_active
            """,
            uid,
            x_user_email,
        )

    # Bootstrap: a configured admin email auto-provisions on first sign-in.
    if row is None and x_user_email and x_user_email.lower() in BOOTSTRAP_ADMINS:
        row = await pool.fetchrow(
            """
            INSERT INTO users (uid, email, role) VALUES ($1, lower($2), 'admin')
            ON CONFLICT (email) DO UPDATE
              SET uid = EXCLUDED.uid, role = 'admin',
                  is_active = true, updated_at = now()
            RETURNING uid, email, role, is_active
            """,
            uid,
            x_user_email,
        )

    if row is None or not row["is_active"]:
        raise HTTPException(status_code=403, detail="user not provisioned")

    return CurrentUser(uid=row["uid"], email=row["email"], role=row["role"])


def require_role(*roles: str):
    """Dependency factory: 403 unless the user holds one of `roles`.

    The RBAC enforcement seam — attach to routes as they gain restrictions, e.g.
    `user: CurrentUser = Depends(require_role("admin"))`.
    """

    async def _require(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="insufficient role")
        return user

    return _require
