# ─────────────────────────────────────────────────────────────────────────────
# Datastream CDC — stream every Postgres table to BigQuery as a near-real-time
# merge (mirror) of the platform DB.
#
# Cloud SQL is private-IP only, and Datastream can't peer to it directly: VPC
# peering isn't transitive, so Datastream → tenant VPC → Cloud SQL's PSA peering
# is two hops. We bridge with a tiny Cloud SQL Auth Proxy VM in the tenant VPC
# that Datastream reaches over a Datastream private connection; the proxy dials
# the instance's private IP.
#
#   Datastream ─(private connection / VPC peering)─▶ proxy VM ─▶ Cloud SQL (private)
#        └────────────────────── stream ──────────────────────▶ BigQuery (merge)
#
# Two toggles, because Postgres prerequisites (publication, replication slot,
# grants) are a one-time SQL step that can't run from Terraform against a private
# DB — see services/backend/database/datastream/setup.sql:
#   1. enable_datastream        → infra (proxy, private connection, profiles,
#                                  dataset, datastream user). Apply, then run the SQL.
#   2. datastream_create_stream → the stream itself (needs the publication/slot
#                                  to already exist). Apply again.
# Both default off, so a tenant only pays for the proxy VM + stream when wanted.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  ds_count        = var.enable_datastream ? 1 : 0
  ds_stream_count = var.enable_datastream && var.datastream_create_stream ? 1 : 0

  ds_publication      = "datastream_pub"
  ds_replication_slot = "datastream_slot"
  ds_bq_dataset       = "platform_cdc"
  # /29 the Datastream private connection peers into. Adjacent to the subnet
  # (10.20.0.0/24) and outside the auto-allocated PSA /16, so it overlaps nothing.
  ds_peer_subnet = "10.20.1.0/29"

  ds_sql_connection_name = "${local.project_id}:${var.region}:${google_sql_database_instance.postgres.name}"
}

# ── Logical-replication role Datastream authenticates as ─────────────────────
# Password lives in TF state + the Datastream config, same posture as the app
# DB password. (Switch to secret_manager_stored_password to keep it out of state.)
resource "random_password" "datastream" {
  count   = local.ds_count
  length  = 32
  special = false
}

resource "google_sql_user" "datastream" {
  count    = local.ds_count
  project  = local.project_id
  name     = "datastream"
  instance = google_sql_database_instance.postgres.name
  password = random_password.datastream[0].result
}

# ── Cloud SQL Auth Proxy VM — the private bridge ─────────────────────────────
resource "google_service_account" "datastream_proxy" {
  count        = local.ds_count
  project      = local.project_id
  account_id   = "datastream-proxy"
  display_name = "Datastream Cloud SQL proxy (${local.name_prefix})"
}

resource "google_project_iam_member" "datastream_proxy_sql" {
  count   = local.ds_count
  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.datastream_proxy[0].email}"
}

resource "google_compute_instance" "datastream_proxy" {
  count        = local.ds_count
  project      = local.project_id
  name         = "datastream-proxy"
  machine_type = "e2-micro"
  zone         = "${var.region}-a"
  tags         = ["datastream-proxy"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
    }
  }

  network_interface {
    network    = google_compute_network.vpc.id
    subnetwork = google_compute_subnetwork.subnet.id
    # No external IP — the proxy reaches the Cloud SQL Admin API + downloads the
    # proxy binary via Private Google Access on the subnet.
  }

  service_account {
    email  = google_service_account.datastream_proxy[0].email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = templatefile(
    "${path.module}/files/datastream-proxy-startup.sh",
    { connection_name = local.ds_sql_connection_name },
  )

  depends_on = [google_project_service.services, google_project_iam_member.datastream_proxy_sql]
}

# Only the Datastream private-connection range may reach the proxy on 5432.
resource "google_compute_firewall" "datastream_to_proxy" {
  count     = local.ds_count
  project   = local.project_id
  name      = "allow-datastream-to-proxy"
  network   = google_compute_network.vpc.id
  direction = "INGRESS"

  allow {
    protocol = "tcp"
    ports    = ["5432"]
  }

  source_ranges = [local.ds_peer_subnet]
  target_tags   = ["datastream-proxy"]
}

