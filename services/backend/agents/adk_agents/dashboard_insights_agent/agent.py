"""Noise Analyst tile — one-shot ADK agent that turns a totals payload into
structured insight bullets. Output is constrained by `LlmAgent.output_schema`."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types
from pydantic import BaseModel, Field

MODEL_NAME = "gemini-2.5-flash"


class _Insight(BaseModel):
    headline: str = Field(..., description="2-6 word lede shown in bold.")
    body: str = Field(
        ..., description="One sentence (≤ 25 words) of supporting context."
    )
    tone: str = Field("neutral", description="positive | negative | neutral")


class _InsightsResponse(BaseModel):
    insights: list[_Insight]


_INSTRUCTION = """\
You are a senior media analyst. The user message will be a JSON object with
the totals for the active window (and optionally the prior window) of a
media-performance dashboard. Produce 3-5 short bullet insights that an
account director would say out loud in a status meeting.

The payload may also include a `dashboard` object describing the tab the
user is looking at:
{
  "dashboard_name": "...",
  "tab_label": "Overall",
  "other_tabs": ["Awareness", "Engagement", ...],
  "tiles_on_tab": ["- KPI: Spend", "- Trend: total_spend over time", ...]
}
When present, use it to:
- Reference visible tiles by their label ("the Spend KPI is up 14% vs prior").
- Call out an angle the user might miss on this tab ("CTR is the only
  metric NOT shown here — and it's down 9%").
- Suggest a different tab when the bullet's natural follow-up lives there
  ("check the Awareness tab for the publisher-level breakdown").
- NEVER invent tiles that aren't in `tiles_on_tab`.

Hard rules (apply regardless of whether `dashboard` is present):
- Every bullet's `body` MUST cite at least one number FROM THE INPUT verbatim.
  Do NOT invent numbers.
- Prefer comparative bullets ("up 14% vs prior", "concentrated 62% in Meta")
  over flat ones ("spend was $X").
- Skip bullets you can't ground. 3 sharp bullets beats 5 vague ones.
- Use tone="positive" when the bullet is a clear win, "negative" when it's
  a problem to flag, "neutral" for context.
- Headlines should READ — "Spend climbed 14%", not "Spend Climbed By 14 Percent".

Return JSON ONLY in this exact shape:
{
  "insights": [
    { "headline": "...", "body": "...", "tone": "positive|negative|neutral" }
  ]
}
"""

# ADK requires `output_schema` on the LlmAgent (not in generate_content_config).
generate_content_config = types.GenerateContentConfig(
    temperature=0.3,
    max_output_tokens=800,
)


root_agent = LlmAgent(
    model=MODEL_NAME,
    name="dashboard_insights_agent",
    description=(
        "Generates analyst-style insight bullets from a media-performance "
        "totals payload. Stateless; one shot per dashboard refresh."
    ),
    instruction=_INSTRUCTION,
    generate_content_config=generate_content_config,
    output_schema=_InsightsResponse,
)
