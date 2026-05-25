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
"""

import logging
import os
from datetime import date

from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.mcp_tool import McpToolset, SseConnectionParams

from shared.toolbox import get_toolbox_client

from .prompts.root_agent import get_root_agent_prompt
from .subagents.choices_agent import root_agent as choices_root_agent
from .subagents.vega_charts_agent import root_agent as vega_charts_root_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"


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
    stats_url = os.getenv("MCP_STATS_URL", "http://mcp-stats:8080/sse")
    tools.append(McpToolset(connection_params=SseConnectionParams(url=stats_url)))

    return LlmAgent(
        model=MODEL_NAME,
        name="MediaPerformanceAgent",
        description=(
            "Routes media-performance questions to the right specialist "
            "subagent (ChoicesAgent for ambiguity, VegaChartsAgent for "
            "visualised answers); answers text-only questions directly."
        ),
        instruction=get_root_agent_prompt(),
        tools=tools,
    )


root_agent = _build_root_agent()
