"""datastream CDC prerequisites — publication, replication slot, grants

Sets up logical replication for Datastream (Postgres → BigQuery). Replaces the
manual setup.sql run: the migrate Cloud Run job runs this from INSIDE the VPC as
the app user (a cloudsqlsuperuser), which is exactly the privilege that
CREATE PUBLICATION ... FOR ALL TABLES and creating a replication slot require.

Guarded on the `datastream` role existing — Terraform creates it only when
enable_datastream=true (see infra/modules/tenant/datastream.tf). So this is a
no-op for local dev and for tenants without CDC, and idempotent (IF NOT EXISTS)
if it ever re-runs.

ORDER MATTERS: Terraform must create the `datastream` role (Phase 1 apply) BEFORE
this migration runs (i.e. before merging the branch whose deploy runs the migrate
job). If the migration runs first it no-ops and is marked applied — then the slot
never gets made. See services/backend/database/datastream/README.md.

Revision ID: datastream_cdc_setup
Revises: drop_dev_user_seed
"""

from __future__ import annotations

from alembic import op

revision: str = "datastream_cdc_setup"
down_revision: str | None = "drop_dev_user_seed"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'datastream') THEN
            ALTER ROLE datastream WITH REPLICATION;
            GRANT USAGE ON SCHEMA public TO datastream;
            GRANT SELECT ON ALL TABLES IN SCHEMA public TO datastream;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO datastream;
            IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'datastream_pub') THEN
              CREATE PUBLICATION datastream_pub FOR ALL TABLES;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'datastream_slot') THEN
              PERFORM pg_create_logical_replication_slot('datastream_slot', 'pgoutput');
            END IF;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # No-op on purpose: the publication/slot are infra owned by the CDC lifecycle.
    # Dropping a slot that an active stream is reading would error and wedge the
    # migration. Teardown is: disable the stream (Terraform), then drop the
    # publication/slot manually if you want the DB fully clean.
    pass
