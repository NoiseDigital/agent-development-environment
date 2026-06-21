terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.40"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Partial backend: bucket + prefix are supplied per stage at init time via
  # `-backend-config=backend/<stage>.hcl` (see infra/Makefile). Keeping them out
  # of this file is exactly what lets ONE config serve every stage with its own
  # isolated state — switch stages with `terraform init -reconfigure`.
  backend "gcs" {}
}
