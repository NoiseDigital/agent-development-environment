"""Dashboard data endpoint — async pass-through to the MCP Toolbox.

Lives on the gateway (not the agent service) because dashboards are a
platform-owned concern, not part of the ADK runtime. The agent's own tool
calls still go through the same toolbox container; one SQL surface, two
consumers, identical numbers by construction.

Why async:
  A dashboard load makes 10+ parallel calls (KPI strip totals × 2, hero
  trend, breakdown, pivot, filter dropdowns, latest delivery). Each tile
  fires its own request. The sync ToolboxSyncClient blocked the event
  loop so every request serialised; the async ToolboxClient lets them
  fan out and the response time drops from N × latency to ~1 × latency.

Security:
  The set of callable tools is an explicit allowlist (`DASHBOARD_TOOLS`),
  not the caller's input — a client cannot ask for arbitrary tool names.
  The toolbox container owns BigQuery credentials; the gateway never sees
  them. Future row-level access policies hook in here via `current_user`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import CurrentUser, current_user
from .toolbox import get_toolbox_client, normalise_rows

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

# The only toolbox tools dashboards may invoke. Mirrors the
# `media_performance_query` toolset in services/backend/mcp/images/toolbox/tools.yaml.
DASHBOARD_TOOLS = frozenset(
    {
        "performance_trend",
        "publisher_spend_breakdown",
        "campaign_performance_comparison",
        "platform_engagement_metrics",
        "top_performing_campaigns",
        "conversion_funnel_data",
        "market_group_breakdown",
        "creative_format_breakdown",
        "kpi_goal_breakdown",
        "budget_pacing",
        "period_over_period",
        "metric_totals",
        "metric_series",
        "breakdown_nested",
        "breakdown_nested_totals",
        "dimension_values",
        "available_date_range",
        "campaign_windows",
    }
)


class DashboardQuery(BaseModel):
    """One dashboard data request — name a tool + pass its parameters."""

    tool: str = Field(..., description="A tool name from DASHBOARD_TOOLS.")
    params: dict[str, Any] = Field(default_factory=dict)


@router.post("/query")
async def run_dashboard_query(
    body: DashboardQuery,
    _user: CurrentUser = Depends(current_user),
) -> dict[str, list[dict[str, Any]]]:
    """Run one allowlisted toolbox tool and return its rows.

    Response shape: `{ "rows": [...] }` — flat list of dicts, ready for the
    frontend's DashboardDataSource to consume. The toolbox's MCP-shaped
    response (sometimes a JSON-encoded string in a content item) is parsed
    here so every caller sees the same shape.
    """
    if body.tool not in DASHBOARD_TOOLS:
        raise HTTPException(400, f"unknown tool: {body.tool}")

    client = get_toolbox_client()
    try:
        tool = await client.load_tool(body.tool)
    except Exception as exc:
        raise HTTPException(502, f"toolbox failed to load tool: {exc}") from exc

    try:
        result = await tool(**body.params)
    except Exception as exc:
        raise HTTPException(400, f"toolbox query failed: {exc}") from exc

    return {"rows": normalise_rows(result)}
