"""Custom per-event metadata the platform stores alongside ADK events.

ADK events are immutable and ADK owns the `events`/`sessions` schema, so any
metadata the platform wants to attach to a message lives in its own
`event_metadata` table — keyed by the ADK event's composite identity
(app_name, user_id, session_id, event_id) rather than mutating ADK's rows.

Thumb-rating feedback is the first such metadata; further per-event metadata
(annotations, flags, …) belongs in this module too.
"""
