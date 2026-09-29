# syntax=docker/dockerfile:1

# ============================================================================
# Glamrik AI service.
#
# The runtime image contains NO PyTorch, NO timm, NO scikit-image, no training
# code and no training data. Models are trained and exported to ONNX offline
# (see offline-models/); production consumes ONNX and MediaPipe only.
#
# There is also no PostgreSQL client: this service is stateless and the Node
# backend owns every database.
# ============================================================================

# ---------------------------------------------------------------------------
# Build stage — resolve and install dependencies from the lockfile, so the
# runtime image carries no compiler toolchain.
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Dependencies are installed from uv.lock before the source is copied, so a
# code change does not invalidate the dependency layer.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app/ ./app/
RUN uv sync --frozen --no-dev


# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    MODEL_DIR=/app/models \
    PORT=8001

# opencv-python-headless still needs glib; libgl is NOT required by the
# headless build. curl is for the healthcheck only.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root. Nothing here needs privilege, and a container escape should not
# land on a root shell.
RUN groupadd --system --gid 1001 glamirk \
    && useradd --system --uid 1001 --gid glamirk --create-home glamirk

WORKDIR /app

COPY --from=builder --chown=glamirk:glamirk /build/.venv /app/.venv
COPY --chown=glamirk:glamirk app/ ./app/
COPY --chown=glamirk:glamirk scripts/ ./scripts/
COPY --chown=glamirk:glamirk pyproject.toml uv.lock ./

# Model weights are mounted or downloaded at deploy time, not baked in: they
# are large, licensed separately, and version independently of the code.
RUN mkdir -p /app/models/face_landmarker /app/models/face_parser /app/models/skin \
    && chown -R glamirk:glamirk /app/models

USER glamirk

EXPOSE 8001

# Readiness, not liveness: reports unhealthy while a required model is missing,
# so an orchestrator will not route traffic to an instance that cannot analyse.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8001/v1/ready || exit 1

# Gunicorn supervises uvicorn workers: a worker that dies is replaced, and the
# timeout kills one wedged inside a native library, which uvicorn alone cannot
# do. WEB_CONCURRENCY is read from the environment — each worker loads its own
# copy of the models, so it is sized by memory, not only by cores.
#
# No secrets are baked in; every one arrives at runtime.
CMD ["gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8001", \
     "--timeout", "60", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "2000", \
     "--max-requests-jitter", "200", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
