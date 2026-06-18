# sbx Terraform state. Its own bucket (infra/bootstrap names it
# "<project>-tfstate"), so a prod apply can never touch sbx state.
#
# NOTE: prefix stays the project-era path "tenants/nd-agentspace/sbx" — renaming
# it would orphan the existing state object. New stages use tenants/noise/<stage>.
bucket = "nd-agentspace-sbx-tfstate"
prefix = "tenants/nd-agentspace/sbx"
