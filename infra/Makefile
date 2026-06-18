# Deploy any tenant-stage with isolated state:
#
#   make plan   TENANT=noise STAGE=sbx
#   make apply  TENANT=noise STAGE=sbx
#   make output TENANT=noise STAGE=sbx
#
# One config dir per tenant (tenants/<tenant>/) serves every stage. A stage's
# non-secret vars come from env/<stage>.tfvars and its GCS state from
# backend/<stage>.hcl — selected together here so they can never be mismatched
# (the classic footgun: prod vars against sbx state). `init -reconfigure`
# repoints the backend when you switch stages locally. Secrets, if any, live in
# env/<stage>.secret.tfvars (gitignored) and are auto-included when present.

TENANT ?=
STAGE  ?=
DIR     = tenants/$(TENANT)
VARFILE = env/$(STAGE).tfvars
BACKEND = backend/$(STAGE).hcl
SECRET_FILE = $(DIR)/env/$(STAGE).secret.tfvars
SECRET_ARG  = $(if $(wildcard $(SECRET_FILE)),-var-file=env/$(STAGE).secret.tfvars,)

guard:
	@test -n "$(TENANT)" || { echo "set TENANT=<tenant> (a dir under tenants/)"; exit 1; }
	@test -n "$(STAGE)"  || { echo "set STAGE=<stage>"; exit 1; }
	@test -f "$(DIR)/$(VARFILE)" || { echo "missing $(DIR)/$(VARFILE)"; exit 1; }
	@test -f "$(DIR)/$(BACKEND)" || { echo "missing $(DIR)/$(BACKEND)"; exit 1; }

init: guard
	cd $(DIR) && terraform init -reconfigure -backend-config=$(BACKEND) -input=false

plan: init
	cd $(DIR) && terraform plan -var-file=$(VARFILE) $(SECRET_ARG)

apply: init
	cd $(DIR) && terraform apply -var-file=$(VARFILE) $(SECRET_ARG)

destroy: init
	cd $(DIR) && terraform destroy -var-file=$(VARFILE) $(SECRET_ARG)

output: guard
	cd $(DIR) && terraform output

fmt:
	terraform fmt -recursive

validate: init
	cd $(DIR) && terraform validate

.PHONY: guard init plan apply destroy output fmt validate
