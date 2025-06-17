"""
Agent definition
"""

from google.adk.agents import Agent
from google.genai import types

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from agents.hello_world_agent.tools.get_exhange_rate_tool import get_exchange_rate
from agents.hello_world_agent.prompts.root_agent import get_root_agent_prompt
from agents.hello_world_agent.utils.constants import get_agent_name, get_agent_description, get_root_agent_model

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
   tools=[get_exchange_rate],
)

