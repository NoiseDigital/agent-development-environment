"""Dashboard editor agent — the floating assistant uses this when the user
is open on a dashboard. Distinct from MediaPerformanceAgent: this one OWNS
the action layer (pin a chart, recolour the banner, rename the dashboard),
and DELEGATES the analytical work to MediaPerformanceAgent via AgentTool.

The frontend reads the agent's `ui[].component: "action"` blocks and applies
them — no backend persistence is involved on the editor side.

Context caching (ADK-native):
Same pattern as media_performance_agent — the static editor prompt lives on
`static_instruction`, and the agent is wrapped in an `App` with
`ContextCacheConfig`. The editor's own prompt is small (~1.1k tokens, below
Flash's 4096-token cache threshold), so caching only kicks in for the
ANALYST sub-invocation it delegates to — but it does kick in there, because
ADK propagates the App's cache config into the AgentTool's sub-invocation.
That's the big win on dashboard-edit turns that route through the analyst.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps.app import App
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
        # The editor prompt is fully static — no placeholders, no per-session
        # interpolation. Move it onto `static_instruction` so it sits in the
        # cacheable region of the request (same pattern as the analyst).
        static_instruction=get_dashboard_editor_agent_prompt(),
        tools=[AgentTool(media_performance_root_agent)],
    )


root_agent = _build_dashboard_editor_agent()

# App wrapper. ADK's loader prefers `app` over `root_agent` and gets the
# context cache config from here. The editor's own prompt is below the
# 4096-token min, so its model calls won't cache on their own — but the
# config flows into the analyst sub-invocation (~5k token static prompt)
# via AgentTool, which is where the cache hit actually lands.
app = App(
    name="dashboard_editor_agent",
    root_agent=root_agent,
    context_cache_config=ContextCacheConfig(
        cache_intervals=10,
        ttl_seconds=1800,
        min_tokens=4096,
    ),
)
