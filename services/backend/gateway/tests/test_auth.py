"""The auth seam is the single source of identity for every authenticated
route. Test it directly so a future change doesn't break the identity contract.

Identity is the BFF-forwarded, verified Firebase user (`X-User-*`). `X-Dev-User`
is a legacy fallback, and absent any identity the DEV_UID keeps the local stack
and tests working without a login. Agents resolve session-scoped state from the
uid, so a regression here would silently leak one user's sessions to another.

NOTE: `current_user` is called directly here, so every Header param must be
passed explicitly — under FastAPI DI they'd resolve to None, but a direct call
leaves the `Header(default=None)` sentinels in place.
"""

from __future__ import annotations

import pytest

from api.auth import DEV_UID, CurrentUser, current_user, require_role


async def _resolve(
    *,
    x_user_id=None,
    x_user_email=None,
    x_user_role=None,
    x_dev_user=None,
) -> CurrentUser:
    return await current_user(
        x_user_id=x_user_id,
        x_user_email=x_user_email,
        x_user_role=x_user_role,
        x_dev_user=x_dev_user,
    )


@pytest.mark.asyncio
async def test_default_user_when_no_identity() -> None:
    user = await _resolve()
    assert user.uid == DEV_UID
    assert user.role == "admin"


@pytest.mark.asyncio
async def test_forwarded_identity_is_used() -> None:
    user = await _resolve(
        x_user_id="alice", x_user_email="alice@noisedigital.com", x_user_role="member"
    )
    assert user.uid == "alice"
    assert user.email == "alice@noisedigital.com"
    assert user.role == "member"


@pytest.mark.asyncio
async def test_forwarded_id_beats_legacy_dev_header() -> None:
    user = await _resolve(x_user_id="alice", x_dev_user="bob")
    assert user.uid == "alice"


@pytest.mark.asyncio
async def test_legacy_dev_header_still_works() -> None:
    user = await _resolve(x_dev_user="bob")
    assert user.uid == "bob"


@pytest.mark.asyncio
async def test_require_role_allows_matching_role() -> None:
    admin = CurrentUser(uid="alice", role="admin")
    assert await require_role("admin")(user=admin) is admin


@pytest.mark.asyncio
async def test_require_role_rejects_other_role() -> None:
    from fastapi import HTTPException

    member = CurrentUser(uid="bob", role="member")
    with pytest.raises(HTTPException) as exc:
        await require_role("admin")(user=member)
    assert exc.value.status_code == 403
