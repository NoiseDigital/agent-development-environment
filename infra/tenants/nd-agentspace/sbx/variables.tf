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
