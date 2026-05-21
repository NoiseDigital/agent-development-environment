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

/** One renderable block. Discriminated on `component`; `props` is that
 *  component's typed payload. `id` is the handle interactive blocks use to
 *  route events back to the agent. */
export type UIBlock =
  | { component: 'chart'; props: ChartData; id?: string }
  | { component: 'choices'; props: ChoicesProps; id?: string };

/** Component names an agent may emit — the catalog surface. */
export type UIComponent = UIBlock['component'];

/** The structured response an agent returns (as a JSON string) for one turn. */
export interface AgentResponse {
  /** Markdown text shown to the user. */
  text: string;
  /** Ordered renderable blocks shown beneath the text. */
  ui?: UIBlock[];
}
