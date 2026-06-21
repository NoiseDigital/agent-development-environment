// CSA tenant content — analyze-only, so the dashboards/plans registries are
// empty. Same export surface as every tenant index (see ../types.ts).
import type { Dashboard } from "@/data/dashboards/types";
import type { ClientPlan } from "@/data/plans/types";

export { clients, KNOWN_CLIENT_CODES } from "./clients";
export const clientDashboards: Dashboard[] = [];
export const clientPlans: ClientPlan[] = [];
