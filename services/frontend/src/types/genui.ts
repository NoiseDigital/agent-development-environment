// The GenUI contract — what an agent returns to the chat UI: markdown text plus
// an ordered list of renderable blocks drawn from a fixed component catalog.
//
// Extending the catalog is two steps and nothing else: add a member to UIBlock
// here, and a renderer for it in components/genui/registry. Agents never emit
// arbitrary markup — only blocks whose `component` is in this union.

import type { ChartData } from './chart';

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

/** One proposed change to an ad line within a `recommendation` block. Budget
 *  is the only field today; the shape leaves room for more. */
export interface RecommendationChange {
  /** The ad line to change — its id in the media model. */
  adLineId: string;
  /** The field being changed. Defaults to 'budget'. */
  field?: 'budget';
  /** The line's value as the agent sees it now. */
  from: number;
  /** The proposed value. */
  to: number;
  /** Why this line specifically — shown under the row. */
  reason?: string;
}

/** A closed-loop optimization the agent proposes: a titled set of ad-line
 *  changes the user can apply (and undo) as one batch. The applied changes
 *  flow into the line-change log and surface on the Plan page. */
export interface RecommendationProps {
  /** Headline, e.g. "Shift budget toward converting search lines". */
  title: string;
  /** One or two sentences motivating the whole plan. */
  rationale?: string;
  /** The proposed changes — one row per ad line. */
  changes: RecommendationChange[];
}

/** A Vega-Lite spec. Unlike ChartData — a fixed union the frontend hand-
 *  translates into Recharts — a Vega-Lite spec is an open grammar: `props` and
 *  the chart are one object, rendered by the Vega-Lite compiler with no
 *  per-chart-type frontend code. */
export type VegaSpec = Record<string, unknown>;

/** One renderable block. Discriminated on `component`; `props` is that
 *  component's typed payload. `id` is the handle interactive blocks use to
 *  route events back to the agent. */
export type UIBlock =
  | { component: 'chart'; props: ChartData; id?: string }
  | { component: 'choices'; props: ChoicesProps; id?: string }
  | { component: 'recommendation'; props: RecommendationProps; id?: string }
  | { component: 'vega'; props: VegaSpec; id?: string };

/** Component names an agent may emit — the catalog surface. */
export type UIComponent = UIBlock['component'];

/** The structured response an agent returns (as a JSON string) for one turn. */
export interface AgentResponse {
  /** Markdown text shown to the user. */
  text: string;
  /** Ordered renderable blocks shown beneath the text. */
  ui?: UIBlock[];
}
