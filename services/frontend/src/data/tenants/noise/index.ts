// Noise tenant content. The active tenant's content resolves to one of these
// index modules via the @tenant-content build alias (next.config.ts + tsconfig
// paths). Keep the export surface identical across tenants (see ../types.ts).
export { clients, KNOWN_CLIENT_CODES } from "./clients";
export { clientDashboards } from "./dashboards";
export { clientPlans } from "./plans";
