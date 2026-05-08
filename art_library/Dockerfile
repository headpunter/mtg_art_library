FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev zlib1g-dev libpng-dev git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tools/ ./tools/
COPY webapp/ ./webapp/

EXPOSE 5001

# workers=1 is required — _JOBS dict in jobs.py is in-process state
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5001", \
     "--workers", "1", \
     "--threads", "4", \
     "--timeout", "300", \
     "--worker-class", "gthread", \
     "webapp.app:app"]
