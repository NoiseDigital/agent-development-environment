-- Datastream CDC prerequisites for the `platform` database.
--
-- FALLBACK ONLY. Normally the Alembic migration datastream_cdc_setup (run by the
-- migrate job) does all of this automatically. Use this by hand only if the
-- migrate job ran out of order (before the `datastream` role existed) and so
-- no-op'd. See services/backend/database/datastream/README.md.
--
-- Run ONCE, AFTER `enable_datastream` has provisioned the `datastream` DB user
-- (terraform apply), and BEFORE creating the stream (datastream_create_stream).
-- Run as a member of cloudsqlsuperuser (the `app` user qualifies) — CREATE
-- PUBLICATION ... FOR ALL TABLES and creating a replication slot need it.
--
-- Connect via the Cloud SQL proxy VM, or from a machine on the VPC, e.g.:
--   gcloud sql connect platform-db --user=app --database=platform --project=nd-agentspace-sbx
-- (gcloud sql connect needs a public IP; for a private-only instance, psql
--  through the datastream-proxy VM at its internal IP, or Cloud SQL Studio.)
--
-- Names below MUST match infra/modules/tenant/datastream.tf (datastream_pub,
-- datastream_slot).

-- 1. Logical replication needs the REPLICATION attribute.
ALTER USER datastream WITH REPLICATION;

-- 2. Read access to every table Datastream mirrors — current and future.
GRANT USAGE ON SCHEMA public TO datastream;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO datastream;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO datastream;

-- 3. Publication = the tables to capture. FOR ALL TABLES auto-includes new ones.
CREATE PUBLICATION datastream_pub FOR ALL TABLES;

-- 4. Replication slot Datastream reads from, via the built-in pgoutput plugin.
--    Creating a slot needs the CURRENT role to have the REPLICATION attribute,
--    which a cloudsqlsuperuser does NOT have by default (attributes aren't
--    inherited via membership). Grant it just for this, then drop it — Datastream
--    reads the slot as the `datastream` user, which keeps REPLICATION.
--    Replace `app` if you're connected as a different cloudsqlsuperuser.
ALTER ROLE app WITH REPLICATION;
SELECT pg_create_logical_replication_slot('datastream_slot', 'pgoutput');
ALTER ROLE app WITH NOREPLICATION;
