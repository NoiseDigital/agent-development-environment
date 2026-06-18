"""drop the seeded dev user (user-1) from DEPLOYED databases

The dev identity (`user-1` / `dev@local`) is a LOCAL-only convenience: it lets the
stack run without a login (GATEWAY_DEV_AUTH). Earlier migrations seeded it
unconditionally, so every deployed DB ended up with a standing `admin` row that
nobody actually signed in as. This removes it wherever we're deployed, while
leaving it in place for local dev.

"Deployed" = running on Cloud Run, which always sets one of K_SERVICE (services)
or CLOUD_RUN_JOB (the migrate job runs as a Job). Local alembic sets neither, so
the dev user survives for local development.

Revision ID: drop_dev_user_seed
Revises: access_rules
"""

from __future__ import annotations

import os

from alembic import op

revision: str = "drop_dev_user_seed"
down_revision: str | None = "access_rules"
branch_labels: str | None = None
depends_on: str | None = None

# Cloud Run services set K_SERVICE; Cloud Run jobs (the migrate job) set
# CLOUD_RUN_JOB. Either means we're in a deployed environment.
_DEPLOYED = bool(os.getenv("K_SERVICE") or os.getenv("CLOUD_RUN_JOB"))


def upgrade() -> None:
    if _DEPLOYED:
        # The dev identity must never exist in a deployed DB. Its locally-keyed
        # rows in other tables (no FK to users) are harmless and left untouched.
        op.execute("DELETE FROM users WHERE uid = 'user-1'")


def downgrade() -> None:
    # Intentionally a no-op: we never want to (re)introduce the dev user into a
    # deployed DB. A fresh local DB still gets it from the earlier seed migrations.
    pass
