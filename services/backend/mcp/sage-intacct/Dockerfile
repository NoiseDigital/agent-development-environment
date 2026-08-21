FROM python:3.13-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
RUN uv pip install --system .

COPY . .

ENV PYTHONUNBUFFERED=1
ENV APP_PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
