# Gateway

The single public entry point for the NoiseOS frontend.

## What it owns
- **Auth**: every request goes through `current_user`. Today that resolves a
  dev identity; when Firebase Auth lands, only `api/auth.py` changes.
- **Health**: `GET /healthz` for compose / probes.
- **Platform-owned routes** (added incrementally as features arrive): user
  preferences, dashboards, admin endpoints — anything that doesn't need ADK.

## What it proxies
Everything else is forwarded to the private `agent` service. The proxy:
- Streams responses byte-for-byte (so `/run_sse` SSE works).
- Forwards the resolved `X-Dev-User` header so the upstream sees the same
  identity the gateway authenticated.

The frontend talks to the gateway and nothing else; the agent service is no
longer publicly exposed in compose.
