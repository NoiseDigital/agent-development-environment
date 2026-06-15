"""users — the platform user directory (auth identity + role)

The authoritative record of who can use the platform. Populated from the
verified Firebase identity the BFF forwards (uid/email), and the source of
truth for `role` (RBAC). Firebase custom claims are set FROM this table later,
so the role rides in the token for fast gating; this table owns the management
surface (user list, role changes, the seam for invites / email).

`uid` is the Firebase UID (TEXT, matches the token `sub`). The dev identity
`user-1` is seeded as admin so the local stack keeps an admin before real
sign-in.

Deliberately NOT here yet (premature): `org_membership`, `invites`,
`audit_log`. Added when a real consumer needs them.

Revision ID: users_table
Revises: clients_sharing
"""

from __future__ import annotations

from alembic import op

revision: str = "users_table"
down_revision: str | None = "clients_sharing"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE users (
            uid           TEXT PRIMARY KEY,
            email         TEXT,
            display_name  TEXT,
            role          TEXT NOT NULL DEFAULT 'member',
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at  TIMESTAMPTZ
        );

        CREATE INDEX users_email_idx ON users (email);

        -- Seed the dev identity as admin so local flows keep an admin user.
        INSERT INTO users (uid, email, display_name, role)
        VALUES ('user-1', NULL, 'Dev User', 'admin')
        ON CONFLICT (uid) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS users;")
