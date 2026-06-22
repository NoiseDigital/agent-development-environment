"""AutoCorr Assistant — interprets correlation results for the /autocorr page.

A conversational sidekick (not one-shot like dashboard_insights_agent): the
floating panel on /autocorr keeps the session open so the user can ask follow-
ups. The current analysis result is prepended to every user message as a
context preamble; the agent reads that, never re-runs the math.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent

from .prompts.autocorr_assistant_agent import get_autocorr_assistant_agent_prompt

MODEL_NAME = "gemini-2.5-flash"


def _build_autocorr_assistant_agent() -> LlmAgent:
    return LlmAgent(
        model=MODEL_NAME,
        name="AutocorrAssistantAgent",
        description=(
            "Interprets correlation analysis results for the /autocorr page. "
            "Reads the current heatmap + top signals from a context preamble "
            "and explains what's strong, what's noise, what to try next."
        ),
        instruction=get_autocorr_assistant_agent_prompt(),
        tools=[],
    )


root_agent = _build_autocorr_assistant_agent()
