from google.adk.agents import LlmAgent

from shared.genui import AgentResponse

from .prompts.clarification_agent import get_clarification_agent_prompt

# output_schema enforces the GenUI { text, ui } envelope — this is a tool-free
# leaf, so output_schema is allowed.
root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="ClarificationAgent",
    description="Turn an ambiguous request into one clarifying multiple-choice question.",
    instruction=get_clarification_agent_prompt(),
    output_schema=AgentResponse,
)
