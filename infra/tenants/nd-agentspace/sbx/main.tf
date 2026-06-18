# nd-agentspace, stage = sbx → project nd-agentspace-sbx.
# Copy this directory to add a stage (envs/nd-agentspace-prod/), flip `stage`
# and the backend prefix, and add the .firebaserc alias.

locals {
  tenant_id  = "nd-agentspace"
  stage      = "sbx"
  project_id = "${local.tenant_id}-${local.stage}"
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
  source = "../../../modules/tenant"

  tenant_id = local.tenant_id
  stage     = local.stage
  region    = var.region
  # Global endpoint: pools Gemini capacity across regions for the best
  # availability (regional endpoints like northamerica-northeast1 have limited
  # gemini-2.5 capacity and 429 under light load). NOTE: the global endpoint
  # gives NO data-residency guarantee — revisit if a tenant requires in-region
  # ML processing (then use a high-capacity region + Provisioned Throughput).
  vertex_location = "global"

  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret

  admin_emails = var.admin_emails

  # Server-side tagging. Empty until a GTM Server container exists; supply via
  # TF_VAR_sgtm_container_config to light up the sgtm service (stored as a secret).
  sgtm_container_config = var.sgtm_container_config

  # Datastream CDC → BigQuery. enable_datastream provisions the infra; run
  # setup.sql, then flip datastream_create_stream to start streaming.
  enable_datastream        = var.enable_datastream
  datastream_create_stream = var.datastream_create_stream

  # sbx is a sandbox — keep it cheap.
  db_tier = "db-f1-micro"
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
