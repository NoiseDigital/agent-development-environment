"""HTTP API for per-message feedback (thumb ratings).

Ratings are keyed by the ADK event id of the message they apply to. See
feedback.db for why feedback lives in its own table rather than in ADK's
immutable, vendor-managed `events` table.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import repo

router = APIRouter(prefix="/api", tags=["feedback"])


class RatingRequest(BaseModel):
    app_name: str
    session_id: str
    event_id: str
    user_id: str = "user-1"
    # "up" / "down" to set the rating, null to clear it.
    rating: Optional[str] = None
    comment: Optional[str] = None


@router.get("/feedback")
async def list_feedback(
    app_name: str = Query(...),
    session_id: str = Query(...),
    user_id: str = Query("user-1"),
):
    """All ratings for a session."""
    rows = await repo.list_for_session(app_name, user_id, session_id)
    return {
        "feedback": [
            {"event_id": r["event_id"], "rating": r["rating"], "comment": r["comment"]}
            for r in rows
        ]
    }


@router.put("/feedback")
async def set_feedback(req: RatingRequest):
    """Set (rating = up/down) or clear (rating = null) one message's rating."""
    if req.rating is None:
        await repo.clear_rating(req.app_name, req.user_id, req.session_id, req.event_id)
        return {"event_id": req.event_id, "rating": None}
    if req.rating not in repo.VALID_RATINGS:
        raise HTTPException(400, f"rating must be one of {repo.VALID_RATINGS} or null")
    row = await repo.set_rating(
        req.app_name,
        req.user_id,
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
    user_id: str = Query("user-1"),
):
    """Remove all of a session's feedback — used when the session is deleted."""
    removed = await repo.delete_for_session(app_name, user_id, session_id)
    return {"deleted": removed}
