// Plan model — the editable side of the platform. Mirrors the hierarchy
// the performance table joins back to:
//
//   Client → Campaign → Line → Creative
//
// IDs follow the convention seen in BQ rows
// (`line_id = NOI-23-01-002`, `creative_id_name = NOI-23-01-002-001`):
// a Line's id is the join key into performance; each Creative's id is the
// line id plus a `-NNN` suffix. The schema below keeps those literal so the
// plan IS the join key — no second mapping table required.
//
// Nothing in this file knows about persistence or any specific client —
// it's pure structure. The localStorage shim lives in `lib/user-plans.ts`;
// the per-client seed lives in `clients/<code>.ts`.

/** Phase of a campaign's lifecycle — must match `campaign_phase` values in BQ. */
export type CampaignPhase = 'Book' | 'Travel' | 'Plan';

/** A creative riding on a single line. The creative is the actual served
 *  ad; the line carries the buy mechanics (publisher, budget, dates). */
export interface PlanCreative {
  /** `<line_id>-NNN`, e.g. `NOI-23-01-002-001`. Stable; never edited. */
  id: string;
  name: string;
  /** Optional URL to the creative preview (image, video frame, etc.). */
  previewUrl?: string;
}

/** A line item — the buy unit. One publisher, one objective, one budget,
 *  one flight window. Every performance row in BQ joins to a plan line via
 *  `line_id`. */
export interface PlanLine {
  /** `<CLIENT>-<year>-<campaign>-<line>`, e.g. `NOI-23-01-002`. The join
   *  key into the performance table — never edited after creation. */
  id: string;
  publisher: string;
  platform: string;
  /** Tracking event the publisher fires (matches `objective` column). */
  objective: string;
  /** Human-readable goal (matches `marketing_objective` column). */
  marketingObjective: string;
  /** Matches `creative_format` column — narrows the publisher's inventory. */
  creativeFormat: string;
  /** Total budget for this line (USD; matches `budget` column). */
  budget: number;
  /** Flight window — used to scope the performance join + compute pacing. */
  flightStart: string; // YYYY-MM-DD
  flightEnd: string;   // YYYY-MM-DD
  /** Creatives served against this line. At least one. */
  creatives: PlanCreative[];
}

/** A campaign — a logical grouping of lines under one objective. */
export interface PlanCampaign {
  /** `<CLIENT>-<year>-<campaign>`, e.g. `NOI-23-01`. The shared prefix of
   *  every line under this campaign. */
  id: string;
  /** Human-readable label (matches `campaign` column in BQ). */
  name: string;
  phase: CampaignPhase;
  /** Region / market grouping (matches `market_group`). */
  marketGroup: string;
  /** Primary KPI archetype (matches `kpi_goal` — referral / awareness / etc.). */
  kpiGoal: string;
  lines: PlanLine[];
}

/** A client's full media plan — the top of the tree. */
export interface ClientPlan {
  /** The uppercase client code. Same as the client id used elsewhere. */
  clientCode: string;
  /** Display name — pulled from `data/clients` at hydration time. */
  clientName: string;
  campaigns: PlanCampaign[];
}

/** A single edit to a plan line, captured for the per-line history drawer.
 *  Stored as a flat append-only log keyed by line id. */
export interface PlanEdit {
  /** Wall-clock timestamp (ms epoch). */
  at: number;
  /** Author of the change — `getCurrentUser().displayName` at edit time. */
  by: string;
  /** Field that changed. Use the same string as the column header so the
   *  history reads naturally. */
  field: string;
  /** Before / after values, stringified for display. `null` means "blank". */
  before: string | null;
  after: string | null;
}
