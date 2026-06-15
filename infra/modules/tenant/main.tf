# ─────────────────────────────────────────────────────────────────────────────
# tenant module — one tenant-stage's backend stack (Cloud SQL, Cloud Run,
# GCS, Secret Manager, networking, IAM, Firebase). The frontend is NOT here:
# it deploys via Firebase App Hosting's native git rollout (see firebase.tf +
# services/frontend/apphosting.yaml).
#
# Single-tenant-per-project: project_id = "<tenant_id>-<stage>".
#
# NOTE (future): projects are assumed to already exist (configure-existing).
# To have Terraform CREATE them, add a `google_project` here behind a flag and
# grant the runner org/folder + billing rights. Tracked in infra/README.md.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  project_id   = "${var.tenant_id}-${var.stage}"
  name_prefix  = "${var.tenant_id}-${var.stage}"
  gcs_bucket   = "${local.project_id}-uploads"
  is_protected = var.stage == "prod" || var.stage == "uat"
}

# APIs this tenant-stage project needs.
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "aiplatform.googleapis.com",
    "bigquery.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaseapphosting.googleapis.com",
    "iam.googleapis.com",
  ])
  project            = local.project_id
  service            = each.value
  disable_on_destroy = false
}
