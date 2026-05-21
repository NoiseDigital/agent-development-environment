from google.adk.agents import LlmAgent

from shared.genui import AgentResponse

from .prompts.response_formatter import get_response_formatter_prompt

# Terminal step of the media agent pipeline. output_schema guarantees a valid
# { text, ui } envelope — this is what makes the response deterministic, instead
# of relying on the tool-using worker to hand-format JSON.
root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="ResponseFormatter",
    description="Formats the worker's draft into the final {text, ui} GenUI response.",
    instruction=get_response_formatter_prompt(),
    output_schema=AgentResponse,
)
