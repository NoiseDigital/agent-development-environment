// Public surface of the plans-as-code layer. Mirrors `data/dashboards/`:
// every consumer outside this folder imports from here, so files can move
// around behind the barrel without breaking call sites.
//
// Layered structure:
//   • types.ts        — plan model (Client → Campaign → Line → Creative)
//   • primitives.ts   — shared vocabulary (publishers, formats, KPI goals)
//   • clients/        — one file per client plan
//
// Workflow for adding a new client:
//   1. Copy `clients/noi.ts` → `clients/<code>.ts`.
//   2. Edit clientCode/clientName + the `campaigns` tree.
//   3. Register in `clients/index.ts`.
//   4. Ensure the client code exists in `data/client-codes.ts` and
//      `data/clients.ts` (logo + accent for branding).

export type {
  CampaignPhase,
  ClientPlan,
  PlanCampaign,
  PlanCreative,
  PlanEdit,
  PlanLine,
} from './types';

export {
  CAMPAIGN_PHASES,
  CREATIVE_FORMATS,
  KPI_GOALS,
  MARKETING_OBJECTIVES,
  PLATFORMS,
  PUBLISHERS,
} from './primitives';

// Sourced from the ACTIVE tenant's content (data/tenants/<id>/, via the
// @tenant-content build alias). Consumers import it from this barrel unchanged.
export { clientPlans } from '@tenant-content';
