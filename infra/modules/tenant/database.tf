# ─────────────────────────────────────────────────────────────────────────────
# Cloud SQL (Postgres) — private IP only, on the tenant VPC. The platform schema
# is owned by Alembic and applied by the migrate Cloud Run job (see cloudrun.tf).
# ─────────────────────────────────────────────────────────────────────────────

resource "random_password" "db" {
  length  = 32
  special = false # keep the URL free of chars needing percent-encoding
}

resource "google_sql_database_instance" "postgres" {
  project          = local.project_id
  name             = "platform-db"
  region           = var.region
  database_version = var.db_version

  # prod/uat keep deletion protection; sbx/dev can be torn down freely.
  deletion_protection = local.is_protected

  settings {
    tier = var.db_tier
    # ENTERPRISE supports shared-core tiers (db-f1-micro); the project otherwise
    # defaults to ENTERPRISE_PLUS, which rejects them.
    edition           = "ENTERPRISE"
    availability_type = local.is_protected ? "REGIONAL" : "ZONAL"

    ip_configuration {
      ipv4_enabled    = false # private IP only — no public endpoint
      private_network = google_compute_network.vpc.id
    }

    # Datastream needs logical decoding (pgoutput) to read the WAL, and its
    # parallel backfill opens many short-lived connections — enough to exhaust a
    # small instance's slots — so raise max_connections too. Both gated on
    # enable_datastream so non-CDC tenants don't take the (restart-triggering)
    # flag changes. See datastream.tf.
    dynamic "database_flags" {
      for_each = var.enable_datastream ? {
        "cloudsql.logical_decoding" = "on"
        "max_connections"           = "100"
      } : {}
      content {
        name  = database_flags.key
        value = database_flags.value
      }
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = local.is_protected
    }
  }

  depends_on = [google_service_networking_connection.psa]
}

resource "google_sql_database" "app" {
  project  = local.project_id
  name     = "platform"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  project  = local.project_id
  name     = "app"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db.result
}
