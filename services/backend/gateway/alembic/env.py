"""Alembic environment — wires migrations to the platform's Postgres.

DATABASE_URL is read from the environment so the same migration set works in
compose, CI, and prod without per-env config files. SQLAlchemy URLs that
carry the asyncpg driver suffix (`postgresql+asyncpg://`) are normalised to
the stdlib driver here: Alembic runs synchronously and asyncpg has no place
in the migration runner itself.

No `target_metadata` is declared — the platform uses raw SQL via asyncpg, not
an ORM. Migrations write DDL with `op.execute(...)` directly. If a future
feature adopts SQLAlchemy models, set `target_metadata` to the declarative
base here and `--autogenerate` starts working without any other changes.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _resolve_database_url() -> str:
    """Return a SQLAlchemy URL pointing at the platform Postgres, using the
    psycopg v3 driver.

    The DATABASE_URL the rest of the platform exports is asyncpg-flavoured
    (``postgresql+asyncpg://``) because the async pool uses asyncpg. Alembic
    is synchronous and needs a sync driver, so we normalise to
    ``postgresql+psycopg://`` (psycopg v3, declared in pyproject.toml). A bare
    ``postgresql://`` URL is also coerced — SQLAlchemy would otherwise default
    that to psycopg2, which we deliberately don't ship.
    """
    raw = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://user:password@postgres:5432/postgres",
    )
    for prefix in ("postgresql+asyncpg://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix) :]
    return raw


target_metadata = None


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of connecting to a database.

    Used by `alembic upgrade --sql`, handy for reviewing what a migration set
    would do before pointing it at a live database.
    """
    context.configure(
        url=_resolve_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect to Postgres and run migrations against the live database."""
    section = config.get_section(config.config_ini_section, {}) or {}
    section["sqlalchemy.url"] = _resolve_database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
