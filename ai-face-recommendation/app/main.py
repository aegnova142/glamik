"""Application assembly.

Everything failure-related is centralised here: a handler for the errors this
service raises deliberately, one for request-validation failures, and a
catch-all that turns anything unexpected into a generic INTERNAL_ERROR. That
last one is what guarantees a stack trace or an internal path can never reach a
caller, however a bug manifests.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import analysis, health, recommendation, tryon
from app.config import SERVICE_NAME, SERVICE_VERSION, get_settings
from app.core.errors import AIServiceError, ErrorCode, error_payload
from app.core.lifecycle import lifespan
from app.core.logging import ERRORS, configure_logging, configure_sentry

logger = structlog.get_logger(__name__)

DESCRIPTION = """
Internal AI microservice for Glamrik skin analysis.

Not public. Every endpoint except `/v1/health`, `/v1/ready` and `/v1/metrics`
requires the `X-Internal-AI-Key` header and is expected to be called only by
the Glamrik Node backend.

Uploaded images are held in memory for the duration of a request and are never
written to disk, logged, or sent to an error reporter. No face embeddings are
stored. Results are cosmetic estimates, not medical assessments.
"""


def create_app() -> FastAPI:
    settings = get_settings()

    configure_logging(settings.log_level, json_output=settings.log_json)
    if configure_sentry(settings.sentry_dsn, settings.environment):
        logger.info("sentry_enabled", environment=settings.environment)

    app = FastAPI(
        title="Glamrik AI Service",
        description=DESCRIPTION,
        version=SERVICE_VERSION,
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
        # Interactive docs are useful in development and are attack surface in
        # production, where the only caller is a server that already has the
        # contract.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # No browser talks to this service directly; the default is an empty origin
    # list, which means CORS is effectively off unless a deployment opts in.
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", settings.internal_api_key_header],
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        """Bind a request id to every log line emitted while handling it."""
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        structlog.contextvars.bind_contextvars(
            request_id=request_id, path=request.url.path, method=request.method
        )
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id", "path", "method")
        response.headers["X-Request-Id"] = request_id
        return response

    # --- error handling ----------------------------------------------------

    @app.exception_handler(AIServiceError)
    async def handle_service_error(request: Request, exc: AIServiceError):
        ERRORS.labels(endpoint=request.url.path, code=str(exc.code)).inc()
        # Expected outcomes (retake the photo, model absent) are not incidents.
        logger.info("request_rejected", code=str(exc.code), status=exc.http_status)
        return ORJSONResponse(status_code=exc.http_status, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        ERRORS.labels(endpoint=request.url.path, code="VALIDATION").inc()
        # Pydantic's raw error list can echo submitted values back; only the
        # field locations are returned.
        fields = [".".join(str(p) for p in err.get("loc", ())) for err in exc.errors()]
        return ORJSONResponse(
            status_code=422,
            content=error_payload(
                ErrorCode.IMAGE_INVALID,
                "The request was not in the expected format.",
                fields=fields,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException):
        code = (
            ErrorCode.UNAUTHORIZED
            if exc.status_code == 401
            else ErrorCode.RATE_LIMITED
            if exc.status_code == 429
            else ErrorCode.INTERNAL_ERROR
        )
        return ORJSONResponse(
            status_code=exc.status_code,
            content=error_payload(code, str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        ERRORS.labels(endpoint=request.url.path, code="INTERNAL_ERROR").inc()
        # The traceback goes to the log, never to the response.
        logger.error("unhandled_exception", error=str(exc), exc_info=True)
        return ORJSONResponse(
            status_code=500,
            content=error_payload(
                ErrorCode.INTERNAL_ERROR,
                "An unexpected error occurred while processing the request.",
            ),
        )

    # --- routes ------------------------------------------------------------
    app.include_router(health.router)
    app.include_router(analysis.router)
    app.include_router(recommendation.router)  # Phase 2 — returns NOT_IMPLEMENTED
    app.include_router(tryon.router)  # Phase 3 — returns NOT_IMPLEMENTED

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "health": "/v1/health",
            "ready": "/v1/ready",
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=not settings.is_production,
        log_config=None,  # structlog owns logging
    )
