FROM python:3.11-slim

LABEL maintainer="PhishGuard Security Intelligence Team"
LABEL description="PhishGuard Zero-Day Phishing Detection API Service"

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ /app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

ENTRYPOINT ["python", "run.py", "--host", "0.0.0.0", "--port", "8000"]
