# ─────────────────────────────────────────────────────────────────────────────
# Network — a dedicated VPC, Private Services Access (so Cloud SQL gets a
# private IP), and a Serverless VPC Access connector (so Cloud Run reaches that
# private IP). Keeping the database off the public internet is the point.
# ─────────────────────────────────────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  project                 = local.project_id
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.services]
}

resource "google_compute_subnetwork" "subnet" {
  project       = local.project_id
  name          = "${local.name_prefix}-subnet"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.20.0.0/24"
}

# Reserved range Google's managed services (Cloud SQL) peer into.
resource "google_compute_global_address" "psa_range" {
  project       = local.project_id
  name          = "${local.name_prefix}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}

# Serverless VPC Access connector — the bridge from Cloud Run into the VPC.
resource "google_vpc_access_connector" "connector" {
  project       = local.project_id
  name          = "${local.name_prefix}-vpc-conn"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.21.0.0/28"
  depends_on    = [google_project_service.services]
}
