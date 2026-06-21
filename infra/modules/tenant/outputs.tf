output "project_id" {
  value = local.project_id
}

# ── Service URLs ────────────────────────────────────────────────────────────
output "gateway_url" {
  description = "Public gateway URL — the frontend's NEXT_PUBLIC_AGENTS_BASE_URL."
  value       = google_cloud_run_v2_service.gateway.uri
}

output "agent_url" {
  value = google_cloud_run_v2_service.agent.uri
}

output "mcp_stats_url" {
  value = google_cloud_run_v2_service.mcp_stats.uri
}

output "migrate_job" {
  description = "Cloud Run job CI executes before each deploy (`gcloud run jobs execute`)."
  value       = google_cloud_run_v2_job.migrate.name
}

# ── Database ────────────────────────────────────────────────────────────────
output "sql_instance" {
  value = google_sql_database_instance.postgres.name
}

output "sql_private_ip" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "uploads_bucket" {
  value = google_storage_bucket.uploads.name
}

# ── Runtime identities ──────────────────────────────────────────────────────
output "service_accounts" {
  value = {
    gateway   = google_service_account.gateway.email
    agent     = google_service_account.agent.email
    mcp_stats = google_service_account.mcp_stats.email
    toolbox   = local.deploy_toolbox ? google_service_account.toolbox[0].email : ""
  }
}

# ── Firebase web config — feeds the frontend's NEXT_PUBLIC_* build args ─────
output "firebase_web_config" {
  description = "Firebase web config (apiKey kept in Secret Manager; CI passes it as a build arg)."
  value = {
    project_id          = local.project_id
    app_id              = google_firebase_web_app.this.app_id
    api_key             = data.google_firebase_web_app_config.this.api_key
    auth_domain         = data.google_firebase_web_app_config.this.auth_domain
    storage_bucket      = data.google_firebase_web_app_config.this.storage_bucket
    messaging_sender_id = data.google_firebase_web_app_config.this.messaging_sender_id
    # Empty until a GA property is linked to the Firebase project (one-time, via
    # the console or `firebase init`); then it populates and gtag lights up.
    measurement_id = data.google_firebase_web_app_config.this.measurement_id
  }
  sensitive = true # api_key is not a hard secret, but keep it out of plain logs
}

output "frontend_url" {
  description = "Public URL of the frontend Cloud Run service."
  value       = google_cloud_run_v2_service.frontend.uri
}
