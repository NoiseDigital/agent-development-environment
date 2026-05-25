"""One-shot ADK agent that names a chat session from its first few messages."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types

MODEL_NAME = "gemini-2.5-flash"


_INSTRUCTION = """\
You name chat sessions. Given the recent message history, return a SHORT
descriptive title for the conversation.

Hard rules:
- 2-6 words.
- ≤ 50 characters total.
- No quotes, no markdown, no explanation, no "Title:" prefix — ONLY the title.
- Sentence-case (capitalise the first word + proper nouns; everything else lowercase).
- Action-oriented or topic-led — "Optimise CPC for Q3" not "A chat about CPC".
"""


generate_content_config = types.GenerateContentConfig(
    temperature=0.4,
    max_output_tokens=40,
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
