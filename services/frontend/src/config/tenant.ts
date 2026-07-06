// Tenant runtime selector + capability helpers.
//
// The tenant is chosen at BUILD time via NEXT_PUBLIC_TENANT (baked per image —
// each project deploys its own build). Everything branding/gating-related in the
// app reads from here, so there are no per-component feature flags: enabling a
// module in tenants/<id>.json flips its nav, route, and assistant together.
//
// Source of truth: tenants/<id>.json + tenants/modules.json → tenants.gen.ts
// (regenerate with `node scripts/gen-tenant-config.mjs`).

import { MODULE_CATALOG, TENANTS } from "./tenants.gen";

export type TenantId = keyof typeof TENANTS;
export type ModuleKey = keyof typeof MODULE_CATALOG.modules;

const DEFAULT_TENANT: TenantId = "noise";

function resolveTenant(): TenantId {
  const id = process.env.NEXT_PUBLIC_TENANT;
  return id && id in TENANTS ? (id as TenantId) : DEFAULT_TENANT;
}

export const TENANT: TenantId = resolveTenant();
export const tenant = TENANTS[TENANT];
export const branding = tenant.branding;

/** This tenant's analytics destination — baked per-tenant in tenants/<id>.json.
 *  `measurementId` decides which GA4 property gtag hits; empty = analytics is a
 *  no-op. There is deliberately NO env/default fallback, so a tenant can never
 *  emit into another tenant's property. The sGTM relay URL is environment-
 *  specific and stays an env var (NEXT_PUBLIC_GA_SERVER_CONTAINER_URL). */
export const analytics = tenant.analytics;

/** "*" means the full platform — every module on, no agent allowlist. No tenant
 *  uses it today (all are explicit), but the shorthand stays supported. */
const ALL_MODULES = (tenant.enabledModules as readonly string[] | "*") === "*";

export function isModuleEnabled(key: ModuleKey): boolean {
  return ALL_MODULES || (tenant.enabledModules as readonly string[]).includes(key);
}

export interface NavModule {
  key: ModuleKey;
  label: string;
  route: string;
  description: string;
}

/** Enabled modules in catalog order — drives the home grid and sidebar nav. */
export const enabledModules: NavModule[] = (
  Object.keys(MODULE_CATALOG.modules) as ModuleKey[]
)
  .filter(isModuleEnabled)
  .map((key) => {
    const m = MODULE_CATALOG.modules[key];
    return { key, label: m.label, route: m.route, description: m.description };
  });

/** Top-level route prefixes this tenant does NOT have — for middleware gating. */
export const disabledRoutes: string[] = (
  Object.keys(MODULE_CATALOG.modules) as ModuleKey[]
)
  .filter((key) => !isModuleEnabled(key))
  .map((key) => MODULE_CATALOG.modules[key].route);

/** True when any enabled module *provides* the given platform capability.
 *  This is how modules declare loose dependencies: a module needs a capability
 *  (e.g. AutoCorr's "save to dashboard"), another module provides it (dashboards),
 *  and the UI adapts when it's absent instead of breaking. */
export function hasCapability(cap: string): boolean {
  return (
    ALL_MODULES ||
    (Object.keys(MODULE_CATALOG.modules) as ModuleKey[]).some(
      (key) =>
        isModuleEnabled(key) &&
        (MODULE_CATALOG.modules[key].capabilities as readonly string[]).includes(cap),
    )
  );
}

/** The global FloatingAssistant belongs to any module that declares the
 *  `floatingAssistant` capability (agents / dashboards). Off for analyze-only
 *  tenants — it would otherwise spawn a media_performance_agent session that
 *  isn't in their stack. */
export const showFloatingAssistant: boolean = hasCapability("floatingAssistant");

/** Charts can be pinned to a dashboard only when an enabled module provides it
 *  (the dashboards module). Without it, the chart menu degrades to export-only
 *  (PNG / SVG / data) — so AutoCorr/Market Radar work standalone on CSA. */
export const canPinToDashboard: boolean = hasCapability("pinToDashboard");
