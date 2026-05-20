"""HTTP API for user-facing session display names.

Names are keyed by the ADK session identity. See session_meta.db for why they
live in their own table rather than in ADK's `sessions` state.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import repo

router = APIRouter(prefix="/api", tags=["session-metadata"])

MAX_NAME_LEN = 80


class NameRequest(BaseModel):
    app_name: str
    session_id: str
    user_id: str = "user-1"
    display_name: str


@router.get("/session-names")
async def list_session_names(
    app_name: str = Query(...),
    user_id: str = Query("user-1"),
):
    """All session display names for an app + user."""
    return {"names": await repo.list_names(app_name, user_id)}


@router.put("/session-names")
async def set_session_name(req: NameRequest):
    name = req.display_name.strip()[:MAX_NAME_LEN]
    if not name:
        raise HTTPException(400, "display_name must not be empty")
    await repo.set_name(req.app_name, req.user_id, req.session_id, name)
    return {"session_id": req.session_id, "display_name": name}


@router.delete("/session-names")
async def delete_session_name(
    app_name: str = Query(...),
    session_id: str = Query(...),
    user_id: str = Query("user-1"),
):
    """Remove a session's name — used when the session is deleted."""
    await repo.delete_name(app_name, user_id, session_id)
    return {"deleted": session_id}
