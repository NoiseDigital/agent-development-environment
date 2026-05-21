from google.adk.agents import LlmAgent

from shared.genui import AgentResponse

from .prompts.react_charts_agent import get_react_charts_agent_prompt

# output_schema constrains the reply to the GenUI { text, ui } contract — the
# envelope is schema-enforced, not prompted. (An output_schema agent can't use
# tools or transfer; ReactChartsAgent is a pure data-in → chart-spec-out leaf,
# so that's fine.)
root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="ReactChartsAgent",
    description="Convert media performance data into a structured GenUI response (text + chart blocks).",
    instruction=get_react_charts_agent_prompt(),
    output_schema=AgentResponse,
)
