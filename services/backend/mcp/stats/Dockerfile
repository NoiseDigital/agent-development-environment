# Statistics & correlation analysis MCP server.
FROM python:3.13-slim

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install the project into /app.
COPY . /app
WORKDIR /app

# Surface log messages immediately.
ENV PYTHONUNBUFFERED=1

# Install dependencies.
RUN uv sync

ENV PORT=8080
EXPOSE 8080

# Run the MCP server.
CMD ["uv", "run", "server.py"]
