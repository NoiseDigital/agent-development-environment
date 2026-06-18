# ── Tenant: noise ─────────────────────────────────────────────────────────────
# ONE config for ALL of this tenant's stages. Per-stage values come from
# env/<stage>.tfvars and the GCS backend from backend/<stage>.hcl — the two are
# selected together by the infra/Makefile so they can never be mismatched:
#
#     make apply TENANT=noise STAGE=sbx
#
# project_id derives as "<project_prefix>-<stage>" — the stage suffix is never
# hardcoded. Override per stage with `project_id` in env/<stage>.tfvars only when
# a real project breaks that convention (project ids are immutable).

locals {
  tenant_id      = "noise"
  project_prefix = "nd-agentspace" # GCP project namespace; decoupled from tenant_id
  project_id     = var.project_id != "" ? var.project_id : "${local.project_prefix}-${var.stage}"
}

provider "google" {
  project = local.project_id
  region  = var.region
  # Required for APIs like identitytoolkit that demand a quota project when
  # authenticating with user ADC (gcloud auth application-default login).
  user_project_override = true
  billing_project       = local.project_id
}

provider "google-beta" {
  project               = local.project_id
  region                = var.region
  user_project_override = true
  billing_project       = local.project_id
}

module "tenant" {
  source = "../../modules/tenant"

  tenant_id  = local.tenant_id
  stage      = var.stage
  project_id = local.project_id
  region     = var.region

  # Global endpoint: pools Gemini capacity across regions for the best
  # availability (regional endpoints have limited gemini-2.5 capacity and 429
  # under light load). NOTE: the global endpoint gives NO data-residency
  # guarantee — revisit if a tenant requires in-region ML processing.
  vertex_location = "global"

  db_tier = var.db_tier

  admin_emails               = var.admin_emails
  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret

  # Server-side tagging — committed toggle; CONTAINER_CONFIG injected out-of-band.
  enable_sgtm = var.enable_sgtm

  # Datastream CDC → BigQuery — two-phase (see DEPLOY.md §7).
  enable_datastream        = var.enable_datastream
  datastream_create_stream = var.datastream_create_stream
}

output "project_id" {
  value = module.tenant.project_id
}

output "frontend_url" {
  value = module.tenant.frontend_url
}

output "gateway_url" {
  value = module.tenant.gateway_url
}

output "migrate_job" {
  value = module.tenant.migrate_job
}

output "firebase_web_config" {
  value     = module.tenant.firebase_web_config
  sensitive = true
}

# Empty until sGTM is configured; once set, this is the gtag.js
# server_container_url (wire it into vars.NEXT_PUBLIC_GA_SERVER_CONTAINER_URL).
output "sgtm_url" {
  value = module.tenant.sgtm_url
}

# BigQuery dataset receiving the Postgres CDC mirror (empty until enabled).
output "datastream_bq_dataset" {
  value = module.tenant.datastream_bq_dataset
}
