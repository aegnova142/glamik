"""Health, readiness and metrics.

All three are unauthenticated so an orchestrator can probe them, and none
disclose secrets, catalog contents or connection strings.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.config import API_PREFIX, SERVICE_NAME, SERVICE_VERSION
from app.core.logging import metrics_payload

router = APIRouter(prefix=API_PREFIX, tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness: the process is up and serving."""
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}


@router.get("/ready")
def ready(request: Request, response: Response) -> dict[str, object]:
    """Readiness: can this instance actually do its job?

    Returns 503 unless every required model is loaded. An instance without a
    face parser cannot analyse anything, so it must not receive traffic — that
    is precisely what a readiness probe is for.
    """
    state = getattr(request.app.state, "ai", None)
    if state is None:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "starting", "service": SERVICE_NAME, "ready": False}

    models_ready = state.models.ready
    missing = [slot.name for slot in state.models.missing_required()]
    warnings = state.settings.config_warnings()

    if not models_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if models_ready else "not_ready",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "ready": models_ready,
        "checks": {
            "models": state.models.describe(),
            "missing_required_models": missing,
            "cache_enabled": state.cache.available,
            # The client exists; this does not claim Node is reachable. Probing
            # it on every readiness check would make this instance's health
            # depend on another service's, which is how one outage becomes two.
            "node_client_initialised": state.node.connected,
            "configuration_warnings": warnings,
        },
        "model_version": state.models.versions(),
    }


@router.get("/metrics", include_in_schema=False)
def metrics(request: Request) -> Response:
    """Prometheus scrape endpoint."""
    state = getattr(request.app.state, "ai", None)
    if state is not None and not state.settings.metrics_enabled:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    body, content_type = metrics_payload()
    return Response(content=body, media_type=content_type)
