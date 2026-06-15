# ── base: dependency layer ─────────────────────────────────────────────────
# Dev builds THIS stage (docker-compose pins `target: base`) and bind-mounts the
# source over /workspace, so deps are baked but code is live-reloaded. The venv
# lives at /opt/venv — outside /workspace — so the bind mount doesn't shadow it.
FROM python:3.13-bookworm AS base

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PORT=8080

WORKDIR /workspace

RUN pip install --upgrade pip && pip install uv

# Manifest + lock first so the dependency layer caches independently of source
# changes. `--frozen` pins to uv.lock so dev resolves exactly what prod/CI does.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

EXPOSE ${PORT}

# ── prod: self-contained image for Cloud Run ───────────────────────────────
# Cloud Run has no bind mount, so the source is baked in and the project is
# installed into the venv. `--frozen` pins to uv.lock for reproducible builds.
# The Cloud Run service runs uvicorn; the one-shot `migrate` job (CI, pre-deploy)
# overrides the entrypoint with `uv run alembic upgrade head`.
FROM base AS prod

COPY . .
RUN uv sync --frozen

# --no-sync: run the venv baked at build time; never re-resolve from PyPI at
# startup (the container has no internet under locked-down VPC egress).
CMD ["sh", "-c", "uv run --no-sync uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
