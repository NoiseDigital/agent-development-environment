# ─────────────────────────────────────────────────────────────────────────────
# Per-service runtime identities. Each Cloud Run service runs as its own least-
# privilege SA; the gateway-only call boundary is enforced by run.invoker
# bindings in cloudrun.tf (agent/mcp are invokable ONLY by the gateway/agent).
# ─────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "gateway" {
  project      = local.project_id
  account_id   = "${var.stage}-gateway"
  display_name = "Gateway runtime (${local.name_prefix})"
}

resource "google_service_account" "agent" {
  project      = local.project_id
  account_id   = "${var.stage}-agent"
  display_name = "Agent runtime (${local.name_prefix})"
}

resource "google_service_account" "mcp_stats" {
  project      = local.project_id
  account_id   = "${var.stage}-mcp-stats"
  display_name = "MCP stats runtime (${local.name_prefix})"
}

resource "google_service_account" "toolbox" {
  project      = local.project_id
  account_id   = "${var.stage}-mcp-toolbox"
  display_name = "MCP toolbox runtime (${local.name_prefix})"
}

# Project-level role grants, flattened from a (sa_email -> roles) map.
locals {
  project_role_grants = merge([
    for sa, roles in {
      (google_service_account.gateway.email) = ["roles/cloudsql.client", "roles/cloudtrace.agent"]
      (google_service_account.agent.email)   = ["roles/cloudsql.client", "roles/aiplatform.user", "roles/cloudtrace.agent"]
      (google_service_account.toolbox.email) = ["roles/bigquery.dataViewer", "roles/bigquery.jobUser"]
      } : {
      for role in roles : "${sa}::${role}" => { sa = sa, role = role }
    }
  ]...)
}

resource "google_project_iam_member" "runtime" {
  for_each = local.project_role_grants
  project  = local.project_id
  role     = each.value.role
  member   = "serviceAccount:${each.value.sa}"
}
