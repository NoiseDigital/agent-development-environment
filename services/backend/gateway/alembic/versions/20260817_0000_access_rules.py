"""access_rules — the configurable allowlist (emails + domains -> role)

The DB + admin-UI source of truth for who may access the platform, replacing the
hard-coded ALLOWED_EMAIL_DOMAINS env. Each rule is either a specific email
('jane@x.com') or a whole domain ('@x.com'). On first sign-in the gateway
matches the user's email (an exact email rule beats a domain rule) and
JIT-provisions their `users` row with that rule's role. Env
(BOOTSTRAP_ADMIN_EMAILS) only seeds the first admin before any rule exists.

Revision ID: access_rules
Revises: users_invite_rbac
"""

from __future__ import annotations

from alembic import op

revision: str = "access_rules"
down_revision: str | None = "users_invite_rbac"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE access_rules (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            pattern    TEXT NOT NULL UNIQUE,   -- 'jane@x.com' (email) or '@x.com' (domain)
            kind       TEXT NOT NULL CHECK (kind IN ('email', 'domain')),
            role       TEXT NOT NULL DEFAULT 'member',
            is_active  boolean NOT NULL DEFAULT true,
            note       TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS access_rules;")
