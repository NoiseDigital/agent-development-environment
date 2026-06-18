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

## Setup

Three phases — provision → migrate → start the stream — all automated. The
ordered commands are **[DEPLOY.md §7](../../../../DEPLOY.md)**.

The one subtlety that belongs here: Terraform can't create the publication/slot
against a private DB, so those SQL prereqs live in an **Alembic migration**
([20260819_0000_datastream_cdc_setup](../../gateway/alembic/versions/20260819_0000_datastream_cdc_setup.py))
that the **migrate job** runs from inside the VPC as the `app` user (a
`cloudsqlsuperuser`), creating the publication + slot in an
`autocommit_block` (a logical slot can't be made in a write transaction). It's
guarded on the `datastream` role existing, so it no-ops where CDC is off — which
is why the provision phase (which creates that role) must run *before* the
migrate job. [setup.sql](./setup.sql) is the manual fallback if the migration ever
no-ops out of order.

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
