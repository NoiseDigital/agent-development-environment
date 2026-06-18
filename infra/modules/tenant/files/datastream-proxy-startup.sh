#!/bin/bash
# Cloud SQL Auth Proxy bridge for Datastream. Datastream can't peer directly to
# the private-IP Cloud SQL instance (VPC peering isn't transitive), so it reaches
# THIS VM over the Datastream private connection, and the proxy dials the
# instance's private IP. Postgres user/password auth tunnels end-to-end; the VM's
# service account only authorizes the connection (roles/cloudsql.client).
set -euo pipefail

curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64
chmod +x /usr/local/bin/cloud-sql-proxy

cat >/etc/systemd/system/cloud-sql-proxy.service <<'UNIT'
[Unit]
Description=Cloud SQL Auth Proxy (Datastream bridge)
After=network-online.target
Wants=network-online.target
[Service]
# --private-ip: dial the instance's private IP. --address 0.0.0.0: listen on all
# interfaces so Datastream (remote) can reach it. Restart=always survives reboots.
ExecStart=/usr/local/bin/cloud-sql-proxy --private-ip --address 0.0.0.0 --port 5432 ${connection_name}
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now cloud-sql-proxy
