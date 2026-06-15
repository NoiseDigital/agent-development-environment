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
- **Frontend** → Firebase **App Hosting**, built & rolled out from git natively (not in the workflow).
- **Uploads** → GCS (`STORAGE_BACKEND=gcs`).

## BFF boundary (no public backend)

The browser reaches **only** the Next.js frontend (App Hosting). Its `/gw` proxy
forwards to the gateway server-side. Nothing in the backend is public:

- **gateway** — `INGRESS_TRAFFIC_INTERNAL_ONLY`; `run.invoker` granted only to
  the **App Hosting service account** (the BFF reaches it via Direct VPC egress,
  authenticating with a Cloud Run IAM ID token).
- **agent / mcp-stats / mcp-toolbox** — `INGRESS_TRAFFIC_INTERNAL_ONLY`; invoker
  is `allUsers`, so the network is the boundary. This is a single-tenant project
  (only this tenant's own services are in the VPC), so internal ingress alone is
  sufficient; tighten to per-SA IAM if tenants are ever co-located.

No CORS anywhere (same-origin BFF). See `modules/tenant/cloudrun.tf` and
`services/frontend/src/app/gw/[...path]/route.ts`.

---

## One-time bootstrap

Run by someone with project IAM admin, using their own credentials.

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # fill project, github_*, target_projects
terraform init        # local state — it's creating the state buckets
terraform apply
```

Note the outputs (`state_buckets`, `artifact_registry`, `ci_deployer_sa_email`,
`workload_identity_provider`) — they feed the env backends and the GitHub repo
variables below.

### GitHub Environment vars (Settings → Environments → `<tenant>-<stage>`)

Per-tenant deploy targets, so the 5 deploy vars live in a **GitHub Environment**
named `<tenant>-<stage>` (e.g. `noise-sbx`), not repo-wide — `deploy.yml` selects
it so `vars.*` resolve per tenant. Manual, once per stack. Full rationale + `gh`
commands: [DEPLOY.md](../DEPLOY.md) → "CI deploy auth".

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | bootstrap output `workload_identity_provider` |
| `GCP_CI_SERVICE_ACCOUNT` | bootstrap output `ci_deployer_sa_email` |
| `GCP_REGION` | `us-central1` |
| `DEPLOY_PROJECT` | `nd-agentspace-sbx` |
| `ARTIFACT_REGISTRY` | bootstrap output `artifact_registry` |

## Provision a stage

```bash
cd infra/tenants/nd-agentspace/sbx
# edit terraform.tfvars (github_owner/repo)
terraform init        # uses the GCS backend from bootstrap
terraform apply
```

Then push real images (the first `apply` seeds a placeholder image; CI rolls the
real ones):

```bash
git push origin main      # triggers .github/workflows/deploy.yml → sbx
```

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
  is a Terraform **output** (`firebase_web_config`) you drop into
  `services/frontend/apphosting.yaml`.
- `google_identity_platform_config` — Firebase Auth (email/password on; add OAuth
  IdPs via `google_identity_platform_default_supported_idp_config`).
- `google_firebase_app_hosting_backend` — the git-connected frontend deploy.

Committed config (not provisioning): `firebase.json` (emulator), `.firebaserc`
(alias→project), `services/frontend/apphosting.yaml` (App Hosting runtime env).

### The one interactive step: Developer Connect

App Hosting builds from git, which needs a **Developer Connect** link to the
GitHub repo — a one-time GitHub-App authorization that can't be done headless.
Do it once (console: Firebase → App Hosting → Connect repo, or
`gcloud developer-connect`), then set in the env tfvars:

```hcl
enable_app_hosting     = true
developer_connect_repo = "projects/<p>/locations/<r>/connections/<c>/gitRepositoryLinks/<link>"
```

and `terraform apply`. Until then, `enable_app_hosting = false` — the Firebase
project/web app/auth still apply, so the emulator and client-SDK wiring work.

---

## Outstanding / TODO

- **TF-created projects.** Projects are assumed to exist (configure-existing).
  To have Terraform create them, add a `google_project` (folder + billing) behind
  a flag in `modules/tenant` and grant the runner org/folder admin. Not the CI
  SA's job — keep that separation.
- **MCP Toolbox image.** `mcp/images/toolbox/tools.yaml` hardcodes
  `nd-agentspace-sbx` (project + dataset). Per stage, template it and bake a tiny
  image (`FROM toolbox; COPY tools.yaml`), then set `mcp_toolbox_image` in the env
  tfvars. Until set, the toolbox service is skipped (`count = 0`).
- **apphosting.yaml values.** Replace the placeholders with
  `terraform output firebase_web_config` + `gateway_url`; create the
  `firebase-web-api-key` secret.
- **`allowed_origins`.** After the first frontend deploy, set it to the App
  Hosting domain and `terraform apply` (gateway CORS).
- **Firebase Auth app code** — DONE. The BFF (Next.js) verifies the Firebase
  session (httpOnly cookie) and forwards `X-User-*` to the gateway; the gateway
  reads those + owns the `users` table. Sign-in: email/password (invite-only —
  no signup) + Google. Access is gated by `ALLOWED_EMAIL_DOMAINS` in the BFF.
- **Auth access hardening (prod).** The BFF domain allowlist is app-layer. Add,
  for defence in depth: (1) OAuth consent screen set to **Internal** (Workspace
  org only) so only org users can use Google sign-in; (2) an **Identity Platform
  blocking function** (`beforeCreate`/`beforeSignIn`) that rejects disallowed
  domains at the IdP — blocks ALL providers before the account is even created.
- **Invite list.** Extend the gate to also permit specific external emails from
  the `users` table (invite), not just whole domains.
