# ── Tenant: csa ───────────────────────────────────────────────────────────────
# ONE config for ALL of this tenant's stages. Per-stage values come from
# env/<stage>.tfvars and the GCS backend from backend/<stage>.hcl — the two are
# selected together by the infra/Makefile so they can never be mismatched:
#
#     make apply TENANT=csa STAGE=sbx
#
# Which modules/services/agents csa gets is NOT set here — it's derived from
# tenants/csa.json (enabledModules) + tenants/modules.json by the tenant module
# (see infra/modules/tenant/modules.tf), the same manifests the frontend and
# start_services.sh read. csa v1 = analyze only → no mcp-toolbox, analyze agents.

locals {
  tenant_id      = "csa"
  project_prefix = "nd-csa" # GCP project namespace; decoupled from tenant_id
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
  # availability. NOTE: no data-residency guarantee — revisit if csa requires
  # in-region ML processing.
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

output "sgtm_url" {
  value = module.tenant.sgtm_url
}

output "datastream_bq_dataset" {
  value = module.tenant.datastream_bq_dataset
}
