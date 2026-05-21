from google.adk.agents import LlmAgent

from shared.toolbox import get_toolbox_client

from .prompts.choices_agent import get_choices_agent_prompt


def _build_choices_agent() -> LlmAgent:
    """A tool-using agent: it queries the real media data so every option it
    offers is grounded — actual publishers, campaign phases, platforms and the
    dates that genuinely exist — instead of generic guesses. Using tools rules
    out an output_schema, so it emits a JSON draft; the parent worker relays it
    and the ResponseFormatter produces the final { text, ui } envelope."""
    toolbox = get_toolbox_client()
    tools = toolbox.load_toolset("media_performance_recharts_friendly")
    return LlmAgent(
        model="gemini-2.5-flash",
        name="ChoicesAgent",
        description="Turn an ambiguous request into one data-grounded choices block of clarifying questions.",
        instruction=get_choices_agent_prompt(),
        tools=tools,
    )


root_agent = _build_choices_agent()
