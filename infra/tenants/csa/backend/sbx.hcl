# sbx Terraform state. Its own bucket (infra/bootstrap names it
# "<project>-tfstate"), so another tenant's apply can never touch csa state.
bucket = "nd-csa-sbx-tfstate"
prefix = "tenants/csa/sbx"
