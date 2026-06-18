variable "region" {
  type    = string
  default = "us-central1"
}

variable "google_oauth_client_id" {
  type    = string
  default = ""
}

variable "google_oauth_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "admin_emails" {
  type    = list(string)
  default = []
}

# CONTAINER_CONFIG from the GTM Server container. Empty disables sGTM. Supply via
# TF_VAR_sgtm_container_config (don't commit it) — it's stored in Secret Manager.
variable "sgtm_container_config" {
  type      = string
  default   = ""
  sensitive = true
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
