FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 DATA_DIR=/data

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Railway sets PORT; mount a volume at /data so memory and app.db survive deploys.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
