"""
Agent definition
"""

from google.adk.agents import Agent
from google.genai import types

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent.parent))
from src.agents.hello_world_agent.tools.get_exhange_rate_tool import get_exchange_rate
from src.agents.hello_world_agent.prompts.root_agent import get_root_agent_prompt

AGENT_NAME = "hello_world_agent"

model = "gemini-2.0-flash"

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

instruction = get_root_agent_prompt()

root_agent = Agent(
   model=model,                                    
   name=AGENT_NAME,
   description='This is a simple agent that responds to greetings.',
   instruction=instruction,
   generate_content_config=generate_content_config,
   tools=[get_exchange_rate],
)

