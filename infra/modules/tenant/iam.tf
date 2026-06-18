# ─────────────────────────────────────────────────────────────────────────────
# Per-service runtime identities. Each Cloud Run service runs as its own least-
# privilege SA; the gateway-only call boundary is enforced by run.invoker
# bindings in cloudrun.tf (agent/mcp are invokable ONLY by the gateway/agent).
# ─────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "gateway" {
  project      = local.project_id
  account_id   = "gateway"
  display_name = "Gateway runtime (${local.name_prefix})"
}

resource "google_service_account" "agent" {
  project      = local.project_id
  account_id   = "agents"
  display_name = "Agent runtime (${local.name_prefix})"
}

resource "google_service_account" "mcp_stats" {
  project      = local.project_id
  account_id   = "mcp-stats"
  display_name = "MCP stats runtime (${local.name_prefix})"
}

resource "google_service_account" "toolbox" {
  project      = local.project_id
  account_id   = "mcp-toolbox"
  display_name = "MCP toolbox runtime (${local.name_prefix})"
}

# Frontend (the Next.js app + BFF) — its own identity, so we own its grants:
# invoke the gateway (cloudrun.tf) and mint/verify Firebase session cookies.
resource "google_service_account" "frontend" {
  project      = local.project_id
  account_id   = "frontend"
  display_name = "Frontend / BFF (${local.name_prefix})"
}

# Project-level role grants, flattened from a (sa_email -> roles) map.
locals {
  project_role_grants = merge([
    for sa, roles in {
      (google_service_account.gateway.email) = ["roles/cloudsql.client", "roles/cloudtrace.agent"]
      (google_service_account.agent.email)   = ["roles/cloudsql.client", "roles/aiplatform.user", "roles/cloudtrace.agent"]
      (google_service_account.toolbox.email) = ["roles/bigquery.dataViewer", "roles/bigquery.jobUser"]
      # firebaseauth.admin: createSessionCookie/verifySessionCookie via the
      # Identity Toolkit API (the BFF's session-cookie auth).
      (google_service_account.frontend.email) = ["roles/firebaseauth.admin"]
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
