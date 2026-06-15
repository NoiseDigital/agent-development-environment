terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.40"
    }
  }

  # Bootstrap creates the state bucket it would otherwise live in, so it runs on
  # LOCAL state for the first apply. To move state into the bucket afterwards,
  # uncomment this block and run `terraform init -migrate-state`.
  #
  # backend "gcs" {
  #   bucket = "nd-agentspace-tfstate"   # = var.state_bucket_name
  #   prefix = "bootstrap"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
