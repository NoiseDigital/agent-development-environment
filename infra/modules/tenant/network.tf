# ─────────────────────────────────────────────────────────────────────────────
# Network — a dedicated VPC + subnet and Private Services Access (so Cloud SQL
# gets a private IP). Cloud Run reaches the VPC via Direct VPC egress
# (network_interfaces on the subnet — see cloudrun.tf), so there is no Serverless
# VPC Access connector. Keeping the database off the public internet is the point.
# ─────────────────────────────────────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  project                 = local.project_id
  name                    = "vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.services]
}

resource "google_compute_subnetwork" "subnet" {
  project       = local.project_id
  name          = "subnet"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.20.0.0/24"
}

# Reserved range Google's managed services (Cloud SQL) peer into.
resource "google_compute_global_address" "psa_range" {
  project       = local.project_id
  name          = "psa"
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
