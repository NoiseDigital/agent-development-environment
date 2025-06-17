FROM python:3.11-slim

ENV PORT=8080

WORKDIR /app
COPY . /app

RUN apt-get update && apt-get install -y git
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080

CMD ["uvicorn", "--app-dir", "app", "fast_api_runner:app", "--port", "8080",  "--host", "0.0.0.0",]
