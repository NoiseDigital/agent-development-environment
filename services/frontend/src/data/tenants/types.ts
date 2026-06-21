// The content contract every tenant index must satisfy. The shared facades and
// barrels rely on this shape being identical across tenants.
import type { Client } from "@/data/media-model";
import type { Dashboard } from "@/data/dashboards/types";
import type { ClientPlan } from "@/data/plans/types";

export interface TenantContent {
  clients: Client[];
  KNOWN_CLIENT_CODES: readonly string[];
  clientDashboards: Dashboard[];
  clientPlans: ClientPlan[];
}
