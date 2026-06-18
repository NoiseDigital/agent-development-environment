# Deploying to GCP

The complete, ordered runbook for standing up a tenant-stage from scratch —
every command, secret, manual provision, and external (console) setup flow.

- **Architecture / module layout** → [infra/README.md](infra/README.md)
- **Component internals** (how a thing works, its env vars, design decisions) →
  that component's README (linked inline below)
- **This file** → the single source of truth for *how to set it up*. Other docs
  link here for steps rather than repeating them.

**What runs where**

| Component | Target | Provisioned / deployed by |
|-----------|--------|---------------------------|
| Frontend (Next.js + BFF) | Cloud Run (public ingress) | CI ([deploy.yml](.github/workflows/deploy.yml)) — image; Terraform — service |
| Backend (gateway, agents, mcp-stats, mcp-toolbox) | Cloud Run (internal ingress) | CI — images; Terraform — services |
| Migrations | Cloud Run **job** (`migrate`) | CI runs it before each deploy |
| Database | Cloud SQL Postgres (private IP) | Terraform |
| Uploads | GCS bucket | Terraform |
| sGTM (optional) | Cloud Run (public ingress) | Terraform (gated) + CI image — §6 |
| Datastream CDC (optional) | Datastream + proxy VM | Terraform (gated) + a migration — §7 |

The browser reaches **only** the frontend; the BFF proxies to the internal
gateway over the VPC. Nothing in the backend is public.

---

## How secrets work here (read once)

Terraform always provisions a secret's **container + IAM** (so access is codified
and reproducible). Where the **value** comes from is decided by its **origin**:

- **Originates inside Terraform/GCP** — a generated password, or a value read
  from a GCP data source. Terraform writes the secret version; the value lives in
  Terraform **state** (your secured GCS backend is the trust boundary). Used by:
  `database-url` (generated DB password), `firebase-web-api-key` (Firebase
  data source).
- **Originates outside** — a token a human pastes from a third-party console
  (GTM config, OAuth client secret). The value is added **out-of-band**
  (`gcloud secrets versions add`) and never enters tfvars, the repo, or state.
  Resource **existence** is gated on a **committed, non-secret toggle**
  (e.g. `enable_sgtm`) so a routine `terraform apply` can never destroy it for
  lack of a transient `TF_VAR`. Used by: `sgtm-container-config`.

Rule of thumb: **codify existence + access in Terraform; inject externally-sourced
values out-of-band.** Never gate a resource's existence on a secret value.

---

## 0. Prerequisites

- The GCP project (e.g. `nd-agentspace-sbx`) exists with **billing enabled**, and
  you have Project IAM Admin + rights to create service accounts and WIF pools.
- `gcloud auth application-default login` as that account.
- A GitHub account with admin on the repo + the `gh` CLI (for Environment vars).

## 1. Bootstrap (one-time foundation)

Creates the per-tenant Terraform state bucket, Artifact Registry, the Workload
Identity pool, and the CI deployer service account.

```bash
cd infra/bootstrap
# edit terraform.tfvars: set github_owner (state buckets auto-named <project>-tfstate)
terraform init      # local state — it's creating the state buckets
terraform apply
terraform output    # state_buckets, artifact_registry, ci_deployer_sa_email, workload_identity_provider
```

### CI deploy auth — one GitHub Environment per tenant-stack

Each client = its own GCP project, modelled as a GitHub **Environment** named
`<tenant>-<stage>` (e.g. `noise-sbx`). `deploy.yml` selects it (defaults to
`noise-sbx` on push to `main`; otherwise the `workflow_dispatch` input), scoping
`vars.*` to that environment. Set these as **Environment variables** (Settings →
Environments → `<tenant>-<stage>`), *not* repo-level — they're identifiers, not
secrets (keyless WIF is the trust):

| Variable | Value (from `terraform output`) |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `workload_identity_provider` |
| `GCP_CI_SERVICE_ACCOUNT` | `ci_deployer_sa_email` |
| `GCP_REGION` | `us-central1` |
| `DEPLOY_PROJECT` | the project id |
| `ARTIFACT_REGISTRY` | `artifact_registry` |

