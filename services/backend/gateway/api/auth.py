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

  * DEV_AUTH on (local dev + tests only): no gating, and the user is always
    `admin`, so the stack runs without a login.
  * DEV_AUTH off (every deployed environment): only an active row in `users`
    may proceed; an un-provisioned user gets 403. First sign-in binds the
    Firebase uid to the matching access rule (row created by email).

`require_role` is the per-route RBAC gate (e.g. the admin user-management API).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

from .db import get_pool

# Cloud Run services set K_SERVICE; Cloud Run jobs set CLOUD_RUN_JOB. Either
# means we're deployed — the single signal used to keep dev-only behaviour
# (the dev identity below, the local seed) physically out of every deployment.
_DEPLOYED = bool(os.getenv("K_SERVICE") or os.getenv("CLOUD_RUN_JOB"))

# Kept in sync with services/backend/agents/api/auth/__init__.py so the dev
# identity is identical across services and ADK sessions resolve consistently.
# LOCAL-ONLY: it must never be persisted in a deployed DB (see the
# drop_dev_user_seed migration + the agent's current_user guard).
DEV_UID = "user-1"

# Secure-by-default: access is ENFORCED (invite-only allowlist + DB-resolved
# roles) UNLESS GATEWAY_DEV_AUTH is explicitly set. Local dev / tests set it to
# get the permissive "everyone is admin" mode. Gated on `not _DEPLOYED` as
# defence-in-depth: even if GATEWAY_DEV_AUTH leaked into a Cloud Run env by
# mistake, dev-auth (and the dev admin identity) can never activate in a
# deployment. docker-compose sets the var for local; Cloud Run does not.
DEV_AUTH = (not _DEPLOYED) and os.getenv("GATEWAY_DEV_AUTH", "").lower() in (
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

    Dev/tests (DEV_AUTH): never blocks; the local user is always admin.
    Enforced (default): `users` is the directory of people who've signed in;
    `access_rules` is the allowlist that authorizes a first sign-in and sets the
    JIT role (exact email rule beats a domain rule). BOOTSTRAP_ADMIN_EMAILS seeds
    the first admin before any rule exists.
    """
    if DEV_AUTH:
        # Local dev / tests only: keep the stack usable without provisioning.
        uid = x_user_id or x_dev_user or DEV_UID
        return CurrentUser(uid=uid, email=x_user_email, role="admin")

    # Enforced: a real BFF-forwarded identity is REQUIRED. Never fall back to the
    # dev uid — that row is a seeded admin, so an unauthenticated request (no
    # session → no X-User-Id) would otherwise be served as admin.
    if not x_user_id:
        raise HTTPException(status_code=401, detail="authentication required")
    uid = x_user_id

    pool = await get_pool()

    # 1. Already signed in before — the directory row is authoritative (role can
    #    be overridden per-person; is_active can revoke even an allowed domain).
    row = await pool.fetchrow(
        "SELECT uid, email, role, is_active FROM users WHERE uid = $1", uid
    )
    if row is not None:
        if not row["is_active"]:
            raise HTTPException(status_code=403, detail="access disabled")
        return CurrentUser(uid=row["uid"], email=row["email"], role=row["role"])

    # 2. First sign-in — authorize via the allowlist, then JIT-provision.
    email = (x_user_email or "").strip().lower()
    role = await _role_for_email(pool, email)
    if role is None:
        raise HTTPException(status_code=403, detail="user not provisioned")

    new = await pool.fetchrow(
        """
        INSERT INTO users (uid, email, role) VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE
          SET uid = EXCLUDED.uid, updated_at = now()
        RETURNING uid, email, role, is_active
        """,
        uid,
        email,
        role,
    )
    if not new["is_active"]:
        raise HTTPException(status_code=403, detail="access disabled")
    return CurrentUser(uid=new["uid"], email=new["email"], role=new["role"])


async def _role_for_email(pool, email: str) -> str | None:
    """Authorize `email` against access_rules (exact email beats domain), then
    the bootstrap-admin env. Returns the role to grant, or None to deny."""
    if email and "@" in email:
        domain = "@" + email.split("@", 1)[1]
        rule = await pool.fetchrow(
            """
            SELECT role FROM access_rules
             WHERE is_active AND pattern = ANY($1::text[])
             ORDER BY (pattern = $2) DESC
             LIMIT 1
            """,
            [email, domain],
            email,
        )
        if rule is not None:
            return rule["role"]
    if email and email in BOOTSTRAP_ADMINS:
        return "admin"
    return None


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
