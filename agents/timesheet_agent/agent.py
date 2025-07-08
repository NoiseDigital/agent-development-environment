"""
Agent definition
"""

from agents.timesheet_agent.utils.constants import get_agent_name, get_agent_description, get_root_agent_model
from agents.timesheet_agent.prompts.root_agent import get_root_agent_prompt
from agents.timesheet_agent.tools.intacct_tools import get_user_docket_ids, build_timesheet_xml, submit_timesheet_xml
from agents.timesheet_agent.tools.outlook_tools import get_outlook_calendar_events
from agents.timesheet_agent.tools.asana_tools import get_asana_tasks
from google.adk.agents import Agent
from google.genai import types

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

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
        get_user_docket_ids,
        build_timesheet_xml,
        submit_timesheet_xml],
)