```bash
REPO=NoiseDigital/agent-platform ENV=noise-sbx
gh api -X PUT repos/$REPO/environments/$ENV
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --env $ENV -R $REPO -b "<…>"
gh variable set GCP_CI_SERVICE_ACCOUNT         --env $ENV -R $REPO -b "<…>"
gh variable set ARTIFACT_REGISTRY              --env $ENV -R $REPO -b "<…>"
gh variable set GCP_REGION                     --env $ENV -R $REPO -b "us-central1"
gh variable set DEPLOY_PROJECT                 --env $ENV -R $REPO -b "<project_id>"
```

## 2. Provision the tenant stack

```bash
cd infra/tenants/nd-agentspace/sbx
# edit terraform.tfvars: set admin_emails (the bootstrap admin who can invite others)
terraform init     # uses the GCS backend from step 1
terraform apply    # Cloud SQL + VPC take ~10–15 min
```

Creates: VPC + private Cloud SQL, all Cloud Run services (incl. the public
frontend, seeded with a placeholder image), the `migrate` job, the GCS bucket,
Secret Manager secrets, least-privilege runtime SAs + the internal invoker mesh
(every internal hop authenticates with an ID token), and Firebase (project, web
app, email/password auth). Google SSO and the optional components stay off until
their steps below.

> First apply hitting a transient "API not enabled"? Just re-run `apply` — the
> API was enabled mid-run and needs a minute to propagate.

## 3. Google Workspace SSO (external + manual)

Email/password works out of the box; this adds Google sign-in.

1. **Create an OAuth client** — GCP console → APIs & Services → **Credentials** →
   Create credentials → **OAuth client ID** → type **Web application**. Set the
   **OAuth consent screen** to **Internal** (Workspace-only — your first hard
   access gate).
