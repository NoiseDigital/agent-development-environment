"""The Media Performance agent — a router that delegates the final envelope
to the right specialist subagent.

Architecture (peer subagents):
- Root: tool-using LlmAgent with the data toolset + stats MCP. It picks the
  workflow, fetches the data, and decides which subagent should render the
  reply. The root NEVER emits the envelope itself when a subagent is
  appropriate — it returns the subagent's response verbatim.
- ChoicesAgent: produces `{ text, ui: [choices block] }` when a request is
  ambiguous. Has its OWN data tools so options are grounded in real values.
- VegaChartsAgent: produces `{ text, ui: [chart block] }` from data the root
  fetched. Has NO data tools — it must use the data the root passed it.

Why peer subagents (vs. one mega-agent): each subagent owns ONE response
shape, so its prompt is short and its output stays clean. The root never has
to remember "should I emit text-only or wrap a chart?" — it picks a subagent.

Context caching (ADK-native):
The static prompt (~5K tokens) lives on `static_instruction` so Gemini's
explicit context cache covers it. The cache is wired at the App level via
`ContextCacheConfig`; ADK manages create / refresh / TTL automatically. The
ADK loader looks for `app` before `root_agent`, so exporting `app` here is
what flips caching on. We also keep `root_agent` exported for the
dashboard_editor_agent which AgentTool-wraps this agent.
"""

import logging
import os
from datetime import date
from urllib.parse import urlparse

from google.adk.agents import LlmAgent
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps.app import App
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.mcp_tool import McpToolset, SseConnectionParams

from shared.idtoken import id_token_for
from shared.toolbox import get_toolbox_client

from .prompts.root_agent import get_root_agent_prompt
from .subagents.choices_agent import root_agent as choices_root_agent
from .subagents.vega_charts_agent import root_agent as vega_charts_root_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-3.5-flash"


def today() -> str:
    """Returns today's date in YYYY-MM-DD format."""
    return date.today().isoformat()


def _build_root_agent() -> LlmAgent:
    """Wire data tools + stats MCP + the two peer subagents (ChoicesAgent,
    VegaChartsAgent) into the router LlmAgent."""
    toolbox = get_toolbox_client()
    tools = toolbox.load_toolset("media_performance_query")
    tools.append(today)
    tools.append(AgentTool(choices_root_agent))
    tools.append(AgentTool(vega_charts_root_agent))

    # Stats MCP server — correlation, regression, QA on user-uploaded sources.
    # It's internal-ingress behind Cloud Run IAM, so each SSE connection must
    # carry a Google-signed ID token whose audience is the service origin (no
    # /sse path). `header_provider` is called per connection, so the cached
    # token refreshes before it expires — a static `headers=` would go stale on
    # this module-singleton agent. None off-GCP (plain HTTP), where we send no
    # header. mcp-stats has no bearer auth of its own, so Authorization is fine.
    stats_url = os.getenv("MCP_STATS_URL", "http://mcp-stats:8080/sse")
    stats_origin = "{0.scheme}://{0.netloc}".format(urlparse(stats_url))

    def stats_auth_headers(_ctx) -> dict[str, str]:
        token = id_token_for(stats_origin)
        return {"Authorization": f"Bearer {token}"} if token else {}

    tools.append(
        McpToolset(
            # 30s connect timeout (vs the 5s default): mcp-stats is internal and
            # scales to zero, so the first request after idle must absorb a Cloud
            # Run cold start instead of timing out and failing the whole run.
            connection_params=SseConnectionParams(url=stats_url, timeout=30.0),
            header_provider=stats_auth_headers,
        )
    )

    return LlmAgent(
        model=MODEL_NAME,
        name="MediaPerformanceAgent",
        description=(
            "Routes media-performance questions to the right specialist "
            "subagent (ChoicesAgent for ambiguity, VegaChartsAgent for "
            "visualised answers); answers text-only questions directly."
        ),
        # The whole router prompt is STATIC across turns — no placeholders,
        # no per-session interpolation. Move it onto `static_instruction`
        # so Gemini's explicit context cache covers it (paired with the
        # `App.context_cache_config` below). Leaving `instruction` blank
        # is intentional: per the LlmAgent docs, when `static_instruction`
        # is set, anything in `instruction` becomes USER content — not
        # what we want.
        static_instruction=get_root_agent_prompt(),
        tools=tools,
    )


root_agent = _build_root_agent()

# App-level container that ADK's loader picks up before `root_agent`. The
# context cache covers the static_instruction + tool defs (~5K tokens), well
# above Flash's 4096-token minimum. ADK rotates the underlying cache every
# `cache_intervals` invocations and lets it expire after `ttl_seconds`, so
# a prompt edit propagates within at most one TTL.
app = App(
    name="media_performance_agent",
    root_agent=root_agent,
    context_cache_config=ContextCacheConfig(
        # Refresh the cache every 10 invocations — bounds staleness against
        # tool catalog churn without thrashing on the cache.
        cache_intervals=10,
        # 30-minute TTL. A bumped prompt rolls out on the next cache miss.
        ttl_seconds=1800,
        # Skip caching for tiny requests where the cache overhead would
        # exceed the savings. 4096 is Flash's minimum cacheable size.
        min_tokens=4096,
    ),
)
