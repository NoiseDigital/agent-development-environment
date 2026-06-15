# ── Identity ────────────────────────────────────────────────────────────────
variable "tenant_id" {
  type        = string
  description = "Tenant root id, e.g. \"nd-agentspace\"."
}

variable "stage" {
  type        = string
  description = "Deployment stage suffix: sbx | dev | uat | prod."
  validation {
    condition     = contains(["sbx", "dev", "uat", "prod"], var.stage)
    error_message = "stage must be one of: sbx, dev, uat, prod."
  }
}

variable "region" {
  type        = string
  description = "Region for Cloud Run, Cloud SQL, GCS, and App Hosting."
  default     = "us-central1"
}

# ── Source repo (for Firebase App Hosting git rollout) ──────────────────────
variable "github_owner" {
  type        = string
  description = "GitHub org/user owning the app repo."
}

variable "github_repo" {
  type        = string
  description = "Repository name (no owner)."
}

variable "app_hosting_branch" {
  type        = string
  description = "Branch App Hosting builds & rolls out for this stage (e.g. main for sbx, prod for prod)."
  default     = "main"
}

# ── Database ────────────────────────────────────────────────────────────────
variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier."
  default     = "db-custom-1-3840"
}

variable "db_version" {
  type        = string
  description = "Cloud SQL Postgres version."
  default     = "POSTGRES_18"
}

# ── Container images ────────────────────────────────────────────────────────
# CI builds and pushes real images, then rolls Cloud Run revisions itself
# (`gcloud run deploy --image ...`). Terraform seeds the services with a public
# placeholder and IGNORES later image changes (see cloudrun.tf lifecycle), so
# `terraform apply` and the CI deploy never fight over the running revision.
variable "placeholder_image" {
  type        = string
  description = "Image used only for first apply, before CI pushes real ones."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

# ── Vertex AI (the agent calls Gemini) ──────────────────────────────────────
variable "vertex_location" {
  type        = string
  description = "Vertex AI location for the agent (may differ from var.region)."
  default     = "us-central1"
}

# ── Firebase App Hosting ────────────────────────────────────────────────────
variable "enable_app_hosting" {
  type        = string
  description = <<-EOT
    Create the Firebase App Hosting backend (git-connected frontend). Requires a
    one-time Developer Connect link to the GitHub repo (interactive GitHub App
    authorization — see infra/README.md), passed via developer_connect_repo.
    Leave false until that link exists; the Firebase project/web app/auth below
    still apply, so the emulator + client SDK wiring works first.
  EOT
  default     = false
}

variable "developer_connect_repo" {
  type        = string
  description = "Developer Connect git_repository_link resource name (set once the GitHub link exists)."
  default     = ""
}

# ── Google sign-in (Workspace SSO) ──────────────────────────────────────────
variable "google_oauth_client_id" {
  type        = string
  description = "OAuth 2.0 Web client ID for Google sign-in. Empty disables the Google IdP (email/password still works)."
  default     = ""
}

variable "google_oauth_client_secret" {
  type        = string
  description = "OAuth 2.0 client secret for Google sign-in."
  default     = ""
  sensitive   = true
}
