# GenUI envelope

The agent ↔ frontend contract. Every agent reply that surfaces an
interactive element returns the same JSON envelope:

```jsonc
{
  "text": "<markdown prose — the user reads this as the bubble>",
  "ui": [ /* zero or more UIBlock objects */ ]
}
```

`text` and `ui` are independent: `text` is what ReactMarkdown renders in
the bubble; `ui` is a list of typed blocks the frontend dispatches via
the GenUI registry.

## The `text` field

- Plain markdown — the bubble renders with ReactMarkdown + the dark
  prose theme.
- Never serialize the envelope or the `ui` block inside it. The parser
  ([`lib/agent/response.ts`](../services/frontend/src/lib/agent/response.ts))
  is hardened against the failure modes that have shipped, but the rule
  is "prose only" — see [the analyst's prompt](../services/backend/agents/adk_agents/media_performance_agent/prompts/root_agent.py)
  for the agent-side rules.
- Empty / whitespace-only content is rendered as a `LoadingRow`
  ("thinking" spinner) during streaming; outside streaming, a message
  with no `text` AND no `ui` blocks is skipped entirely (no ghost bubble).

## The `ui` field — block catalog

Each block has a `component` discriminator and a typed `props` object.
The full TypeScript definitions are in
[`src/types/genui.ts`](../services/frontend/src/types/genui.ts); registry
of renderers is
[`src/components/genui/registry.tsx`](../services/frontend/src/components/genui/registry.tsx).

### `chart`

Vega-Lite spec rendered by VegaChart.

```jsonc
{ "component": "chart", "props": { /* full Vega-Lite spec */ } }
```

Specs pass through `enrichAgentSpec` first (adds compactNum formatting +
crosshair on temporal lines) and `checkVegaSpec` (mark allowlist + row
cap) before rendering. See [dashboards.md](./dashboards.md) for the chart
themes + helper builders.

### `templated_chart`

Lightweight chart envelope — the agent emits a summary, the frontend
applies a deterministic template. Used by ~90% of chart turns to skip
the VegaChartsAgent LLM call.

```jsonc
{
  "component": "templated_chart",
  "props": {
    "shape": "weekly_trend" | "bar_by_dim" | "pareto",
    "rows":  [ { "name": "...", "value": 12345 }, ... ],
    "title": "<chart title>",
    "valueFormat": "$" | "%" | ""
  }
}
```

Adding a shape: extend `TemplatedShape` + `applyTemplate` in
[`lib/charts/templates.ts`](../services/frontend/src/lib/charts/templates.ts)
AND update the analyst's prompt with the new shape's trigger words.

### `choices`

Tabbed multi-question clarification block. The user answers all
questions, submits once, the combined answers go back as the next
user message.

```jsonc
{
  "component": "choices",
  "props": {
    "intro": "<optional framing shown above the questions>",
    "questions": [
      {
        "question": "Which metric(s)?",
        "multiSelect": true,
        "allowCustom": true,
        "options": [
          { "label": "Spend", "value": "total_spend", "recommended": true },
          ...
        ]
      },
      ...
    ]
  }
}
```

The renderer tolerates legacy shapes too: a single-question payload
(`{question, options}` directly on props), string options, missing
fields. See `normalizeQuestions` in
[`Choices.tsx`](../services/frontend/src/components/genui/Choices.tsx).

### `filters`

Iteration levers — a row of named inputs that re-submit the original
question with new values when the user hits Apply. Field kinds: `select`,
`date`, `number`, `text`.

```jsonc
{
  "component": "filters",
  "props": {
    "title": "Adjust",
    "fields": [
      { "kind": "select", "key": "metric", "label": "Metric", "options": [...], "value": "..." },
      { "kind": "date",   "key": "date_from", "label": "From", "value": "2024-01-01" }
    ]
  }
}
```

### `suggestions`

Follow-up pills. Plain-text strings that send as the next user message
when clicked.

```jsonc
{
  "component": "suggestions",
  "props": {
    "title": "Want to look at",
    "items": ["Break this down by publisher", "Compare to prior quarter"]
  }
}
```

### `action`

Side-effecting block the editor agent emits — the frontend interprets it
and runs the matching handler in
[`lib/dashboards/actions.ts`](../services/frontend/src/lib/dashboards/actions.ts).
Action kinds + their payloads: see [agents.md](./agents.md#editor-agent-actions).

## Parser failure modes the platform tolerates

The agent's contract is "JSON only," but LLM output is never perfectly
compliant. [`lib/agent/response.ts`](../services/frontend/src/lib/agent/response.ts)
recovers from:

- Envelope wrapped in a markdown code fence (` ```json ... ``` `).
- Envelope embedded in prose ("Here you go: { ... }").
- Bare Vega-Lite spec without the `{ text, ui }` wrap.
- Python literals (`True` / `False` / `None`) in place of JSON literals.
- Trailing commas before `}` / `]`.
- Envelope copy embedded inside the `text` field (the model
  "self-documenting" its reply).
- Prose followed by an envelope-shaped JSON dump (the screenshot
  regression — recovers the prose, drops the dump).
- Malformed / truncated envelopes — recovers the `text` field at minimum
  so the bubble shows clean prose instead of raw JSON.
- Trailing or in-message data-row dumps (the model echoing the chart's
  data array into the text field).
- Invisible characters (zero-width chars, BOM, bidi marks, soft
  hyphens, variation selectors, Hangul fillers) — the ChatMessage layer
  strips `\p{Default_Ignorable_Code_Point}` before deciding if a bubble
  has visible content.

Every failure mode is pinned by a regression test in
[`agent-response.test.ts`](../services/frontend/src/lib/agent/response.test.ts).
Add a new case when you find a new variant in the wild.

## Streaming

While the agent is generating, the in-flight stream's accumulated text
runs through `streamingDisplayText` — best-effort partial extraction of
the `text` field from possibly-incomplete JSON. The streaming cursor
sits inline at the end of the partial prose. Never let raw `{` braces
leak into the bubble during stream — that's the visual regression
`streamingDisplayText` was written to prevent.

After `turnComplete`, the parsed snapshot replaces the streaming
projection. See [`hooks/useChat.ts`](../services/frontend/src/hooks/useChat.ts)
and [`lib/agent/projection.ts`](../services/frontend/src/lib/agent/projection.ts)
for the lifecycle.
