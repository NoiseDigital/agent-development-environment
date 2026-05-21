"""HTTP API for the MCP toolbox query catalog.

Lets the UI show admins the SQL a tool call executed — reconstructed from
tools.yaml, since the call itself never carries the statement.
"""

from __future__ import annotations

from fastapi import APIRouter

from .catalog import load_catalog

router = APIRouter(prefix="/api", tags=["tools"])


@router.get("/tools/catalog")
async def tools_catalog():
    """Name → { statement, params } for every bigquery-sql toolbox tool."""
    return {"tools": load_catalog()}
