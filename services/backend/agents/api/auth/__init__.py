"""Authentication seam.

The whole platform reads request identity through one dependency, `current_user`.
The gateway (the auth boundary) verifies the Firebase session and forwards the
user as `X-User-Id`; this service trusts it because, in every deployed env, only
the gateway SA can reach this internal-ingress service (IAM). The next hardening
step is for this module to verify a forwarded Firebase ID token directly, rather
than trust the header — routes depend on `current_user` and never see the
provider, so that switch stays local to this file.

No database tables are introduced here on purpose: identity is owned by the auth
provider (the Firebase UID). Organization / membership / role tables arrive with
the accounts feature and will key off that UID — nothing added now would have to
be unwound for Firebase.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import Header, HTTPException

# LOCAL-ONLY development identity, used when there's no login (compose). Kept as
# "user-1" so existing local ADK sessions/event metadata still resolve. It is
# NEVER used in a deployed env (see current_user + the _DEPLOYED guard), so the
# dev identity can't reach a production DB.
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


async def current_user(x_user_id: str | None = Header(default=None)) -> CurrentUser:
    """Resolve the request's authenticated user from the gateway-forwarded
    `X-User-Id` (the real Firebase uid in every deployed env).

      * `X-User-Id` present -> use it (the verified identity).
      * absent + deployed   -> reject (401). There is NO dev identity in the
        cloud — the gateway always forwards a real user.
      * absent + local      -> the dev identity, so the stack runs without login.
    """
    if x_user_id:
        return CurrentUser(uid=x_user_id)
    if _DEPLOYED:
        raise HTTPException(status_code=401, detail="identity required")
    return CurrentUser(uid=DEV_UID)
