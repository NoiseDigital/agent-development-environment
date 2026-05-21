"""HTTP API for per-message feedback (thumb ratings).

Ratings are keyed by the ADK event id of the message they apply to, and stored
in the platform's `event_metadata` table rather than ADK's immutable `events`.

The user is taken from `current_user` (the auth seam) — never from the request
body or query — so a client cannot rate or read another user's messages.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import CurrentUser, current_user

from . import repo

router = APIRouter(prefix="/api", tags=["events"])


class RatingRequest(BaseModel):
    app_name: str
    session_id: str
    event_id: str
    # "up" / "down" to set the rating, null to clear it.
    rating: Optional[str] = None
    comment: Optional[str] = None


@router.get("/feedback")
async def list_feedback(
    app_name: str = Query(...),
    session_id: str = Query(...),
    user: CurrentUser = Depends(current_user),
):
    """All of the current user's ratings for a session."""
    rows = await repo.list_for_session(app_name, user.uid, session_id)
    return {
        "feedback": [
            {"event_id": r["event_id"], "rating": r["rating"], "comment": r["comment"]}
            for r in rows
        ]
    }


@router.put("/feedback")
async def set_feedback(
    req: RatingRequest,
    user: CurrentUser = Depends(current_user),
):
    """Set (rating = up/down) or clear (rating = null) one message's rating."""
    if req.rating is None:
        await repo.clear_rating(req.app_name, user.uid, req.session_id, req.event_id)
        return {"event_id": req.event_id, "rating": None}
    if req.rating not in repo.VALID_RATINGS:
        raise HTTPException(400, f"rating must be one of {repo.VALID_RATINGS} or null")
    row = await repo.set_rating(
        req.app_name,
        user.uid,
        req.session_id,
        req.event_id,
        req.rating,
        req.comment,
    )
    return {"event_id": row["event_id"], "rating": row["rating"]}


@router.delete("/feedback")
async def delete_session_feedback(
    app_name: str = Query(...),
    session_id: str = Query(...),
    user: CurrentUser = Depends(current_user),
):
    """Remove all of the current user's feedback for a session."""
    removed = await repo.delete_for_session(app_name, user.uid, session_id)
    return {"deleted": removed}
