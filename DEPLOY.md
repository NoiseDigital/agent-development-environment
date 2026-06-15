# Deploying to GCP

Step-by-step runbook for deploying a tenant-stage (starting with
`nd-agentspace-sbx`). Architecture and the module layout live in
[infra/README.md](infra/README.md); this is the ordered "do these commands" guide.

**What deploys where**

| Component | Target | How |
|-----------|--------|-----|
| Frontend (Next.js + BFF) | Firebase **App Hosting** | native git rollout on push |
| Backend (gateway, agent, mcp-stats, mcp-toolbox) | **Cloud Run** (internal ingress) | GitHub Actions ([deploy.yml](.github/workflows/deploy.yml)) |
| Migrations | Cloud Run **job** (`<stage>-migrate`) | run by CI before each deploy |
| Database | **Cloud SQL** Postgres (private IP) | Terraform |
| Uploads | **GCS** bucket | Terraform + `STORAGE_BACKEND=gcs` |

The browser reaches **only** the frontend; the BFF proxies to the internal
gateway over the VPC. Nothing in the backend is public.

---

## 0. Prerequisites

- The GCP project `nd-agentspace-sbx` exists with **billing enabled**, and you
  have Project IAM Admin (+ rights to create service accounts and WIF pools).
- `gcloud auth application-default login` as that account.
- (state buckets are auto-named `<project>-tfstate` — nothing to choose).

## 1. Bootstrap (one-time foundation)

Creates the per-tenant TF state buckets, Artifact Registry, the Workload
Identity pool, and the CI deployer service account.

```bash
cd infra/bootstrap
# edit terraform.tfvars: set github_owner (state buckets auto-named <project>-tfstate)
terraform init      # local state — it's creating the state buckets
terraform apply
terraform output    # note: state_buckets, artifact_registry, ci_deployer_sa_email, workload_identity_provider
```

Then set these **GitHub repo variables** (Settings → Secrets and variables →
Actions → Variables):

| Variable | Value (from `terraform output`) |
|----------|----------------------------------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `workload_identity_provider` |
| `GCP_CI_SERVICE_ACCOUNT` | `ci_deployer_sa_email` |
| `GCP_REGION` | `us-central1` |
| `DEPLOY_PROJECT` | `nd-agentspace-sbx` |
| `ARTIFACT_REGISTRY` | `artifact_registry` |

## 2. Provision the tenant stack

```bash
cd infra/tenants/nd-agentspace/sbx
# edit terraform.tfvars: set github_owner
terraform init     # uses the GCS backend from step 1
terraform apply    # Cloud SQL + VPC take ~10–15 min
```

Creates: VPC + private Cloud SQL, Cloud Run services (seeded with a placeholder
image), the migrate job, GCS bucket, Secret Manager (DB URL), least-priv runtime
SAs + IAM (gateway internal + BFF-only invoker; deep services internal), and
Firebase (project, web app, email/password auth). App Hosting + Google SSO stay
off until step 3.

> If a first apply hits a transient "API not enabled", just re-run `apply`.

## 3. The interactive bits (can't be automated)

**a. Firebase App Hosting — Developer Connect**
Authorize the GitHub repo once (Firebase console → App Hosting → connect repo, or
`gcloud developer-connect`). Then in the env tfvars:

```hcl
enable_app_hosting     = true
developer_connect_repo = "projects/<p>/locations/<r>/connections/<c>/gitRepositoryLinks/<link>"
```

`terraform apply` → creates the App Hosting backend (builds `services/frontend`
on push to `main`).

**b. Google Workspace SSO**
Create an OAuth **Web** client (APIs & Services → Credentials). Set the consent
screen to **Internal** (Workspace-only — your first hard access gate). Then:

```hcl
google_oauth_client_id     = "....apps.googleusercontent.com"
google_oauth_client_secret = "..."
```

`terraform apply` → enables the Google IdP. Add the App Hosting domain to the
Identity Platform authorized domains.

**c. Google Analytics (optional)**
Link a GA4 property in the Firebase console; `measurementId` then flows through
`terraform output firebase_web_config` automatically.

## 4. Wire prod config

From `terraform output firebase_web_config` and `gateway_url`, fill the real
values in [services/frontend/apphosting.yaml](services/frontend/apphosting.yaml):
`NEXT_PUBLIC_FIREBASE_*`, `GATEWAY_URL` + `GATEWAY_AUDIENCE` (the gateway's
internal URL), the VPC network/subnetwork, and `ALLOWED_EMAIL_DOMAINS`.

Create the web API key secret:

```bash
echo -n "<web api key>" | gcloud secrets create firebase-web-api-key \
  --data-file=- --project nd-agentspace-sbx
```

## 5. First deploy

```bash
git push origin main
```

`deploy.yml`: WIF auth → build gateway/agent/mcp-stats/mcp-toolbox (`--target prod`
where applicable) → push to Artifact Registry → **run the migrate job** → roll the
Cloud Run services (replacing the placeholder images). The frontend builds and
rolls out via App Hosting natively.

## 6. Verify

- App Hosting URL loads → sign in (Google Workspace) → app works.
- `curl https://<gateway-url>/healthz` from **outside** should fail (internal
  ingress); the app works because the BFF reaches it over the VPC.
- Dashboards load (agent → toolbox → BigQuery).

---

## Readiness notes (verify on first deploy)

These are correct per best practice but can't be exercised without a real GCP
deploy — check them first:

1. **Service-to-service networking.** Backend services are internal-ingress;
   callers use `ALL_TRAFFIC` VPC egress so calls to a sibling's `*.run.app` route
   through the VPC (Direct VPC egress) and count as internal. If gateway→agent or agent→toolbox
   calls fail, this is the place to look.
2. **Deterministic Cloud Run URLs.** Env vars use
   `https://<name>-<projectNumber>.<region>.run.app` (to avoid a Terraform cycle).
   This is the canonical v2 form; confirm it equals each service's actual URL.
3. **GCS uploads.** Agent `GcsStorage` + mcp-stats `gs://` reads (gcsfs) are
   implemented but unexercised; upload a file and run Analyze to confirm.

## Adding a stage or tenant

See [infra/README.md](infra/README.md) → "Add a new stage". A new stage =
`tenants/nd-agentspace/<stage>/` (flip `stage` + backend prefix); a new tenant =
`tenants/<tenant>/`. Add the project to bootstrap `target_projects` and re-apply.

## Hardening follow-ups (not blocking)

- Tighten deep-service invokers from `allUsers` to per-SA IAM (needs ID-token
  minting in the gateway/agent HTTP clients).
- Identity Platform **blocking function** to reject disallowed domains at the IdP
  (belt-and-suspenders with the BFF `ALLOWED_EMAIL_DOMAINS`).
