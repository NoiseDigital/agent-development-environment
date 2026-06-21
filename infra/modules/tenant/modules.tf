# ─────────────────────────────────────────────────────────────────────────────
# Module registry → per-tenant service & agent enablement.
#
# The tenant's enabled modules (tenants/<id>.json) and the module catalog
# (tenants/modules.json) decide which Cloud Run services this tenant deploys and
# what the agents service loads (ENABLED_AGENTS). These are the SAME manifests
# the frontend (via scripts/gen-tenant-config.mjs) and start_services.sh read —
# one source of truth for "what a tenant gets". Enabling a module in the manifest
# flips its services + agents here automatically; there are no per-service
# toggles to keep in sync. (Orthogonal infra features like sGTM / Datastream stay
# as their own committed tfvar toggles — they aren't app modules.)
# ─────────────────────────────────────────────────────────────────────────────

locals {
  _catalog  = jsondecode(file("${path.module}/../../../tenants/modules.json"))
  _manifest = jsondecode(file("${path.module}/../../../tenants/${var.tenant_id}.json"))

  # "*" = the full platform (every module, no agent allowlist) — Noise. tolist()
  # keeps both conditional branches a list type (enabledModules is the "*" string
  # for the full-platform tenant, a list otherwise); the false branch is never
  # evaluated when _all_modules is true, so tolist("*") never runs.
  _all_modules = local._manifest.enabledModules == "*"
  _module_keys = local._all_modules ? keys(local._catalog.modules) : tolist(local._manifest.enabledModules)

  # Services this tenant runs = core + the union of its enabled modules' services.
  enabled_services = toset(concat(
    local._catalog.core.services,
    flatten([for m in local._module_keys : local._catalog.modules[m].services]),
  ))
  deploy_toolbox = contains(local.enabled_services, "mcp-toolbox")

  # Agent allowlist for the agents runtime. Empty ("") = load every agent (the
  # full-platform tenant); otherwise core agents + the union of module agents.
  enabled_agents = local._all_modules ? "" : join(",", sort(distinct(concat(
    local._catalog.core.agents,
    flatten([for m in local._module_keys : local._catalog.modules[m].agents]),
  ))))
}
