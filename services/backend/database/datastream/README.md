# Datastream CDC — Postgres → BigQuery

Streams **every table** in the `platform` Postgres DB to BigQuery as a
near-real-time **merge** (mirror of current state). Defined in
[infra/modules/tenant/datastream.tf](../../../../infra/modules/tenant/datastream.tf).

## Why a proxy VM

Cloud SQL is **private-IP only**, and Datastream can't peer to it directly — VPC
peering isn't transitive (Datastream → tenant VPC → Cloud SQL's PSA peering is
two hops). So a tiny **Cloud SQL Auth Proxy VM** sits in the VPC; Datastream
reaches it over a Datastream private connection and the proxy dials the private
IP.

```
Datastream ─(private connection)─▶ datastream-proxy VM ─▶ Cloud SQL (private IP)
     └──────────────────── stream ─────────────────────▶ BigQuery  (dataset: platform_cdc)
```

## Rollout (3 steps — all automated, no manual SQL)

Terraform can't create the publication/slot against a private DB, so the SQL
prereqs live in an **Alembic migration**
([20260819_0000_datastream_cdc_setup](../../gateway/alembic/versions/20260819_0000_datastream_cdc_setup.py))
that the **migrate Cloud Run job** runs from inside the VPC as the `app` user (a
`cloudsqlsuperuser`). It's guarded on the `datastream` role existing, so it
no-ops everywhere CDC isn't enabled.

> **Order matters.** Terraform must create the `datastream` role (step 1) BEFORE
> the migration runs (step 2 / the merge). If the migration runs first it no-ops
> and is marked applied, and the slot never gets made.

**1. Provision the infra** — run from `infra/tenants/nd-agentspace/sbx/`:
```bash
cd infra/tenants/nd-agentspace/sbx
terraform apply        # enable_datastream = true (already in terraform.tfvars)
```
Creates the proxy VM, private connection, connection profiles, the `platform_cdc`
BigQuery dataset, and the **`datastream` DB user** — and restarts the instance
once to enable `cloudsql.logical_decoding`.

**2. Merge to main → the migrate job runs the prereqs.** CI builds the gateway
(with the new migration) and runs `migrate`, which — now that the `datastream`
role exists — creates the publication, replication slot, and grants. No `psql`.

**3. Start the stream** — set `datastream_create_stream = true` in
`terraform.tfvars` (commit it so it persists), then from the same dir:
```bash
cd infra/tenants/nd-agentspace/sbx
terraform apply
```
Creates the stream (`RUNNING`), backfills all tables, then tails into `platform_cdc`.

> Manual fallback: if you ran the migrate job out of order (before step 1), the
> migration already no-op'd. Re-run the SQL by hand with [setup.sql](./setup.sql)
> (as the `app` user, through the proxy VM / Cloud SQL Studio), then do step 3.

## Verify

- BigQuery → dataset **`platform_cdc`** fills with one table per source table
  (backfill first, then ~15-min-fresh merges; tune with `data_freshness`).
- Datastream console → the `platform-postgres-to-bq` stream shows objects healthy.

## Notes

- **Scope:** all tables in schema `public` (the publication is `FOR ALL TABLES`,
  the stream captures the whole `public` schema — new tables included automatically).
- **Cost:** an always-on `e2-micro` proxy VM (~$6/mo) + Datastream + BigQuery
  storage/streaming. Tear down by setting `enable_datastream = false`.
- **Teardown:** set `datastream_create_stream = false` first (drops the stream),
  then `enable_datastream = false`. Drop the slot/publication in SQL if you want
  the DB fully clean (an orphaned slot retains WAL).
