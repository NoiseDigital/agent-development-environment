import os
import logging
from datetime import date

from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.mcp_tool import MCPToolset, SseConnectionParams

from shared.toolbox import get_toolbox_client

from .prompts.root_agent import get_root_agent_prompt
from .subagents.react_charts_agent import root_agent as react_charts_root_agent
from .subagents.clarification_agent import root_agent as clarification_root_agent


def today() -> str:
    """Returns today's date in YYYY-MM-DD format."""
    return date.today().isoformat()


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
MODEL_NAME = "gemini-2.5-flash"

# --- ADK Web Global Agent Instance ---
# This part is specifically for enabling ADK Web usage
# It expects a top-level LlmAgent instance named 'root_agent'.


# Define a function to build the LlmAgent instance.
def _build_llm_agent() -> LlmAgent:
    toolbox = get_toolbox_client()
    tools = toolbox.load_toolset("media_performance_recharts_friendly")
    tools.append(today)
    tools.append(AgentTool(react_charts_root_agent))
    tools.append(AgentTool(clarification_root_agent))

    # Statistical analysis tools (correlation, regression, QA) from the stats MCP server.
    stats_url = os.getenv("MCP_STATS_URL", "http://mcp-stats:8080/sse")
    tools.append(MCPToolset(connection_params=SseConnectionParams(url=stats_url)))
    return LlmAgent(
        model=MODEL_NAME,
        name="MediaPerformanceAgent",
        description="Agent to answer questions about Media Performance with data visualizations and insights.",
        instruction=get_root_agent_prompt(),
        tools=tools,
    )


# Instantiate the LlmAgent at the global level for ADK Web deployments
root_agent = _build_llm_agent()
