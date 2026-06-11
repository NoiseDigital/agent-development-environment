"""The auth seam is the single source of identity for every authenticated
route. Test it directly so a Firebase-Auth swap-in doesn't break the dev
override contract.

The DEV_UID default + `X-Dev-User` header override are load-bearing for the
local docker-compose flow — agents resolve their session-scoped state from
this uid, so a regression here would silently leak one user's sessions to
another.
"""

from __future__ import annotations

import pytest

from api.auth import DEV_UID, current_user


@pytest.mark.asyncio
async def test_default_user_when_header_absent() -> None:
    user = await current_user(x_dev_user=None)
    assert user.uid == DEV_UID
    assert user.role == "admin"


@pytest.mark.asyncio
async def test_header_overrides_uid() -> None:
    user = await current_user(x_dev_user="alice")
    assert user.uid == "alice"


@pytest.mark.asyncio
async def test_empty_header_falls_back_to_default() -> None:
    # Empty string is "no override" rather than "anonymous" — matches how the
    # frontend's `authHeaders()` emits the header (omitted, not blank).
    user = await current_user(x_dev_user="")
    assert user.uid == DEV_UID
