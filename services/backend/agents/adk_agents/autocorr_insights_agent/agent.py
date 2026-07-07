"""AutoCorr Insights tile — one-shot ADK agent that turns a correlation-result
payload into structured insight bullets. Output is constrained by
`LlmAgent.output_schema` (same pattern as market_radar_insights_agent). Stateless;
one shot per analysis. Gives AutoCorr the same "instant analyst read" the Market
Radar tile already has.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types
from pydantic import BaseModel, Field

MODEL_NAME = "gemini-2.5-flash"


class _Insight(BaseModel):
    type: str = Field(
        ..., description="2-4 word category label, e.g. 'Strongest Driver'."
    )
    insight: str = Field(
        ..., description="One sentence (≤ 40 words) citing a number from the input."
    )
    tone: str = Field("neutral", description="positive | negative | neutral")


class _InsightsResponse(BaseModel):
    insights: list[_Insight]


_INSTRUCTION = """\
You are a senior data analyst. The user message is a JSON object summarising an
AutoCorr run over the user's dataset: the analysis `mode` (correlate or regress),
the method/settings, and the results — for correlation, the top signal pairs with
their r and p; for regression, the fit quality and per-driver coefficients with
95% CIs and significance.

Produce 3-5 short insight bullets an analyst would say reviewing the output. Hard
rules:
- Every `insight` MUST cite at least one number and the real column name(s) FROM
  THE INPUT verbatim. Do NOT invent columns, numbers, or relationships.
- Correlation is NOT causation, and a regression coefficient is a CONDITIONAL
  association (effect holding other drivers fixed) — never claim one variable
  "causes" another.
- Always pair an effect with its evidence: cite r AND p (correlation), or the
  coefficient AND its CI/significance (regression). A result that is `ns`, or a CI
  spanning 0, is not distinguishable from no effect — say so.
- Flag likely LEAKAGE / definitional links (e.g. clicks ↔ CTR, spend ↔
  impressions) rather than presenting them as findings.
- tone="positive" for a clear actionable driver, "negative" for a risk, a
  non-result, or a data caveat, "neutral" for context.
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
    name="autocorr_insights_agent",
    description=(
        "Generates analyst-style insight bullets from an AutoCorr correlation or "
        "regression result payload. Stateless; one shot per analysis."
    ),
    instruction=_INSTRUCTION,
    generate_content_config=generate_content_config,
    output_schema=_InsightsResponse,
)
