# Infrastructure (deploy-as-code)

Everything here is Terraform + GitHub Actions. No clicking in consoles, no
`firebase init`. Single tenant per GCP project; one env dir per (tenant, stage).

The tenant id (folder name) and the GCP `project_id` are **decoupled** — set
`project_id` explicitly in the env's `main.tf`. It defaults to `<tenant_id>-<stage>`
when blank, but need not match:

```
tenant "noise", stage "sbx"  →  project_id = "nd-agentspace-sbx"
```

## Layout

| Path | What it is |
|------|------------|
| `bootstrap/` | One-time, admin-run: TF state bucket, Artifact Registry, Workload Identity Federation, CI deployer SA. |
| `modules/tenant/` | The reusable per-(tenant,stage) backend stack: APIs, Cloud SQL, Cloud Run (gateway/agents/mcp-stats + migrate job), VPC + private SQL, GCS, Secret Manager, IAM, Firebase. |
| `tenants/<tenant>/` | One config dir per tenant (`main.tf`/`variables.tf`/`versions.tf` with a **partial** GCS backend). Each stage is just `env/<stage>.tfvars` (committed) + `backend/<stage>.hcl` (its isolated state) — no config copy per stage. |
| `Makefile` | Picks a stage's tfvars + backend together and runs Terraform: `make apply TENANT=noise STAGE=sbx` (so they can't be mismatched). |

What deploys where:

- **Backend** (gateway, agents, mcp-stats) → Cloud Run, via `.github/workflows/deploy.yml`.
- **Database** → Cloud SQL Postgres (private IP only).
- **Migrations** → a Cloud Run **job** (`<stage>-migrate`), run by CI *before* new API revisions take traffic.
- **Frontend** → Cloud Run (public ingress, standalone Next.js build), via the same `.github/workflows/deploy.yml`.
- **Uploads** → GCS (`STORAGE_BACKEND=gcs`).

## BFF boundary (no public backend)

The browser reaches **only** the public Next.js **frontend** Cloud Run service.
Its `/gw` proxy forwards to the gateway server-side. Nothing in the backend is public:

- **gateway** — `INGRESS_TRAFFIC_INTERNAL_ONLY`; `run.invoker` granted only to
  the **frontend service account** (the BFF reaches it via Direct VPC egress,
  authenticating with a Cloud Run IAM ID token whose audience is the gateway's
  custom audience).
- **agents / mcp-stats / mcp-toolbox** — `INGRESS_TRAFFIC_INTERNAL_ONLY` **and**
  per-SA `run.invoker`: each caller SA is granted invoker on exactly the services
  it calls (the `internal_invokers` map in `cloudrun.tf` — e.g. the gateway SA on
  agents/stats/toolbox; the agent SA on toolbox/stats; the stats SA on the
  gateway). So it's defence-in-depth: internal ingress (network) **plus** IAM
  (identity), not network alone.

No CORS anywhere (same-origin BFF). See `modules/tenant/cloudrun.tf` and
`services/frontend/src/app/gw/[...path]/route.ts`.

---

## Setting up / deploying

This file is the **architecture + module reference**. The ordered, end-to-end
runbook — bootstrap, the GitHub Environment vars, provisioning a stage, secrets,
the interactive console steps, first deploy, and the optional sGTM / Datastream
components — is **[DEPLOY.md](../DEPLOY.md)**. Steps live there; they're not
repeated here.

## Add a new stage (`-dev`, `-uat`, `-prod`)

Stages share the tenant's one config — a new stage is two small files:

1. `tenants/noise/env/prod.tfvars` — `stage = "prod"` (project id derives as
   `<project_prefix>-prod`; set `project_id` only to override), a prod-sized
   `db_tier`, and feature toggles.
2. `tenants/noise/backend/prod.hcl` — `bucket` + `prefix = "tenants/noise/prod"`
   (a fresh stage starts fresh state).
3. Add the project to `target_projects` in `bootstrap` and re-apply bootstrap
   (so the CI SA can deploy into it).
4. Add a `.firebaserc` alias (`"prod": "nd-agentspace-prod"`).
5. `make apply TENANT=noise STAGE=prod` (from `infra/`).

A new **tenant** = `cp -r tenants/noise tenants/<new>`, then edit the `tenant_id`
+ `project_prefix` locals in its `main.tf`.

`prod`/`uat` automatically get deletion protection, regional SQL HA, and PITR
(see `local.is_protected`).

---

## Firebase setup (no `firebase init`)

`firebase init` is an interactive local scaffolder — it doesn't provision
anything and has no place in CI. Provisioning is Terraform:

- `google_firebase_project` — enables Firebase on the project.
- `google_firebase_web_app` — the web app; its config (apiKey, authDomain, appId)
  is a Terraform **output** (`firebase_web_config`). CI bakes the public values
  into the frontend bundle at build (the API key from Secret Manager).
- `google_identity_platform_config` — Firebase Auth (email/password on; add OAuth
  IdPs via `google_identity_platform_default_supported_idp_config`).

We use Firebase for **Auth only** — the frontend is a Cloud Run service we deploy
ourselves (cloudrun.tf + deploy.yml), not Firebase App Hosting. No Developer
Connect, no git-connected build.

Committed config (not provisioning): `firebase.json` (Auth emulator) and
`.firebaserc` (alias→project), both for local dev.

---

## Outstanding / TODO

- **TF-created projects.** Projects are assumed to exist (configure-existing). To
  have Terraform create them, add a `google_project` (folder + billing) behind a
  flag in `modules/tenant` and grant the runner org/folder admin — kept off the CI
  SA to preserve that separation.
- **Per-stage MCP Toolbox config.** `mcp/images/toolbox/tools.yaml` hardcodes the
  `nd-agentspace-sbx` project/dataset. For another stage, template it before the
  image build.
- **Auth hardening (prod)** — defence in depth beyond the BFF/`access_rules`
  allowlist (already invite-by-email + domain, with the OAuth consent screen
  Internal per [DEPLOY.md §3](../DEPLOY.md)): an Identity Platform **blocking
  function** that rejects disallowed domains at the IdP (blocks every provider
  pre-account), and Firebase **App Check**.
