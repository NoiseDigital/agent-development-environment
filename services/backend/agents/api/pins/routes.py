"""HTTP API for pinned charts.

The user is always taken from `current_user` (the auth seam), never from
the request body, so a client cannot read or modify another user's pins.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from api.auth import CurrentUser, current_user

from . import repo

router = APIRouter(prefix="/api/pins", tags=["pins"])


class CreatePinRequest(BaseModel):
    dashboard_id: str
    tab_id: str
    spec: dict[str, Any] = Field(default_factory=dict)


@router.get("")
async def list_pins(
    dashboard_id: str = Query(...),
    tab_id: str = Query(...),
    user: CurrentUser = Depends(current_user),
):
    """All pins for one dashboard + tab, oldest first."""
    return {"pins": await repo.list_pins(user.uid, dashboard_id, tab_id)}


@router.post("")
async def create_pin(
    req: CreatePinRequest,
    user: CurrentUser = Depends(current_user),
):
    pin = await repo.create_pin(user.uid, req.dashboard_id, req.tab_id, req.spec)
    return {"pin": pin}


@router.delete("/{pin_id}")
async def delete_pin(
    pin_id: str,
    user: CurrentUser = Depends(current_user),
):
    await repo.delete_pin(user.uid, pin_id)
    return {"deleted": pin_id}
