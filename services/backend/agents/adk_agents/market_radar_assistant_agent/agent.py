"""Competitive Assistant — guides + interprets the /competitive estimator.

A conversational sidekick (like autocorr_assistant_agent, not one-shot): the
panel on /competitive keeps the session open for follow-ups. The page's current
state (selected source + estimator result) is prepended to every user message as
a context preamble; the agent reads that, never re-runs the estimate itself.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent

from .prompts.market_radar_assistant_agent import (
    get_market_radar_assistant_agent_prompt,
)

MODEL_NAME = "gemini-2.5-flash"


def _build_market_radar_assistant_agent() -> LlmAgent:
    return LlmAgent(
        model=MODEL_NAME,
        name="CompetitiveAssistantAgent",
        description=(
            "Guides users through the Competitive Media Intelligence Estimator "
            "and interprets its output — spend estimates, share-of-voice, and the "
            "model-support score — from a context preamble. Advisory only."
        ),
        instruction=get_market_radar_assistant_agent_prompt(),
        tools=[],
    )


root_agent = _build_market_radar_assistant_agent()