# ── Datastream private connection (VPC peering into the tenant VPC) ───────────
resource "google_datastream_private_connection" "this" {
  count                 = local.ds_count
  project               = local.project_id
  location              = var.region
  display_name          = "platform-cdc"
  private_connection_id = "platform-cdc"

  vpc_peering_config {
    vpc    = google_compute_network.vpc.id
    subnet = local.ds_peer_subnet
  }

  depends_on = [google_project_service.services]
}

# ── BigQuery destination dataset + Datastream's writer identity ──────────────
resource "google_bigquery_dataset" "cdc" {
  count                      = local.ds_count
  project                    = local.project_id
  dataset_id                 = local.ds_bq_dataset
  location                   = var.region
  description                = "Datastream CDC mirror of the platform Postgres DB."
  delete_contents_on_destroy = !local.is_protected
}

resource "google_project_service_identity" "datastream" {
  count    = local.ds_count
  provider = google-beta
  project  = local.project_id
  service  = "datastream.googleapis.com"

  depends_on = [google_project_service.services]
}

resource "google_bigquery_dataset_iam_member" "datastream_writer" {
  count      = local.ds_count
  project    = local.project_id
  dataset_id = google_bigquery_dataset.cdc[0].dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_project_service_identity.datastream[0].email}"
}

# ── Connection profiles ──────────────────────────────────────────────────────
resource "google_datastream_connection_profile" "source" {
  count                 = local.ds_count
  project               = local.project_id
  location              = var.region
  display_name          = "platform-postgres"
  connection_profile_id = "platform-postgres"

  postgresql_profile {
    hostname = google_compute_instance.datastream_proxy[0].network_interface[0].network_ip
    port     = 5432
    username = google_sql_user.datastream[0].name
    password = random_password.datastream[0].result
    database = google_sql_database.app.name
  }

  private_connectivity {
    private_connection = google_datastream_private_connection.this[0].id
  }
}

resource "google_datastream_connection_profile" "destination" {
  count                 = local.ds_count
  project               = local.project_id
  location              = var.region
  display_name          = "platform-bigquery"
  connection_profile_id = "platform-bigquery"

  bigquery_profile {}
}

# ── The stream — all tables in `public`, full backfill, merge into BigQuery ──
# Gated separately: the publication + replication slot must already exist (run
# setup.sql) or stream creation fails.
resource "google_datastream_stream" "this" {
  count         = local.ds_stream_count
  project       = local.project_id
  location      = var.region
  display_name  = "platform-postgres-to-bq"
  stream_id     = "platform-postgres-to-bq"
  desired_state = "RUNNING"

  source_config {
    source_connection_profile = google_datastream_connection_profile.source[0].id

    postgresql_source_config {
      publication      = local.ds_publication
      replication_slot = local.ds_replication_slot
      # A schema with no table filter = every table in it (current + future).
      include_objects {
        postgresql_schemas {
          schema = "public"
        }
      }
    }
  }

  destination_config {
    destination_connection_profile = google_datastream_connection_profile.destination[0].id

    bigquery_destination_config {
      data_freshness = "900s"
      # Write mode defaults to merge (mirror current state). All tables → one dataset.
      single_target_dataset {
        dataset_id = "${local.project_id}:${google_bigquery_dataset.cdc[0].dataset_id}"
      }
    }
  }

  backfill_all {}

  depends_on = [
    google_bigquery_dataset_iam_member.datastream_writer,
    google_compute_firewall.datastream_to_proxy,
  ]
}

output "datastream_bq_dataset" {
  description = "BigQuery dataset receiving the Postgres CDC mirror (empty until enabled)."
  value       = local.ds_count > 0 ? google_bigquery_dataset.cdc[0].dataset_id : ""
}

output "datastream_proxy_ip" {
  description = "Internal IP of the Cloud SQL proxy VM Datastream connects to (empty until enabled)."
  value       = local.ds_count > 0 ? google_compute_instance.datastream_proxy[0].network_interface[0].network_ip : ""
}
