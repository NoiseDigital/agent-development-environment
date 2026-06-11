"""Gateway-side auth seam — the single source of identity for the platform.

Today: resolves a dev identity (overridable via `X-Dev-User`) so the local
docker-compose stack works exactly like the previous direct-to-agent setup.

When Firebase Auth is wired in, ONLY this module changes — `current_user`
will verify `Authorization: Bearer <id_token>` and produce a CurrentUser with
the verified UID. Every other route in the gateway depends on this dependency
and stays untouched. The upstream agent service trusts the gateway's resolved
identity (forwarded as `X-Dev-User`) — never the raw client header.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header

# Kept in sync with services/backend/agents/api/auth/__init__.py so the dev
# identity is identical across services and ADK sessions resolve consistently.
DEV_UID = "user-1"


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    role: str = "admin"
    org_id: str | None = None


async def current_user(
    x_dev_user: str | None = Header(default=None),
) -> CurrentUser:
    """Resolve the request's authenticated user.

    Replace this body when Firebase Auth lands — every route is wired to this
    dependency, so the migration is local to this file.
    """
    return CurrentUser(uid=x_dev_user or DEV_UID)
