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

  tenant_id       = local.tenant_id
  stage           = local.stage
  region          = var.region
  vertex_location = "northamerica-northeast1" # Vertex stays in Montreal

  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret

  admin_emails = var.admin_emails

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
