"""HTTP API for user-facing session metadata (display names + hidden flag).

Metadata is keyed by the ADK session identity; see repo.py for why it lives in
its own table rather than ADK's `sessions` state.

The user is taken from `current_user` (the auth seam), never from the request,
so a client cannot read or rename another user's sessions.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import CurrentUser, current_user

from . import repo

router = APIRouter(prefix="/api", tags=["session-metadata"])

MAX_NAME_LEN = 80


class NameRequest(BaseModel):
    app_name: str
    session_id: str
    display_name: str


class HideRequest(BaseModel):
    app_name: str
    session_id: str


@router.get("/session-names")
async def list_session_names(
    app_name: str = Query(...),
    user: CurrentUser = Depends(current_user),
):
    """Session metadata for an app + current user: `{ names, hidden }`."""
    return await repo.list_meta(app_name, user.uid)


@router.put("/session-names")
async def set_session_name(
    req: NameRequest,
    user: CurrentUser = Depends(current_user),
):
    name = req.display_name.strip()[:MAX_NAME_LEN]
    if not name:
        raise HTTPException(400, "display_name must not be empty")
    await repo.set_name(req.app_name, user.uid, req.session_id, name)
    return {"session_id": req.session_id, "display_name": name}


@router.post("/session-names/hide")
async def hide_session(
    req: HideRequest,
    user: CurrentUser = Depends(current_user),
):
    """Soft-delete — hide the session from the frontend but keep ADK's row."""
    await repo.hide_session(req.app_name, user.uid, req.session_id)
    return {"hidden": req.session_id}


@router.delete("/session-names")
async def delete_session_name(
    app_name: str = Query(...),
    session_id: str = Query(...),
    user: CurrentUser = Depends(current_user),
):
    """Hard-delete the metadata row — used when the underlying ADK session is
    also being hard-deleted (e.g. empty-session auto-cleanup)."""
    await repo.delete_meta(app_name, user.uid, session_id)
    return {"deleted": session_id}
