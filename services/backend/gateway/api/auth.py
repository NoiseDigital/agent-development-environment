"""Gateway-side auth seam — the single source of identity for the platform.

Identity is established at the BFF (the Next.js frontend): it verifies the
Firebase session cookie and forwards the verified user as `X-User-Id` /
`X-User-Email` / `X-User-Role`. The gateway TRUSTS these because the BFF strips
any client-supplied `X-User-*` first, and in production only the BFF (Cloud Run
IAM invoker) can reach the gateway's internal-ingress endpoint.

`X-Dev-User` remains a legacy fallback, and absent any identity the dev user is
used so the local stack and tests run without a login. Every route depends on
`current_user`; `require_role` is the RBAC seam to add per-route restrictions.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

# Kept in sync with services/backend/agents/api/auth/__init__.py so the dev
# identity is identical across services and ADK sessions resolve consistently.
DEV_UID = "user-1"


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None = None
    role: str = "admin"
    org_id: str | None = None


async def current_user(
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),  # legacy fallback
) -> CurrentUser:
    """Resolve the request's authenticated user from the BFF-forwarded identity."""
    uid = x_user_id or x_dev_user or DEV_UID
    return CurrentUser(
        uid=uid,
        email=x_user_email,
        # No role header (dev/no-login) → admin so the local stack stays usable.
        role=x_user_role or "admin",
    )


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
