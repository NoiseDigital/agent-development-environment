"""baseline: platform metadata tables

Captures every table the platform created itself: `session_metadata`,
`event_metadata`, and `sources`. ADK owns the `sessions` / `events` tables and
ships its own migrations on version updates; we never touch those.

The DDL is `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` everywhere so this
migration applies cleanly against THREE possible starting states:
  1. A fresh database (creates everything).
  2. A database provisioned by an older `ensure_schema(...)` agent build
     before Alembic owned the schema (becomes a no-op for matching DDL;
     idempotent ALTERs reconcile any column drift).
  3. A database already at this baseline (idempotent re-apply is safe).

Future migrations will use plain CREATE / ALTER without IF NOT EXISTS; only
this one bridges the pre-Alembic world.

Revision ID: baseline_metadata
Revises:
Create Date: 2026-06-05 00:00:00 UTC

The id is short (Alembic's default `alembic_version.version_num` is
``VARCHAR(32)`` and we don't override it); the file_template in alembic.ini
keeps the date in the FILENAME for chronological browsing.
"""

from __future__ import annotations

from alembic import op

revision: str = "baseline_metadata"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


SESSION_METADATA = """
CREATE TABLE IF NOT EXISTS session_metadata (
    app_name     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    hidden       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_name, user_id, session_id)
);
ALTER TABLE session_metadata ALTER COLUMN display_name SET DEFAULT '';
ALTER TABLE session_metadata ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
"""

# `event_metadata` powers per-message thumb ratings today; the schema is kept
# general so additional per-event platform metadata can grow as columns.
EVENT_METADATA = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Pre-Alembic builds renamed message_feedback -> event_metadata; drop the
-- legacy name here so an upgrade-in-place doesn't leave a stray table.
DROP TABLE IF EXISTS message_feedback;
CREATE TABLE IF NOT EXISTS event_metadata (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_name    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    session_id  TEXT NOT NULL,
    event_id    TEXT NOT NULL,
    rating      TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_name, user_id, session_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_event_metadata_session
    ON event_metadata (app_name, user_id, session_id);
"""

# `sources` tracks user-uploaded artefacts only. BigQuery tables are referenced
# live by dataset.table — they're not registered here.
SOURCES = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS sources (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    file_ext    TEXT,
    size_bytes  BIGINT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Earlier builds stored BigQuery refs here too; drop those columns if they
-- linger from a provisioned volume.
ALTER TABLE sources DROP COLUMN IF EXISTS kind;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_project;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_dataset;
ALTER TABLE sources DROP COLUMN IF EXISTS bq_table;
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources (user_id, created_at DESC);
"""


def upgrade() -> None:
    op.execute(SESSION_METADATA)
    op.execute(EVENT_METADATA)
    op.execute(SOURCES)


def downgrade() -> None:
    # Baseline downgrade drops every platform table. Real environments should
    # never run this — it exists only so `alembic downgrade base` works for
    # tests and for completeness of the migration graph.
    op.execute("DROP TABLE IF EXISTS sources")
    op.execute("DROP TABLE IF EXISTS event_metadata")
    op.execute("DROP TABLE IF EXISTS session_metadata")
