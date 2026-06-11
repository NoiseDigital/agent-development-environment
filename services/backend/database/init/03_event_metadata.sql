-- Per-event platform metadata, keyed by the ADK event it applies to. ADK events
-- are immutable and ADK owns the events/sessions schema, so this lives in the
-- platform's own table. General by design: message feedback (thumb ratings) is
-- the first use; more per-event metadata can be added as columns later.
-- Also created idempotently at agent startup so it works on existing DB volumes.
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
