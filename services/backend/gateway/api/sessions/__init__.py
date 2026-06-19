"""User-facing session display names, persisted server-side.

ADK owns the `sessions` table and treats session state as agent-managed, so the
human-friendly name the UI shows for a chat lives in its own `session_metadata`
table — keyed by the ADK session's identity (app_name, user_id, session_id).
Same custom-table pattern as the sources registry and message feedback.
"""
