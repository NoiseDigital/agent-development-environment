"""clients + share_links + user_dashboards.last_viewed_at

Adds the three platform tables we actually need now that dashboards talk to
BigQuery directly:

- `clients`      — one row per ad-client. The "New Dashboard" form picks from
                   here; the dashboard card surfaces the client's brand badge.
                   Future per-client filtering / branding hangs off this row.
- `share_links`  — persists external share tokens for client dashboards. The
                   ShareDashboardModal already exists in the UI; this is its
                   storage. Includes an explicit `revoked_at` so disabling a
                   link is a soft action (audit-friendly, no data loss).
- ALTER `user_dashboards` ADD `last_viewed_at` — drives "Recent" sorting and
                   future engagement analytics.

Deliberately NOT added in this migration:
- `audit_log`, `api_keys`, `org_membership` — premature.
- `agent_runs` — ADK records events already; aggregates can be derived. We
  add this when a real consumer (analytics dashboard / regression detector)
  needs it.

Revision ID: clients_sharing
Revises: user_dashboards
"""

from __future__ import annotations

from alembic import op

revision: str = "clients_sharing"
down_revision: str | None = "user_dashboards"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE clients (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            slug          TEXT NOT NULL UNIQUE,
            name          TEXT NOT NULL,
            initials      TEXT NOT NULL DEFAULT '',
            accent_color  TEXT NOT NULL DEFAULT '#10b981',
            logo_path     TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Seed Noise as the canonical first client. Future clients are
        -- inserted via the admin path (no client-creation UI today).
        INSERT INTO clients (slug, name, initials, accent_color, logo_path)
        VALUES ('noi', 'Noise', 'NOI', '#10b981', '/noise_N.PNG')
        ON CONFLICT (slug) DO NOTHING;
    """)

    op.execute("""
        CREATE TABLE share_links (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            dashboard_id  TEXT NOT NULL,
            share_token   TEXT NOT NULL UNIQUE,
            created_by    TEXT NOT NULL,
            expires_at    TIMESTAMPTZ,
            revoked_at    TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX idx_share_links_dashboard
            ON share_links (dashboard_id) WHERE revoked_at IS NULL;
    """)

    op.execute("""
        ALTER TABLE user_dashboards
            ADD COLUMN last_viewed_at TIMESTAMPTZ;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE user_dashboards DROP COLUMN last_viewed_at")
    op.execute("DROP TABLE share_links")
    op.execute("DROP TABLE clients")
