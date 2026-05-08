FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

# Single worker — rate-limiter sleep() is in-process; multiple workers would
# each have independent timers and collectively exceed Scryfall's 5 req/sec limit.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "1", \
     "--threads", "8", \
     "--timeout", "60", \
     "--worker-class", "gthread", \
     "app:app"]
