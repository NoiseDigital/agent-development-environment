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

# ── Access control ──────────────────────────────────────────────────────────
variable "admin_emails" {
  type        = list(string)
  description = <<-EOT
    Emails that auto-provision as admin on first sign-in (bootstrap, so there's
    an admin to invite everyone else). Must be within an allowed sign-in domain.
    Everyone else is invite-only via the admin UI.
  EOT
  default     = []
}

# ── Vertex AI (the agent calls Gemini) ──────────────────────────────────────
variable "vertex_location" {
  type        = string
  description = "Vertex AI location for the agent (may differ from var.region)."
  default     = "us-central1"
}

# ── Server-side tagging (sGTM) ──────────────────────────────────────────────
variable "sgtm_container_config" {
  type        = string
  description = <<-EOT
    CONTAINER_CONFIG from a GTM *Server* container (tagmanager.google.com →
    Admin → Create Container → Server). Empty (default) disables sGTM entirely —
    no service, secret, or SA is created. When set, it's stored in Secret Manager
    and the sgtm Cloud Run service is deployed.
  EOT
  default     = ""
  sensitive   = true
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
