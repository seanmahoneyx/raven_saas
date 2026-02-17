# =============================================================================
# Raven SaaS - Multi-stage Production Dockerfile
# =============================================================================
# Stage 1: Frontend build (Node)
# Stage 2: Python backend + collected static + frontend dist
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build React frontend
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Install dependencies first (layer caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Python backend
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS backend-builder

# Prevent Python from writing bytecode and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# System dependencies for psycopg2 and WeasyPrint
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libc6-dev \
    # WeasyPrint dependencies
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt \
    && pip install --no-cache-dir --prefix=/install gunicorn

# ---------------------------------------------------------------------------
# Stage 3: Final production image
# ---------------------------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=raven.settings

WORKDIR /app

# Runtime dependencies only (no gcc/dev headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    shared-mime-info \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system raven \
    && adduser --system --ingroup raven raven

# Copy installed Python packages from builder
COPY --from=backend-builder /install /usr/local

# Copy application code
COPY manage.py gunicorn.conf.py ./
COPY raven/ ./raven/
COPY apps/ ./apps/
COPY users/ ./users/
COPY templates/ ./templates/

# Copy frontend build output
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist/

# Collect static files (uses SECRET_KEY placeholder - not used at runtime)
RUN SECRET_KEY=collectstatic-placeholder \
    DEBUG=False \
    DB_ENGINE=django.db.backends.sqlite3 \
    python manage.py collectstatic --noinput

# Create directories for runtime
RUN mkdir -p /app/media /app/logs \
    && chown -R raven:raven /app/media /app/logs

# Switch to non-root user
USER raven

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health/ || exit 1

# Default: run gunicorn for HTTP traffic
# Override with daphne for WebSocket service
CMD ["gunicorn", "raven.wsgi:application", "-c", "gunicorn.conf.py"]
