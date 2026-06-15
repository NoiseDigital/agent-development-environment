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

  # Per-(tenant,stage) state isolation: this stage's own bucket (created by
  # infra/bootstrap as "<project>-tfstate"), so a prod apply can never touch
  # sbx state.
  backend "gcs" {
    bucket = "nd-agentspace-sbx-tfstate"
    prefix = "tenants/nd-agentspace/sbx"
  }
}
