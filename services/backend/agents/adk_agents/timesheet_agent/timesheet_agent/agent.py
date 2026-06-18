from .utils.constants import get_agent_name, get_agent_description, get_root_agent_model
from .utils.model_router import before_model_callback
from .prompts.root_agent import get_root_agent_prompt
from .tools.intacct_tools import (
    get_user_docket_ids,
    build_timesheet_xml,
    submit_timesheet_xml,
)
from .tools.outlook_tools import get_outlook_calendar_events
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.genai import types

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

ASANA_MCP_URL = os.getenv("ASANA_MCP_URL", "http://mcp-asana:8080")


def _asana_headers(ctx) -> dict[str, str]:
    return {"X-Asana-User-Id": ctx.user_id} if ctx.user_id else {}


asana_toolset = MCPToolset(
    connection_params=SseConnectionParams(url=f"{ASANA_MCP_URL}/sse"),
    header_provider=_asana_headers,
    tool_filter=[
        "get_asana_tasks",
        "get_task",
        "list_projects",
        "create_task",
        "update_task",
        "add_comment",
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
    before_model_callback=before_model_callback,
    tools=[
        asana_toolset,
        get_outlook_calendar_events,
        get_user_docket_ids,
        build_timesheet_xml,
        submit_timesheet_xml,
    ],
)
