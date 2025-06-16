from google.adk.agents import Agent
from google.genai import types
from tools.get_exchange_rate import get_exchange_rate

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

root_agent = Agent(
   model=model,                                    
   name='hello_world_agent',
   description='This is a simple agent that responds to greetings.',
   instruction="you are a helpful assistant",
   generate_content_config=generate_content_config,
#    tools=[get_exchange_rate]
)
