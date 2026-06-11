-- Registry of uploaded data sources. Only uploaded files are persisted —
-- BigQuery tables are referenced live, not registered.
-- Also created idempotently at agent startup so it works on existing DB volumes.
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

CREATE INDEX IF NOT EXISTS idx_sources_user ON sources (user_id, created_at DESC);
