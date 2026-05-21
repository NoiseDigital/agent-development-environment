import os
import logging
from datetime import date

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.mcp_tool import MCPToolset, SseConnectionParams

from shared.toolbox import get_toolbox_client

from .prompts.root_agent import get_root_agent_prompt
from .subagents.react_charts_agent import root_agent as react_charts_root_agent
from .subagents.choices_agent import root_agent as choices_root_agent
from .subagents.response_formatter import root_agent as response_formatter


def today() -> str:
    """Returns today's date in YYYY-MM-DD format."""
    return date.today().isoformat()


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
MODEL_NAME = "gemini-2.5-flash"


def _build_worker() -> LlmAgent:
    """The worker: queries media data, runs analysis, and delegates charts /
    clarifying questions to its subagents — producing a draft answer."""
    toolbox = get_toolbox_client()
    tools = toolbox.load_toolset("media_performance_recharts_friendly")
    tools.append(today)
    tools.append(AgentTool(react_charts_root_agent))
    tools.append(AgentTool(choices_root_agent))

    # Statistical analysis tools (correlation, regression, QA) from the stats MCP server.
    stats_url = os.getenv("MCP_STATS_URL", "http://mcp-stats:8080/sse")
    tools.append(MCPToolset(connection_params=SseConnectionParams(url=stats_url)))
    return LlmAgent(
        model=MODEL_NAME,
        name="MediaPerformanceWorker",
        description="Queries media performance data and drafts the analysis.",
        instruction=get_root_agent_prompt(),
        tools=tools,
        output_key="draft",
    )


# A tool-using LlmAgent can't carry an output_schema, so its hand-formatted JSON
# is unreliable. Splitting the turn fixes that: the worker (tools) drafts the
# answer, then the ResponseFormatter (output_schema, no tools) turns that draft
# into the deterministic { text, ui } envelope as the terminal step.
root_agent = SequentialAgent(
    name="MediaPerformanceAgent",
    description="Agent to answer questions about Media Performance with data visualizations and insights.",
    sub_agents=[_build_worker(), response_formatter],
)
