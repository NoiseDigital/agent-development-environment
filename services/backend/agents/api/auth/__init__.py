"""Authentication seam.

The whole platform reads request identity through one dependency, `current_user`.
Today it resolves a development identity from an optional `X-Dev-User` header.
When Firebase Auth is wired in, ONLY this module changes — `current_user` will
verify the `Authorization: Bearer <id_token>` instead. Routes depend on
`current_user` and never see the provider, so the switch is local to this file.

No database tables are introduced here on purpose: identity is owned by the auth
provider (the Firebase UID). Organization / membership / role tables arrive with
the accounts feature and will key off that UID — nothing added now would have to
be unwound for Firebase.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header

# The development identity used until Firebase is wired in. Kept as "user-1" so
# existing ADK sessions and event metadata (all keyed by that id) still resolve.
DEV_UID = "user-1"


@dataclass(frozen=True)
class CurrentUser:
    """The authenticated principal for a request.

    `uid` is the stable identity (a Firebase UID once auth is live). `role` is
    the coarse RBAC level — it will come from a Firebase custom claim, backed by
    the membership table for fine-grained checks. `org_id` is reserved for the
    multi-tenant accounts feature.
    """

    uid: str
    role: str = "admin"
    org_id: str | None = None


async def current_user(x_dev_user: str | None = Header(default=None)) -> CurrentUser:
    """Resolve the request's authenticated user.

    DEV SEAM — returns a development identity (overridable via `X-Dev-User` for
    multi-user testing). When auth lands, replace the body with Firebase token
    verification (`firebase_admin.auth.verify_id_token`); the signature and
    return type stay the same so no route has to change.
    """
    return CurrentUser(uid=x_dev_user or DEV_UID)
