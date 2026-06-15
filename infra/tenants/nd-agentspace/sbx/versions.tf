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

  # Per-(tenant,stage) state isolation: a prod apply can never touch sbx state.
  # Bucket comes from infra/bootstrap (var.state_bucket_name).
  backend "gcs" {
    bucket = "nd-agentspace-tfstate"
    prefix = "tenants/nd-agentspace/sbx"
  }
}
