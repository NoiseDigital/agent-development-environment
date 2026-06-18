# Per-stage inputs. Non-secret values live in env/<stage>.tfvars (committed);
# secrets live in env/<stage>.secret.tfvars (gitignored, passed by the Makefile).

variable "stage" {
  type        = string
  description = "Deployment stage: sbx | dev | uat | prod. Set in env/<stage>.tfvars."
}

variable "project_id" {
  type        = string
  description = "Override the derived <project_prefix>-<stage> id (rare; project ids are immutable)."
  default     = ""
}

variable "region" {
  type    = string
  default = "us-central1"
}

# Cloud SQL tier — sbx runs cheap (db-f1-micro); prod overrides to something HA.
variable "db_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "admin_emails" {
  type    = list(string)
  default = []
}

# Server-side tagging (sGTM). Committed toggle so a routine apply never destroys
# it; the CONTAINER_CONFIG value is injected out-of-band (DEPLOY.md §6).
variable "enable_sgtm" {
  type    = bool
  default = false
}

# Datastream CDC (Postgres → BigQuery). Two-phase: apply with enable_datastream,
# run setup.sql, then set datastream_create_stream to start the stream.
variable "enable_datastream" {
  type    = bool
  default = false
}

variable "datastream_create_stream" {
  type    = bool
  default = false
}

# Google Workspace SSO — secret, so set in env/<stage>.secret.tfvars (gitignored).
variable "google_oauth_client_id" {
  type    = string
  default = ""
}

variable "google_oauth_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}
