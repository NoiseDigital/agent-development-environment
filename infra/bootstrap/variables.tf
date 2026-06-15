variable "project_id" {
  type        = string
  description = <<-EOT
    The automation/seed project that holds the shared CI/CD foundation: the
    Terraform state bucket, the Artifact Registry repo (images are built once
    and promoted across stages), and the Workload Identity pool + CI service
    account. Can be a dedicated seed project or, to start, the sbx tenant
    project (nd-agentspace-sbx).
  EOT
}

variable "region" {
  type        = string
  description = "Region for the Artifact Registry repo and state bucket."
  default     = "us-central1"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally-unique name for the GCS bucket holding Terraform state for all envs."
}

variable "artifact_repo_id" {
  type        = string
  description = "Artifact Registry Docker repo id (images: <region>-docker.pkg.dev/<project>/<repo>/<service>)."
  default     = "platform"
}

variable "github_owner" {
  type        = string
  description = "GitHub org/user that owns the repo (the WIF principal is scoped to it)."
}

variable "github_repo" {
  type        = string
  description = "Repository name (without owner). WIF is restricted to this repo."
}

variable "ci_deployer_roles" {
  type        = list(string)
  description = "Roles granted to the CI deployer SA in each TARGET (tenant-stage) project."
  default = [
    "roles/run.admin",                   # deploy Cloud Run services + execute the migrate job
    "roles/iam.serviceAccountUser",      # actAs the per-service runtime SAs
    "roles/artifactregistry.writer",     # push images (in the automation project; see below)
    "roles/cloudsql.client",             # let deploy steps reach Cloud SQL if needed
    "roles/secretmanager.secretAccessor" # read deploy-time secrets
  ]
}

variable "target_projects" {
  type        = list(string)
  description = <<-EOT
    Tenant-stage projects the CI deployer SA may deploy into
    (e.g. ["nd-agentspace-sbx"]). Add stages here as you create them. The SA is
    granted ci_deployer_roles in each.
  EOT
  default     = []
}
