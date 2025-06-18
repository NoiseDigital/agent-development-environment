FROM python:3.11-slim

WORKDIR /app
COPY main.py /app/
COPY requirements.txt /app/
RUN apt-get update && apt-get install -y git
RUN pip install --no-cache-dir -r requirements.txt

ENV PORT 8080
ENV GOOGLE_CLOUD_PROJECT=probable-summer-238718
ENV GOOGLE_CLOUD_LOCATION=us-central1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]