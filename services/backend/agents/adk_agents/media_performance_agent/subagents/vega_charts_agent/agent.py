"""VegaChartsAgent — produces the final { text, ui } envelope when the answer
includes a chart.

A peer of ChoicesAgent: each subagent owns one shape of response. ChoicesAgent
emits a `choices` block; VegaChartsAgent emits a `chart` block. The root agent
decides which workflow the user's request needs, fetches the data via its own
toolset, and hands the data + intent to the right subagent. The subagent is
responsible for producing a clean envelope — the root passes that envelope
through verbatim.

The subagent does NOT have data tools of its own: it must trust and use the
data the parent passed in `request`. This keeps the agent's job narrow and
prevents a double-fetch (or worse, hallucinated numbers when the agent
"reconciles" its own fetch with the parent's data).
"""

from google.adk.agents import LlmAgent

from .prompts.vega_charts_agent import get_vega_charts_agent_prompt


def _build_vega_charts_agent() -> LlmAgent:
    return LlmAgent(
        model="gemini-2.5-flash",
        name="VegaChartsAgent",
        description=(
            "Turns the parent's analysis intent + tool results into a clean "
            "{ text, ui } envelope with a Vega-Lite chart block."
        ),
        instruction=get_vega_charts_agent_prompt(),
        # No tools — the subagent's only job is to render. The parent supplies
        # all the data in its `request` argument.
        tools=[],
    )


root_agent = _build_vega_charts_agent()
