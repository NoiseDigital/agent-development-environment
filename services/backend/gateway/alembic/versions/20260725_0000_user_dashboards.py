"""user_dashboards: editable internal dashboards (DaaC's runtime counterpart)

Client dashboards live in the repo as code (the SEED list in
`services/frontend/src/data/mock-dashboard-data.ts`). Internal/editable
dashboards previously lived in localStorage; moving them to Postgres means
they survive across devices and browsers, the same way pinned charts and
session metadata do. The Codify flow promotes a user dashboard back into the
SEED list when its layout deserves to be canonical.

Revision ID: user_dashboards
Revises: pinned_charts
"""

from __future__ import annotations

from alembic import op

revision: str = "user_dashboards"
down_revision: str | None = "pinned_charts"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE user_dashboards (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id      TEXT NOT NULL,
            name         TEXT NOT NULL,
            campaign_id  TEXT NOT NULL,
            default_tab  TEXT,
            layout       JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX idx_user_dashboards_owner
            ON user_dashboards (user_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE user_dashboards")
