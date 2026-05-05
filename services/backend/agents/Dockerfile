FROM python:3.13-bookworm

# Keep the virtual environment outside /workspace so the dev bind mount doesn't shadow it.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PORT=8000

WORKDIR /workspace

RUN pip install --upgrade pip && pip install uv

# Copy only the dependency manifest first so Docker can cache the layer.
# The full source tree is provided at runtime via the bind mount in docker-compose.
COPY pyproject.toml ./
RUN uv sync --no-install-project

EXPOSE ${PORT}
