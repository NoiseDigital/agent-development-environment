# csa / sbx → project nd-csa-sbx (derived <project_prefix>-<stage>).
stage = "sbx"

# Bootstrap admin (auto-provisioned admin on first sign-in); everyone else is
# invited via the admin UI. Must be in an allowed sign-in domain.
# TODO(csa): set the real CSA admin email(s) before first apply.
admin_emails = ["ethan.domokos@noisedigital.com"]

# Sandbox — keep it cheap.
db_tier = "db-f1-micro"

# csa v1 runs lean: no server-side tagging, no Datastream CDC. (mcp-toolbox and
# the non-analyze agents are dropped automatically — derived from tenants/csa.json
# enabledModules by the tenant module; nothing to toggle here.)
enable_sgtm              = false
enable_datastream        = false
datastream_create_stream = false

# Google Workspace SSO is a SECRET — set it in env/sbx.secret.tfvars (gitignored),
# NOT here. Leaving it unset keeps Google sign-in off (email/password still works).
