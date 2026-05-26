"""One-shot ADK agent that names a chat session from its first few messages."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types

MODEL_NAME = "gemini-2.5-flash"


_INSTRUCTION = """\
Read the chat transcript and write a 3-6 word title summarising it.

Reply with the title ONLY — no quotes, no prefix, no explanation.

Examples:

Input:
USER What's our publisher breakdown?
MODEL Meta leads at $420K, Google second at $210K.
Output: Publisher spend breakdown

Input:
USER Plot weekly spend in 2024
MODEL Weekly spend trended upward in Q3.
Output: 2024 weekly spend trend

Input:
USER Compare Q3 to Q2 CTR
MODEL Q3 CTR was 2.8%, up 14% from Q2.
Output: Q3 vs Q2 CTR
"""


generate_content_config = types.GenerateContentConfig(
    temperature=0.2,
    max_output_tokens=80,
)


root_agent = LlmAgent(
    model=MODEL_NAME,
    name="session_naming_agent",
    description=(
        "Names a chat session from the first few message exchanges. One-shot, "
        "no tools; the response is a single short title string."
    ),
    instruction=_INSTRUCTION,
    generate_content_config=generate_content_config,
)
