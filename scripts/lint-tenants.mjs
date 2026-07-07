#!/usr/bin/env node
// Validates the tenant manifests against the rest of the repo so a bad manifest
// fails CI, not a deploy. Checks:
//   - enabledModules is "*" or a subset of the module catalog
//   - every enabled (+ core) module agent exists under adk_agents/
//   - every module service is a real docker-compose service
//   - branding has the required fields + full accent ramp
//   - (warn) the tenant's logo asset exists in the frontend public dir
//
// Run: node scripts/lint-tenants.mjs   (also runs in CI)

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TENANTS = join(ROOT, "tenants");
const AGENTS_DIR = join(ROOT, "services/backend/agents/adk_agents");
const PUBLIC_DIR = join(ROOT, "services/frontend/public");
const COMPOSE = join(ROOT, "docker-compose.yml");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const ACCENT_KEYS = ["100", "300", "400", "500", "600", "900", "950", "onDark", "onLight"];

const errors = [];
const warnings = [];

const catalog = readJson(join(TENANTS, "modules.json"));
const moduleKeys = Object.keys(catalog.modules);

// Real agent package dirs (ADK skips dot-dirs + __pycache__).
const agentDirs = new Set(
  readdirSync(AGENTS_DIR).filter(
    (n) => !n.startsWith(".") && n !== "__pycache__" && statSync(join(AGENTS_DIR, n)).isDirectory(),
  ),
);
// Service names declared in docker-compose (cheap parse of top-level `  name:`).
const composeServices = new Set(
  readFileSync(COMPOSE, "utf8")
    .split("\n")
    .map((l) => l.match(/^ {2}([a-z0-9-]+):\s*$/i))
    .filter(Boolean)
    .map((m) => m[1]),
);

// Catalog agents must all resolve to real agent dirs.
const catalogAgents = [
  ...catalog.core.agents,
  ...moduleKeys.flatMap((k) => catalog.modules[k].agents),
];
for (const a of catalogAgents) {
  if (!agentDirs.has(a)) errors.push(`modules.json references agent "${a}" with no adk_agents/${a}/ dir`);
}
for (const k of moduleKeys) {
  for (const s of catalog.modules[k].services) {
    if (!composeServices.has(s)) errors.push(`module "${k}" references service "${s}" not in docker-compose.yml`);
  }
}

const tenantFiles = readdirSync(TENANTS).filter((f) => f.endsWith(".json") && f !== "modules.json");
for (const file of tenantFiles) {
  const t = readJson(join(TENANTS, file));
  const where = `tenants/${file}`;

  // enabledModules
  const mods = t.enabledModules;
  if (mods !== "*") {
    if (!Array.isArray(mods)) errors.push(`${where}: enabledModules must be "*" or an array`);
    else for (const m of mods) if (!moduleKeys.includes(m)) errors.push(`${where}: unknown module "${m}"`);
  }

  // analytics — every tenant must declare its OWN GA4 destination (may be empty
  // = no analytics). Required + explicit so a new tenant can't silently inherit
  // another tenant's property: there is no shared fallback anywhere.
  if (t.analytics === undefined || typeof t.analytics.measurementId !== "string") {
    errors.push(`${where}: analytics.measurementId is required (string; "" = analytics off)`);
  }

  // branding
  const b = t.branding ?? {};
  for (const field of ["brandName", "logo", "logoAlt", "accent", "emailDomain", "favicon", "defaultTheme", "font", "charts", "tagline"]) {
    if (b[field] === undefined) errors.push(`${where}: branding.${field} is required`);
  }
  if (b.accent) {
    for (const k of ACCENT_KEYS) {
      if (typeof b.accent[k] !== "string") errors.push(`${where}: branding.accent.${k} missing`);
    }
  }
  // Brand assets — warn (often added after the manifest). No cross-tenant
  // fallback: a missing favicon shows the browser default, never another tenant's.
  for (const asset of ["logo", "favicon"]) {
    if (typeof b[asset] === "string" && !existsSync(join(PUBLIC_DIR, b[asset].replace(/^\//, "")))) {
      warnings.push(`${where}: ${asset} ${b[asset]} not found in services/frontend/public/ (add it before deploy)`);
    }
  }
}

// Deploy targets (.github/deploy-targets.json) must reference a real tenant AND
// a provisioned stage (infra/tenants/<tenant>/env/<stage>.tfvars) — so the
// deploy matrix can never fan out to a tenant/stage that doesn't exist.
const DEPLOY_TARGETS = join(ROOT, ".github/deploy-targets.json");
const tenantIds = new Set(
  tenantFiles.map((f) => readJson(join(TENANTS, f)).id),
);
if (existsSync(DEPLOY_TARGETS)) {
  const dt = readJson(DEPLOY_TARGETS);
  const where = ".github/deploy-targets.json";
  if (!Array.isArray(dt.targets)) {
    errors.push(`${where}: "targets" must be an array`);
  } else {
    const seen = new Set();
    const TRIGGERS = ["push", "tag", "manual"];
    for (const t of dt.targets) {
      const env = `${t.tenant}-${t.stage}`;
      if (!t.tenant || !t.stage) errors.push(`${where}: each target needs "tenant" and "stage" (got ${JSON.stringify(t)})`);
      if (!TRIGGERS.includes(t.trigger)) errors.push(`${where}: ${env} trigger must be one of ${TRIGGERS.join(", ")}`);
      if (t.branch !== undefined && typeof t.branch !== "string") errors.push(`${where}: ${env} branch must be a string`);
      if (seen.has(env)) errors.push(`${where}: duplicate target ${env}`);
      seen.add(env);
      if (t.tenant && !tenantIds.has(t.tenant)) errors.push(`${where}: ${env} references unknown tenant "${t.tenant}" (no tenants/${t.tenant}.json)`);
      const tfvars = join(ROOT, `infra/tenants/${t.tenant}/env/${t.stage}.tfvars`);
      if (t.tenant && t.stage && !existsSync(tfvars)) {
        errors.push(`${where}: ${env} has no infra/tenants/${t.tenant}/env/${t.stage}.tfvars (provision the stage first)`);
      }
    }
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✘ ${e}`);
  console.error(`\n${errors.length} tenant manifest error(s).`);
  process.exit(1);
}
console.log(`✔ tenant manifests valid (${tenantFiles.length} tenants, ${moduleKeys.length} modules)${warnings.length ? `, ${warnings.length} warning(s)` : ""}`);
