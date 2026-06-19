from google.adk.agents import LlmAgent

from shared.toolbox import get_toolbox_client

from .prompts.choices_agent import get_choices_agent_prompt


def _build_choices_agent() -> LlmAgent:
    """A tool-using agent: it queries the real media data so every option it
    offers is grounded — actual publishers, campaign phases, platforms and the
    dates that genuinely exist — instead of generic guesses. Emits a JSON draft
    of one `choices` block; the parent root agent finalizes the { text, ui }
    envelope around it."""
    toolbox = get_toolbox_client()
    tools = toolbox.load_toolset("media_performance_query")
    return LlmAgent(
        model="gemini-3.5-flash",
        name="ChoicesAgent",
        description="Turn an ambiguous request into one data-grounded choices block of clarifying questions.",
        instruction=get_choices_agent_prompt(),
        tools=tools,
    )


root_agent = _build_choices_agent()
