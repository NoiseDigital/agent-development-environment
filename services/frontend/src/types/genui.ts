// The GenUI contract — what an agent returns to the chat UI: markdown text plus
// an ordered list of renderable blocks drawn from a fixed component catalog.
//
// Extending the catalog is two steps and nothing else: add a member to UIBlock
// here, and a renderer for it in components/genui/registry. Agents never emit
// arbitrary markup — only blocks whose `component` is in this union.

/** One selectable option in a clarifying question. */
export interface ChoiceOption {
  /** What the user sees. */
  label: string;
  /** Sent back to the agent when picked — defaults to `label` if omitted. */
  value?: string;
}

/** An option as it may arrive from an agent: a {label,value} object, or a
 *  bare string used as both label and value. */
export type ChoiceOptionInput = ChoiceOption | string;

/** A single clarifying question within a `choices` block. */
export interface ChoiceQuestion {
  question: string;
  options: ChoiceOptionInput[];
  /** Allow picking several options. */
  multiSelect?: boolean;
  /** Allow a free-text answer alongside the options. */
  allowCustom?: boolean;
}

/** A clarifying-questions block — every ambiguity the agent needs resolved,
 *  grouped into one tabbed block the user answers in a single pass. */
export interface ChoicesProps {
  /** Optional one-line framing shown above the questions. */
  intro?: string;
  /** 1–4 clarifying questions. */
  questions: ChoiceQuestion[];
}

/** A Vega-Lite spec — the platform's one chart format. An open grammar (mark +
 *  encoding + transform): `props` and the chart are one object, rendered by the
 *  Vega-Lite compiler with no per-chart-type frontend code. */
export type VegaSpec = Record<string, unknown>;

/** One lever on a `filters` block — the agent declares which knobs the user
 *  can turn, and the block renders the right control for each.
 *
 *  `key` is the parameter name the agent will recognise when the user submits;
 *  `label` is what the user sees. `value` is the currently-set value; the
 *  block submits `<key>=<value>` pairs back to the agent on Apply. */
export type FilterField =
  | {
      kind: 'select';
      key: string;
      label: string;
      options: ChoiceOptionInput[];
      value?: string;
    }
  | { kind: 'date'; key: string; label: string; value?: string }
  | {
      kind: 'number';
      key: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      value?: number;
    }
  | { kind: 'text'; key: string; label: string; placeholder?: string; value?: string };

/** One side-effecting dashboard edit the editor agent asks the frontend to
 *  apply. The frontend interprets these block-by-block and runs the matching
 *  handler in dashboard-actions.ts. Unknown `kind` values are ignored.
 *
 *  Kinds:
 *    - `pin_chart`        — pin a Vega spec to (dashboardId, tab_id)
 *    - `set_accent`       — write a hex into dashboard-overrides
 *    - `rename_dashboard` — write a name into user-dashboards
 *    - `update_tile`      — patch an existing tile's presentation overrides
 *                           (title, subtitle, valueFormat, accent, description).
 *                           Partial — fields omitted are left unchanged.
 *    - `remove_tile`      — drop a tile from the dashboard (pinsApi.remove for
 *                           chart pins, soft-removed via overrides otherwise). */
export type ActionProps =
  | { kind: 'pin_chart'; tab_id: string; spec: VegaSpec }
  | { kind: 'set_accent'; hex: string }
  | { kind: 'rename_dashboard'; name: string }
  | {
      kind: 'update_tile';
      tile_id: string;
      presentation: {
        title?: string;
        subtitle?: string;
        description?: string;
        valueFormat?: string;
        accent?: string;
      };
    }
  | { kind: 'remove_tile'; tile_id: string };

/** Proactive follow-up pills — one-click "ask this" chips the agent drops
 *  beneath a reply. Clicking a pill sends its text as the next user message,
 *  so the chat reads as a guided exploration. */
export interface SuggestionsProps {
  /** Optional short header above the pills, e.g. "Want to look at…". */
  title?: string;
  /** Plain-text follow-up prompts — 2-4 ideal. */
  items: string[];
}

/** Lightweight "levers" — controls the user can adjust to re-run the same
 *  question with new parameters. Surfaced next to a chart so an analyst can
 *  iterate on an answer without leaving the chat bubble. Submitting reposts
 *  the original question with the updated params baked into the message. */
export interface FiltersProps {
  /** Optional headline shown above the controls. */
  title?: string;
  /** One control per lever the agent wants exposed. */
  fields: FilterField[];
  /** Button label — defaults to "Update". */
  applyLabel?: string;
}

/** One renderable block. Discriminated on `component`; `props` is that
 *  component's typed payload. `id` is the handle interactive blocks use to
 *  route events back to the agent. */
/** Templated chart payload — the agent emits this for common shapes
 *  (weekly_trend, bar_by_dim, pareto) and the frontend applies a
 *  deterministic Vega-Lite template at render time. Skips the
 *  VegaChartsAgent subagent's LLM call entirely. See `lib/charts/templates.ts`.
 *
 *  Kept as `Record<string, unknown>` here so the type module stays free of
 *  vega-template imports; the consumer narrows via `coerceTemplatedChartProps`. */
export type TemplatedChartProps = Record<string, unknown>;

export type UIBlock =
  | { component: 'chart'; props: VegaSpec; id?: string }
  | { component: 'templated_chart'; props: TemplatedChartProps; id?: string }
  | { component: 'choices'; props: ChoicesProps; id?: string }
  | { component: 'filters'; props: FiltersProps; id?: string }
  | { component: 'suggestions'; props: SuggestionsProps; id?: string }
  | { component: 'action'; props: ActionProps; id?: string };

/** Component names an agent may emit — the catalog surface. */
export type UIComponent = UIBlock['component'];

/** The structured response an agent returns (as a JSON string) for one turn. */
export interface AgentResponse {
  /** Markdown text shown to the user. */
  text: string;
  /** Ordered renderable blocks shown beneath the text. */
  ui?: UIBlock[];
}
