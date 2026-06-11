-- User-facing session display names. ADK owns the `sessions` table and treats
-- session state as agent-managed, so the human-friendly name the UI shows is
-- kept here, keyed by the ADK session identity.
-- Also created idempotently at agent startup so it works on existing DB volumes.
CREATE TABLE IF NOT EXISTS session_metadata (
    app_name     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    display_name TEXT NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (app_name, user_id, session_id)
);
