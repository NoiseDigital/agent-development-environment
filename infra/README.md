# Infrastructure (deploy-as-code)

Everything here is Terraform + GitHub Actions. No clicking in consoles, no
`firebase init`. Single tenant per GCP project; stages are project suffixes.

```
project_id = "<tenant_id>-<stage>"     e.g. nd-agentspace-sbx, nd-agentspace-prod
```

## Layout

| Path | What it is |
|------|------------|
| `bootstrap/` | One-time, admin-run: TF state bucket, Artifact Registry, Workload Identity Federation, CI deployer SA. |
| `modules/tenant/` | The reusable per-(tenant,stage) backend stack: APIs, Cloud SQL, Cloud Run (gateway/agent/mcp-stats + migrate job), VPC + private SQL, GCS, Secret Manager, IAM, Firebase. |
| `tenants/<tenant>/<stage>/` | One thin dir per tenant-stage — calls the module, owns its **isolated** state (GCS prefix `tenants/<tenant>/<stage>`). New tenant = new folder under `tenants/`; new stage = new folder under the tenant. |

What deploys where:

- **Backend** (gateway, agent, mcp-stats) → Cloud Run, via `.github/workflows/deploy.yml`.
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
- **agent / mcp-stats / mcp-toolbox** — `INGRESS_TRAFFIC_INTERNAL_ONLY`; invoker
  is `allUsers`, so the network is the boundary. This is a single-tenant project
  (only this tenant's own services are in the VPC), so internal ingress alone is
  sufficient; tighten to per-SA IAM if tenants are ever co-located.

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

1. `cp -r infra/tenants/nd-agentspace/sbx infra/tenants/nd-agentspace/prod` (new stage)
   or `cp -r infra/tenants/nd-agentspace infra/tenants/<new-tenant>` (new tenant)
2. In the copy: set `stage = "prod"` (main.tf locals) and the backend `prefix`
   to `tenants/nd-agentspace/prod` (versions.tf).
3. Add the project to `target_projects` in `bootstrap` and re-apply bootstrap
   (so the CI SA can deploy into it).
4. Add a `.firebaserc` alias (`"prod": "nd-agentspace-prod"`).
5. `terraform init && terraform apply` in the new env dir.

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
