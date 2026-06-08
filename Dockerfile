FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PIP_DISABLE_PIP_VERSION_CHECK=1 \
  PIP_NO_CACHE_DIR=1

# Create a non-root user for security
RUN addgroup --system appgroup \
 && adduser  --system --ingroup appgroup appuser

WORKDIR /app

# Install dependencies first (layer cached separately from source)
COPY requirements.txt .
RUN pip install --no-compile -r requirements.txt

# Copy only runtime files into the image. Deployment secrets, source control
# metadata, CI files, and local notes stay out of the container filesystem.
COPY --chown=appuser:appgroup app.py config.yaml index.html privacy.html robots.txt sitemap.xml README.md LICENSE ./
COPY --chown=appuser:appgroup assets ./assets

USER appuser

EXPOSE 5000

# Health check used by docker-compose depends_on
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/')" || exit 1

# gunicorn for a production-ready WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "app:app"]
