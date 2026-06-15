# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap — the shared CI/CD foundation, applied ONCE by an admin.
#
# Creates, in the automation project:
#   - the GCS bucket that stores Terraform state for every env,
#   - the Artifact Registry Docker repo (build once, promote across stages),
#   - a Workload Identity pool + provider so GitHub Actions authenticates to GCP
#     WITHOUT long-lived JSON keys, and
#   - the CI deployer service account + its role grants.
#
# Run with an admin's own credentials and LOCAL state (see versions.tf), then
# optionally migrate state into the bucket it just created.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # APIs the automation project itself needs.
  bootstrap_apis = [
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
  ]
}

resource "google_project_service" "bootstrap" {
  for_each           = toset(local.bootstrap_apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Terraform state bucket ──────────────────────────────────────────────────
resource "google_storage_bucket" "tfstate" {
  name                        = var.state_bucket_name
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true # keep state history so a bad apply is recoverable
  }

  depends_on = [google_project_service.bootstrap]
}

# ── Artifact Registry (Docker images for all stages) ────────────────────────
resource "google_artifact_registry_repository" "platform" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repo_id
  format        = "DOCKER"
  description   = "Backend service images (gateway, agent, mcp-stats). Built once, promoted across stages."

  depends_on = [google_project_service.bootstrap]
}

# ── CI deployer service account ─────────────────────────────────────────────
resource "google_service_account" "ci_deployer" {
  project      = var.project_id
  account_id   = "ci-deployer"
  display_name = "GitHub Actions CI/CD deployer"
}

# Push rights into the Artifact Registry repo (lives in the automation project).
resource "google_artifact_registry_repository_iam_member" "ci_push" {
  project    = var.project_id
  location   = google_artifact_registry_repository.platform.location
  repository = google_artifact_registry_repository.platform.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# Deploy rights into each target tenant-stage project. Flattened so every
# (project, role) pair is its own binding.
resource "google_project_iam_member" "ci_deployer" {
  for_each = {
    for pair in setproduct(var.target_projects, var.ci_deployer_roles) :
    "${pair[0]}::${pair[1]}" => { project = pair[0], role = pair[1] }
  }
  project = each.value.project
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# ── Workload Identity Federation (keyless GitHub Actions auth) ──────────────
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Federated identity for GitHub Actions workflows."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Hard-restrict the provider to THIS repo so no other repo can mint tokens.
  attribute_condition = "assertion.repository == \"${var.github_owner}/${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Let workflows from the repo impersonate the CI deployer SA.
resource "google_service_account_iam_member" "ci_wif" {
  service_account_id = google_service_account.ci_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_owner}/${var.github_repo}"
}
