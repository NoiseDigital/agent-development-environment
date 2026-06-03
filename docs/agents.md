# Agents

The platform's agents live in [`services/backend/agents/adk_agents/`](../services/backend/agents/adk_agents/).
Every agent is an ADK `LlmAgent` wrapped in an `App` with a `ContextCacheConfig`.
The frontend talks to them via the ADK runtime's REST + SSE endpoints,
proxied through the gateway.

## Catalog

| Agent | Purpose | Notes |
|---|---|---|
| `media_performance_agent` | The analyst. Owns chart + clarification workflows; data tools live here. | Has 3 subagents: ChoicesAgent, VegaChartsAgent, AnalyzeAssistantAgent. |
| `dashboard_editor_agent` | Acts on the user's open dashboard — pin chart, rename, recolour, update/remove tile. | Delegates analytical work to media_performance_agent via AgentTool. |
| `dashboard_insights_agent` | One-shot. Generates the narrative tile on a dashboard. | Non-conversational. |
| `analyze_assistant_agent` | One-shot. Interprets a Analyze-page correlation result. | Pinned right-rail chat. |
| `session_naming_agent` | One-shot. Names a chat session from its first turn. | Powers the typing-effect rename. |
| `timesheet_agent` | Timesheet-flow conversational agent. | Independent of media analyst. |
| `data_agent` | Legacy SFDC-shaped agent kept for reference. | Not currently wired into the UI. |
| `.demos/` (`bidi_agent`, `a2a_orchestrator_agent`, `hello_world_agent`, `math_agent`, `gcp_release_notes_agent`) | ADK reference agents. | Hidden from ADK auto-discovery because the loader skips `.`-prefixed directories. To run one, copy its folder back up to `adk_agents/`. |

## The `{ text, ui }` envelope

Every agent that can render a chart / choices / filter block returns the
same JSON envelope:

```jsonc
{
  "text": "<analyst prose, markdown — what the user reads>",
  "ui": [
    { "component": "chart" | "templated_chart" | "choices" | "filters" | "suggestions" | "action", "props": { ... } }
  ]
}
```

The full contract — every component's props, the parser's failure modes,
the `text` field rules — lives in [genui.md](./genui.md).

## Branch routing (media_performance_agent root)

The analyst's [root prompt](../services/backend/agents/adk_agents/media_performance_agent/prompts/root_agent.py)
sorts every turn into ONE of these branches:

- **Branch 0 — modify the previous chart.** Delegates to VegaChartsAgent
  with the previous chart's spec (or templated_chart props) embedded in
  the request as `MODIFY: <change>\nExisting chart: <JSON>`.
  VegaChartsAgent owns the diff-don't-regenerate logic and the
  template-expansion knowledge — root is just routing.
- **Branch 1 — ambiguous request.** Default path emits a templated
  clarification envelope inline (metric + time range + viz style choices).
  Fallback: call ChoicesAgent for novel asks needing data-grounded options
  (publisher list, market groups).
- **Branch 2 — chart turn.** Default path emits `templated_chart` for
  common shapes (`bar_by_dim`, `weekly_trend`, `pareto`) after ONE data
  tool call. Fallback: VegaChartsAgent for novel encodings.
- **Branch 3 — scalar / definitional / explanatory.** Text-only reply.
- **Branch 4 — small-talk / greeting.** Inline static envelope, no subagent.

## Editor agent actions

[dashboard_editor_agent](../services/backend/agents/adk_agents/dashboard_editor_agent/prompts/dashboard_editor_agent.py)
emits action blocks the frontend interprets. Current action kinds:

| kind | Effect |
|---|---|
| `pin_chart` | Pin a Vega spec to (dashboard_id, tab_id). |
| `set_accent` | Write a hex to the dashboard's accent override. |
| `rename_dashboard` | Update a user dashboard's display name. |
| `update_tile` | Patch a tile's presentation overrides (title/subtitle/valueFormat/accent/description). |
| `remove_tile` | Drop a tile by id (pinsApi.remove or soft-remove via overrides). |

The agent identifies tiles by the `[id=<tile_id>]` suffix on each
manifest line in the dashboard-context preamble. **It must never guess
an id** — that rule is load-bearing for update_tile / remove_tile.

## Why subagents

ChoicesAgent / VegaChartsAgent are PEERS, not children. They own one
shape of output each. The root agent calls them via `AgentTool`, gets
back a complete envelope, and either returns it verbatim or wraps it
(e.g., editor adds a `pin_chart` action alongside).

This split exists because:
- Each subagent has a focused prompt (~1-3k tokens) instead of one
  monolithic prompt with every rendering rule in it.
- The root's prompt fits the cache window (≥4096 tokens for Flash); each
  turn skips re-uploading the static instruction. Same for subagents.
- Behavior tests in `agents.yaml` can pin "this branch must / must not
  call subagent X" — caught at CI time, not at user-report time.

## Call graph — who reaches whom

The platform's services have one circular reference worth knowing about:
`agent` calls `mcp-stats` (`MCP_STATS_URL`, for in-chat statistics tool calls),
and `mcp-stats` calls back into `agent` (`AGENT_URL`, to resolve a source
manifest to its actual rows). docker-compose orders
`mcp-stats depends_on agent`, so in dev the agent comes up first; in Cloud
Run both can be cold and either can wake the other.

```text
                         frontend
                            │
                            ▼
                    ┌─────────────────┐
                    │  gateway (8080) │ ← the only public ingress
                    └────────┬────────┘
                             │
       ┌──────────┬──────────┼──────────────┐
       │          │          │              │
       ▼          ▼          ▼              ▼
   agent     mcp-toolbox  mcp-stats     postgres
   (ADK)     (BigQuery)   (correlate/qa  (platform
                          /describe)     schema +
                                         ADK tables)
       │                       ▲
       │     in-chat stats     │
       └───────────────────────┘  ← agent ↔ stats cycle
                  │
                  ▼
             mcp-stats resolves
             a source manifest
             from the agent
```

The cycle is fine at runtime (both services stay warm), but it means
mcp-stats can't function until the agent is reachable. If you ever need to
break the cycle (e.g. for an isolated stats-only deployment), pass the
source rows IN the stats request rather than having stats re-resolve them
from the agent.

## Tests

Live LLM behavior tests in
[`services/backend/agents/tests/agents.yaml`](../services/backend/agents/tests/agents.yaml)
— declarative cases; the harness sends each `message` through the named
agent and checks the `expect` block (UI components, tool calls,
forbidden tools, no-UI assertions).

Gateway endpoint tests in
[`services/backend/gateway/tests/`](../services/backend/gateway/tests/) —
fast pytest unit tests with the DB pool stubbed.
