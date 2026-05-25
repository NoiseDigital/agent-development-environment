"""pinned_charts: tab-pinned agent-generated charts

User-pinned visualisations created via the FloatingAssistant in dashboard
edit mode. The pin is keyed by (dashboard, tab) so deleting one pin doesn't
disturb the others in the same dashboard, and it carries the agent's Vega-Lite
spec as JSONB so the chart re-renders identically on any device.

These previously lived in browser localStorage (see
services/frontend/src/lib/dashboard-store.ts); moving them server-side makes
pinned charts survive across devices and browsers, the same as session
metadata and event ratings.

Revision ID: pinned_charts
Revises: baseline_metadata
"""

from __future__ import annotations

from alembic import op

revision: str = "pinned_charts"
down_revision: str | None = "baseline_metadata"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE pinned_charts (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id       TEXT NOT NULL,
            dashboard_id  TEXT NOT NULL,
            tab_id        TEXT NOT NULL,
            spec          JSONB NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX idx_pinned_charts_dash_tab
            ON pinned_charts (user_id, dashboard_id, tab_id, created_at);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE pinned_charts")
