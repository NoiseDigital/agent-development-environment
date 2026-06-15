output "state_bucket" {
  description = "GCS bucket for Terraform state. Reference it in each env's backend.tf."
  value       = google_storage_bucket.tfstate.name
}

output "artifact_registry" {
  description = "Image path prefix: push to <this>/<service>:<tag>."
  value       = "${google_artifact_registry_repository.platform.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.platform.repository_id}"
}

output "ci_deployer_sa_email" {
  description = "Set as the GitHub Actions secret/var the auth step impersonates."
  value       = google_service_account.ci_deployer.email
}

output "workload_identity_provider" {
  description = "Full provider resource name for the google-github-actions/auth step."
  value       = google_iam_workload_identity_pool_provider.github.name
}
