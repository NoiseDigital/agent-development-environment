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
variable "enable_sgtm" {
  type        = bool
  description = <<-EOT
    Provision the server-side GTM service + its Secret Manager secret + SA.
    Committed per-tenant (terraform.tfvars), so routine applies never tear it
    down. The CONTAINER_CONFIG value is NOT a Terraform input — it's added
    out-of-band to the `sgtm-container-config` secret and never touches tfvars or
    state. See services/backend/tagging/sgtm/README.md.
  EOT
  default     = false
}

# ── Datastream CDC (Postgres → BigQuery) ────────────────────────────────────
variable "enable_datastream" {
  type        = bool
  description = <<-EOT
    Provision the Datastream CDC infra (proxy VM, private connection, connection
    profiles, BigQuery dataset, datastream DB user). Default off — only tenants
    that want a live BigQuery mirror pay for the proxy VM. After enabling + apply,
    run services/backend/database/datastream/setup.sql, then set
    datastream_create_stream to start the stream.
  EOT
  default     = false
}

variable "datastream_create_stream" {
  type        = bool
  description = <<-EOT
    Create the Datastream stream itself. Requires enable_datastream AND the SQL
    prerequisites (publication + replication slot) to already exist, or stream
    creation fails. Two-phase on purpose: apply infra → run setup.sql → flip this.
  EOT
  default     = false
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
