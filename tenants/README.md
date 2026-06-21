# Tenants & modules — feature-enablement source of truth

This directory is the **single source of truth** for what each tenant gets:
which **modules** are enabled, and the tenant's **branding**. Enabling a module
flips its frontend (nav + route + assistant), its agents, and its infra services
**together** — there are no per-service or per-component feature flags scattered
across the repo.

## Files

| File | What it is |
|------|-----------|
| `modules.json` | The **module catalog** — the structural definition of every module: its frontend `route`/`label`, the ADK `agents` it needs, the extra backend `services` it requires, and any `capabilities` (e.g. `floatingAssistant`). Plus a `core` set deployed for every tenant. Same across all tenants. |
| `<id>.json` | A **tenant manifest** — the only per-tenant authored file: `id`, `projectPrefix`, `enabledModules`, and `branding` (brand name, logo, accent ramp). |

`enabledModules` is either `"*"` (the full platform — every module, no agent
allowlist; this is Noise) or an explicit array like `["analyze"]` (a subset).

## Who consumes it

One manifest, read by every layer in its native form — no layer re-declares the
enablement:

- **Terraform** (`infra/modules/tenant`) — `jsondecode`s the catalog + tenant
  manifest to decide which Cloud Run services to deploy and to set the agents
  service's `ENABLED_AGENTS`.
- **`scripts/start_services.sh`** — `jq`s them to pick the local compose service
  subset, `ENABLED_AGENTS`, and `NEXT_PUBLIC_TENANT`.
- **Frontend** — can't read repo-root files at Docker build time, so
  `scripts/gen-tenant-config.mjs` compiles the manifests into the committed
  `services/frontend/src/config/tenants.gen.ts`. The app reads it via
  `src/config/tenant.ts`. CI verifies the committed file is fresh.

## Changing config

1. Edit `modules.json` (to add/retune a module) and/or `<id>.json`.
2. Run `node scripts/gen-tenant-config.mjs` to refresh the frontend config.
3. Commit the manifests **and** the regenerated `tenants.gen.ts` together.

## Add a tenant

```bash
scripts/new-tenant.sh <id> <project-prefix> [module ...]   # modules default to "analyze"
#   e.g.  scripts/new-tenant.sh acme nd-acme analyze dashboards
```

This scaffolds the manifest, regenerates the frontend config, creates the infra
stage (`infra/tenants/<id>/`), and adds a `Start Services: <id>` VS Code task.
Then the script prints the manual steps it can't do for you:

1. **Branding** — edit `tenants/<id>.json` (real accent ramp), add
   `services/frontend/public/<id>_white.svg`, then `node scripts/gen-tenant-config.mjs`.
2. **Modules** — adjust `enabledModules`.
3. **Admin** — set `admin_emails` in `infra/tenants/<id>/env/sbx.tfvars`.
4. **Run locally** — `TENANT=<id> ./scripts/start_services.sh` (or the VS Code task).
5. **Deploy** — create the GCP project + billing, add it to
   `infra/bootstrap/terraform.tfvars` `target_projects` and re-apply, create a
   GitHub Environment `<id>-sbx`, then `make apply TENANT=<id> STAGE=sbx`. Each
   tenant is a fully isolated project/state silo; see [../infra/README.md](../infra/README.md).

## Customizing a tenant

- **Branding + which modules** → config (`tenants/<id>.json`). Lightweight.
- **Agent prompts / instructions / verbose behavior** → **code, not config.** Long
  prompts don't belong in JSON; when a tenant needs a different prompt, add a
  tenant-specific prompt module the agent selects by active tenant, keeping the
  default in code for everyone else. The manifest stays for *which* agents/modules,
  not *how* an agent thinks.
- **Tenant-specific frontend content** (dashboards, client data) → per-tenant data
  dirs under `src/data/`, gated by tenant (expand when a tenant needs its own).

## Testing / no regressions across tenants

The codebase is shared, so a change to a module improves it for every tenant that
enables it. CI guards divergence:

- **`scripts/lint-tenants.mjs`** — every enabled module/agent exists, services are
  real, branding is complete (run locally + in CI).
- **Per-tenant `terraform validate`** and **per-tenant frontend `build`** matrices —
  both auto-derived from `tenants/*.json`, so a new tenant is covered with no CI edit.
- **gen-freshness** — `tenants.gen.ts` must be committed in sync.
