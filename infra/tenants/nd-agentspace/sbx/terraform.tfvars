# nd-agentspace / sbx. Most values come from variable defaults; set the few here.

# Auto-provision as admin on first sign-in (bootstrap; everyone else is invited
# via the admin UI). Must be in the allowed sign-in domain.
admin_emails = ["ethan.domokos@noisedigital.com"]

# Google Workspace SSO — set after creating an OAuth Web client (consent screen
# → Internal). Leaving these empty keeps Google sign-in disabled (email/password
# still works):
#   google_oauth_client_id     = "....apps.googleusercontent.com"
#   google_oauth_client_secret = "..."

# Datastream CDC → BigQuery. Phase 1: provisions the proxy VM, private connection,
# profiles, BigQuery dataset, and `datastream` DB user (and restarts the DB once
# for logical decoding). Then run services/backend/database/datastream/setup.sql
# and flip datastream_create_stream = true to start streaming.
enable_datastream        = true
datastream_create_stream = false
