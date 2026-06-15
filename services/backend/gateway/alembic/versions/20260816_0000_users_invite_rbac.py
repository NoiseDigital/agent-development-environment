"""users — invite-by-email allowlist + is_active (RBAC provisioning)

Evolves the directory from "Firebase uid is the PK, row upserted on first /me"
to an admin-provisioned allowlist:

  * surrogate `id` PK, so a row can exist BEFORE the user ever signs in,
  * `uid` becomes nullable + unique — bound on first sign-in by matching the
    invite's email,
  * `email` is the natural invite key (NOT NULL + unique, stored lower-cased),
  * `is_active` lets admins revoke access without deleting history.

In production the gateway gates sign-in against this table
(REQUIRE_PROVISIONED_USERS), so only invited, active users get in, and `role`
is read from here (DB-authoritative — no reliance on a Firebase custom claim).

Revision ID: users_invite_rbac
Revises: users_table
"""

from __future__ import annotations

from alembic import op

revision: str = "users_invite_rbac"
down_revision: str | None = "users_table"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        -- surrogate key so an invite can exist before a Firebase uid does
        ALTER TABLE users ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
        ALTER TABLE users DROP CONSTRAINT users_pkey;
        ALTER TABLE users ADD PRIMARY KEY (id);

        -- uid is now optional (bound on first sign-in) but unique when present
        ALTER TABLE users ALTER COLUMN uid DROP NOT NULL;
        ALTER TABLE users ADD CONSTRAINT users_uid_key UNIQUE (uid);

        -- access toggle: revoke without deleting
        ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;

        -- email is the invite key: backfill any nulls, then enforce NOT NULL+unique
        UPDATE users SET email = 'dev@local' WHERE uid = 'user-1' AND email IS NULL;
        UPDATE users SET email = uid || '@unknown.local' WHERE email IS NULL;
        UPDATE users SET email = lower(email);
        ALTER TABLE users ALTER COLUMN email SET NOT NULL;
        DROP INDEX IF EXISTS users_email_idx;
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        CREATE INDEX users_email_idx ON users (email);
        ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
        ALTER TABLE users DROP COLUMN IF EXISTS is_active;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_uid_key;
        ALTER TABLE users ALTER COLUMN uid SET NOT NULL;
        ALTER TABLE users DROP CONSTRAINT users_pkey;
        ALTER TABLE users ADD PRIMARY KEY (uid);
        ALTER TABLE users DROP COLUMN IF EXISTS id;
        """
    )
