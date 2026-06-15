terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.40"
    }
    # google-beta carries the Firebase / Identity Platform / App Hosting
    # resources. The root (env) configures both providers; this module inherits
    # them. Beta resources below set `provider = google-beta` explicitly.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
