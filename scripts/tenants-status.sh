#!/usr/bin/env bash
# Tenant control-plane status (CLI). Shows DESIRED state from the manifests
# (tenants, enabled modules, derived services + agents, project) and — with
# --deployed — the ACTUAL deployed state per tenant project (Cloud Run services +
# the image tag each runs, i.e. the version live for that tenant).
#
# Usage:
#   scripts/tenants-status.sh              # desired state (fast, offline)
#   scripts/tenants-status.sh --deployed   # + live Cloud Run revisions (needs gcloud access)
#   STAGE=sbx REGION=us-central1 scripts/tenants-status.sh --deployed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAGE="${STAGE:-sbx}"
REGION="${REGION:-us-central1}"
DEPLOYED=0
[ "${1:-}" = "--deployed" ] && DEPLOYED=1

for manifest in tenants/*.json; do
    [ "$(basename "$manifest")" = "modules.json" ] && continue

    # Desired state, derived from the manifest + module catalog (same logic the
    # rest of the toolchain uses).
    eval "$(python3 - "$manifest" <<'PY'
import json, pathlib, shlex, sys
m = json.loads(pathlib.Path(sys.argv[1]).read_text())
cat = json.loads(pathlib.Path("tenants/modules.json").read_text())
mods = m["enabledModules"]
keys = list(cat["modules"]) if mods == "*" else mods
svcs = set(cat["core"]["services"]); agents = set(cat["core"]["agents"])
for k in keys:
    svcs |= set(cat["modules"][k]["services"]); agents |= set(cat["modules"][k]["agents"])
def emit(k, v): print(f"{k}={shlex.quote(v)}")
emit("ID", m["id"])
emit("PREFIX", m["projectPrefix"])
emit("BRAND", m["branding"]["brandName"])
emit("MODULES", "all" if mods == "*" else ",".join(mods))
emit("SERVICES", " ".join(sorted(svcs)))
emit("AGENTS", "(all)" if mods == "*" else ",".join(sorted(agents)))
PY
)"
    PROJECT="${PREFIX}-${STAGE}"
    printf '\n\033[1m%s\033[0m  →  %s   (%s)\n' "$ID" "$PROJECT" "$BRAND"
    printf '  modules : %s\n' "$MODULES"
    printf '  services: %s\n' "$SERVICES"
    printf '  agents  : %s\n' "$AGENTS"

    if [ "$DEPLOYED" = "1" ]; then
        if gcloud run services list --project "$PROJECT" --region "$REGION" \
            --format="value(metadata.name)" >/tmp/_svcs 2>/dev/null; then
            printf '  deployed:\n'
            while read -r svc; do
                img="$(gcloud run services describe "$svc" --project "$PROJECT" --region "$REGION" \
                    --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || echo '?')"
                printf '    %-12s %s\n' "$svc" "${img##*:}"
            done < /tmp/_svcs
            rm -f /tmp/_svcs
        else
            printf '  deployed: (no access to %s or not provisioned)\n' "$PROJECT"
        fi
    fi
done
echo
