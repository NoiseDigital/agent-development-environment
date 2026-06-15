variable "region" {
  type    = string
  default = "us-central1"
}

variable "github_owner" {
  type        = string
  description = "GitHub org/user owning the repo (for App Hosting git rollout)."
}

variable "github_repo" {
  type        = string
  description = "Repository name (no owner)."
}

variable "enable_app_hosting" {
  type    = bool
  default = false
}

variable "developer_connect_repo" {
  type    = string
  default = ""
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
