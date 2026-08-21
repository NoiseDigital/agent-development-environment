"""
Agent definition
"""

import os
import sys
from pathlib import Path

from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.genai import types

from .prompts.root_agent import get_root_agent_prompt
from .tools.asana_tools import get_asana_tasks
from .tools.outlook_tools import get_outlook_calendar_events
from .utils.constants import get_agent_description, get_agent_name, get_root_agent_model

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

INTACCT_MCP_URL = os.getenv("INTACCT_MCP_URL", "http://mcp-sage-intacct:8080")

intacct_toolset = MCPToolset(
    connection_params=SseConnectionParams(url=f"{INTACCT_MCP_URL}/sse"),
    tool_filter=[
        "intacct_get_projects_and_tasks",
        "intacct_submit_timesheet",
        "intacct_get_timesheet",
    ],
    errlog=None,
)

AGENT_NAME = get_agent_name()
DESCRIPTION = get_agent_description()
SYSTEM_INSTRUCTIONS = get_root_agent_prompt()
ROOT_MODEL = get_root_agent_model()

safety_settings = [
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold=types.HarmBlockThreshold.OFF,
    ),
]

generate_content_config = types.GenerateContentConfig(
    safety_settings=safety_settings,
    temperature=0.28,
    max_output_tokens=1000,
    top_p=0.95,
)


root_agent = Agent(
    model=ROOT_MODEL,
    name=AGENT_NAME,
    description=DESCRIPTION,
    instruction=SYSTEM_INSTRUCTIONS,
    generate_content_config=generate_content_config,
    tools=[
        get_asana_tasks,
        get_outlook_calendar_events,
        intacct_toolset,
    ],
)
