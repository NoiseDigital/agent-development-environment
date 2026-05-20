from google.adk.agents import LlmAgent

from .prompts.react_charts_agent import get_react_charts_agent_prompt


root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="ReactChartsAgent",
    description="Convert BigQuery data into structured JSON responses with text analysis and chart visualizations for a media analyst chat interface",
    instruction=get_react_charts_agent_prompt(),
)
