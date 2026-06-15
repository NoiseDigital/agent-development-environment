"""HTTP API for the platform's client directory.

One row per ad-client. Drives the New Dashboard form's client picker and
the dashboard card's brand badge. Today there is one client (Noise / NOI);
future clients are seeded via direct INSERT — there is intentionally no
client-creation UI yet (admins add clients, the app consumes them).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .auth import CurrentUser, current_user
from .db import get_pool

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("")
async def list_clients(
    _user: CurrentUser = Depends(current_user),
):
    """Every client, oldest first. Small set; no pagination needed today."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id::text AS id, slug, name, initials, accent_color, logo_path
        FROM clients
        ORDER BY created_at ASC
        """
    )
    return {"clients": [dict(r) for r in rows]}