2. **Provide the credentials.** The client id is non-secret; the secret is. Put
   both in a **gitignored** `secrets.auto.tfvars` (matched by `*.auto.tfvars` in
   `infra/.gitignore`, so it's auto-loaded on every apply — no destroy footgun):
   ```hcl
   # infra/tenants/<tenant>/<stage>/secrets.auto.tfvars   (gitignored)
   google_oauth_client_id     = "....apps.googleusercontent.com"
   google_oauth_client_secret = "..."
   ```
3. `terraform apply` → enables the Google IdP. The frontend's Cloud Run URL is
   added to the Identity Platform authorized domains automatically.

## 4. Frontend build config (GitHub vars)

`NEXT_PUBLIC_*` are inlined into the client bundle at **build** time, so they're
GitHub Environment **variables** (the Firebase API key is the exception — it's in
Secret Manager and read by CI at build). Set in the tenant's Environment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from `terraform output firebase_web_config` |

`project_id` + `auth_domain` derive from the project; the API key comes from the
`firebase-web-api-key` secret (created by `terraform apply` from the Firebase
web-app config — see [secrets.tf](infra/modules/tenant/secrets.tf)). Nothing
Firebase-related is committed.

## 5. First deploy + verify

```bash
git push origin main
```

`deploy.yml`: WIF auth → build only the changed services (path-filtered) → push to
Artifact Registry → run the `migrate` job (when the gateway changed) → roll the
Cloud Run services (replacing placeholder images).

Verify:
- `terraform output frontend_url` loads → sign in (Google Workspace, or a
  bootstrap admin from `admin_emails`) → app works.
- `curl https://<gateway-url>/healthz` from outside **fails** (internal ingress);
  the app still works because the BFF reaches the gateway over the VPC.
- Dashboards load (agent → toolbox → BigQuery).

---

## 6. Server-side tagging (sGTM) + Google Analytics — optional

Routes the frontend's `gtag.js` through a server-side GTM container instead of
straight to Google. **How it works / env vars** →
[services/backend/tagging/sgtm/README.md](services/backend/tagging/sgtm/README.md).
Setup:

1. **Create the GTM Server container** (external, one-time) —
   <https://tagmanager.google.com> → Admin → **Create Container** → target
   platform **Server** → **Manually provision tagging server** (NOT automatic —
   that spins up an App Engine instance we don't use) → copy the **Container
   Config** string.
2. **Enable it** — `enable_sgtm = true` in the tenant's `terraform.tfvars`
   (committed), then `terraform apply` (creates the service, `sgtm-container-config`
   secret with a placeholder version, and SA).
3. **Add the Container Config out-of-band** (the only place the value lives):
   ```bash
   printf %s '<Container Config string>' \
     | gcloud secrets versions add sgtm-container-config --data-file=- --project=<project>
   ```
4. **Roll the real image** over Terraform's placeholder — run the **Deploy**
   workflow via `workflow_dispatch` (it builds + deploys `gtm-cloud-image`).
5. **Configure the GTM container** (external) — add a **Google Analytics: GA4**
   tag + an **All Events** trigger (the GA4 client is built in), then **Publish**.
   Without a published tag the server receives hits but forwards nothing.
6. **Point the frontend at it** — set these GitHub Environment vars (the next
   frontend build bakes them in):
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID` — your GA4 web-stream id (e.g. `G-PSTSB8D377`)
   - `NEXT_PUBLIC_GA_SERVER_CONTAINER_URL` — the `sgtm_url` Terraform output
7. **(GA4, optional)** Register the product-event params (`agent`, `method`,
   `status`, …) as **Custom Dimensions** in GA4 to report on them; verify events
   in GA4 → **Realtime**.

> Rotating the config later = repeat step 3 (new secret version); no apply.
> First-party serving (sGTM on a subdomain of your app's custom domain) is a
> future optimization for cookie durability — needs DNS, not required to work.

## 7. Datastream CDC → BigQuery — optional

Streams every Postgres table to BigQuery as a near-real-time merge. **How it
works / the proxy-VM rationale** →
[services/backend/database/datastream/README.md](services/backend/database/datastream/README.md).
Three phases (a migration runs the SQL prereqs between them):

1. **Provision** — `enable_datastream = true` in `terraform.tfvars` (committed),
   then `terraform apply`. Creates the proxy VM, private connection, connection
   profiles, the `platform_cdc` BigQuery dataset, and the `datastream` DB user —
   and **restarts the instance once** (for `cloudsql.logical_decoding` +
   `max_connections`).
2. **Migrate** — merge to `main` (or run the `migrate` job). The
   `datastream_cdc_setup` Alembic migration — run from inside the VPC by the
   migrate job — creates the publication, replication slot, and grants. **No
   manual SQL.** Order matters: the `datastream` role (phase 1) must exist before
   this runs, which it does if you apply before merging.
3. **Start the stream** — set `datastream_create_stream = true` in
   `terraform.tfvars` (committed), then `terraform apply`. It backfills all tables
   then tails changes into `platform_cdc`.

Verify: BigQuery → `platform_cdc` fills (backfill, then ~15-min-fresh merges), and
the Datastream console shows the stream healthy.

---

## Adding a stage or tenant

See [infra/README.md](infra/README.md) → "Add a new stage". A new stage =
`tenants/nd-agentspace/<stage>/`; a new tenant = `tenants/<tenant>/`. Add the
project to bootstrap `target_projects` and re-apply, then repeat §1's *CI deploy
auth* (a new GitHub Environment with that stack's 5 vars) — the one manual,
per-stack step. Deploy it via the `workflow_dispatch` `environment` input.

## Hardening follow-ups (not blocking)

- Identity Platform **blocking function** to reject disallowed domains at the IdP
  (belt-and-suspenders with the BFF allowlist).
- Firebase **App Check** before opening to broader traffic.
- Move the **OAuth client secret** to the same out-of-band Secret Manager pattern
  as sGTM (read via a `data.google_secret_manager_secret_version`) so it never
  sits in a tfvars file or state — do this when you wire up SSO for real.
