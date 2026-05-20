"""Per-message feedback (thumb ratings) stored alongside ADK events.

ADK events are immutable and ADK owns the `events`/`sessions` schema, so
feedback lives in its own `message_feedback` table that references the ADK
event's composite key rather than mutating ADK's rows.
"""
