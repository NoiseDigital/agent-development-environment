"""Dashboard editor agent — the floating assistant uses this when the user
is open on a dashboard. Distinct from MediaPerformanceAgent: this one OWNS
the action layer (pin a chart, recolour the banner, rename the dashboard),
and DELEGATES the analytical work to MediaPerformanceAgent via AgentTool.

The frontend reads the agent's `ui[].component: "action"` blocks and applies
them — no backend persistence is involved on the editor side.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool

# Absolute import — when the ADK runtime / harness loads agent packages, each
# subdir under `adk_agents/` is a top-level package, so `..media_performance`
# would walk past the top.
from media_performance_agent import (  # type: ignore[import-not-found]
    root_agent as media_performance_root_agent,
)

from .prompts.dashboard_editor_agent import get_dashboard_editor_agent_prompt

MODEL_NAME = "gemini-2.5-flash"


def _build_dashboard_editor_agent() -> LlmAgent:
    return LlmAgent(
        model=MODEL_NAME,
        name="DashboardEditorAgent",
        description=(
            "Edits the dashboard the user is looking at — pins charts, "
            "recolours the banner, renames. Delegates analytical work to "
            "the media performance analyst."
        ),
        instruction=get_dashboard_editor_agent_prompt(),
        tools=[AgentTool(media_performance_root_agent)],
    )


root_agent = _build_dashboard_editor_agent()
