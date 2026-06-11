FROM python:3.13-bookworm

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PORT=8080

WORKDIR /workspace

RUN pip install --upgrade pip && pip install uv

COPY pyproject.toml ./
RUN uv sync --no-install-project

EXPOSE ${PORT}
