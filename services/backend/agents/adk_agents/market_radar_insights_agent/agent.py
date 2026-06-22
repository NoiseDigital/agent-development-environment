"""Competitive Insights tile — one-shot ADK agent that turns an estimator-result
payload into structured insight bullets. Output is constrained by
`LlmAgent.output_schema` (same pattern as dashboard_insights_agent). Stateless;
one shot per estimate. Replaces the notebook's hardcoded Vertex/Gemini call.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types
from pydantic import BaseModel, Field

MODEL_NAME = "gemini-2.5-flash"


class _Insight(BaseModel):
    type: str = Field(
        ..., description="2-4 word category label, e.g. 'Market Intensity'."
    )
    insight: str = Field(
        ..., description="One sentence (≤ 40 words) citing a number from the input."
    )
    tone: str = Field("neutral", description="positive | negative | neutral")


class _InsightsResponse(BaseModel):
    insights: list[_Insight]


_INSTRUCTION = """\
You are a senior competitive-media analyst. The user message is a JSON object
summarising a Competitive Media Intelligence estimate: observed vs estimated
spend (with a low/high range), the model-support score, per-market and per-brand
estimates, share-of-voice leaders, and a count of low-support cells.

Produce 3-5 short insight bullets an account director would say in a status
meeting. Hard rules:
- Every `insight` MUST cite at least one number or named brand/market FROM THE
  INPUT verbatim. Do NOT invent numbers, brands, or markets.
- These are DIRECTIONAL estimates, not actuals — frame them that way, and lean
  on share-of-voice (a ratio) when the absolute estimate has low support.
- The `model_support` figure is a DATA-COVERAGE score, NOT statistical
  confidence. If it's low, say the estimate is thinly supported.
- Prefer comparative bullets ("Globex leads US SOV at 38% vs Acme's 31%") over
  flat ones ("Globex spent a lot").
- tone="positive" for a clear opportunity/strength, "negative" for a risk or
  thin-data caveat, "neutral" for context.
- 3 sharp grounded bullets beat 5 vague ones. Skip what you can't ground.

Return JSON ONLY in this exact shape:
{
  "insights": [
    { "type": "...", "insight": "...", "tone": "positive|negative|neutral" }
  ]
}
"""

generate_content_config = types.GenerateContentConfig(
    temperature=0.3,
    max_output_tokens=800,
)


root_agent = LlmAgent(
    model=MODEL_NAME,
    name="market_radar_insights_agent",
    description=(
        "Generates analyst-style insight bullets from a Competitive estimator "
        "result payload. Stateless; one shot per estimate."
    ),
    instruction=_INSTRUCTION,
    generate_content_config=generate_content_config,
    output_schema=_InsightsResponse,
)
