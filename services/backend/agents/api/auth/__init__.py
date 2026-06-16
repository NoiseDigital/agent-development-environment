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

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException

# The development identity used until Firebase is wired in. Kept as "user-1" so
# existing ADK sessions and event metadata (all keyed by that id) still resolve.
# LOCAL-ONLY: never used in a deployed env (see current_user) so the dev identity
# can't leak into a production DB.
DEV_UID = "user-1"

# Cloud Run services set K_SERVICE; jobs set CLOUD_RUN_JOB. Either => deployed.
_DEPLOYED = bool(os.getenv("K_SERVICE") or os.getenv("CLOUD_RUN_JOB"))


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

    The gateway is the auth boundary: in every deployed env it forwards the
    verified user as `X-Dev-User` (and only the gateway SA can reach this
    internal service). So:

      * `X-Dev-User` present -> use it (the verified identity).
      * absent + deployed    -> reject (401). Never fall back to the shared dev
        identity — that would seed "user-1" into a production DB.
      * absent + local       -> the dev identity, so the stack runs without login.

    When Firebase Auth is wired in, replace the body with token verification;
    the signature and return type stay the same so no route has to change.
    """
    if x_dev_user:
        return CurrentUser(uid=x_dev_user)
    if _DEPLOYED:
        raise HTTPException(status_code=401, detail="identity required")
    return CurrentUser(uid=DEV_UID)
