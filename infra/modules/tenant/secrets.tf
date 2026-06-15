# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — the database URL. Cloud Run services read it as a secret env
# var (see cloudrun.tf), so the connection string is never baked into an image
# or a tfvars file in plaintext at rest.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # asyncpg URL against the instance's private IP. SQLAlchemy + asyncpg is what
  # the gateway/agent expect (see services/backend/*/api/db.py).
  database_url = "postgresql+asyncpg://${google_sql_user.app.name}:${random_password.db.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.app.name}"
}

resource "google_secret_manager_secret" "database_url" {
  project   = local.project_id
  secret_id = "database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.database_url
}

# Services that connect to Postgres get read access to the secret.
resource "google_secret_manager_secret_iam_member" "database_url_accessors" {
  for_each = toset([
    google_service_account.gateway.email,
    google_service_account.agent.email,
  ])
  project   = local.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}
