"""structlog configuration and Prometheus metrics.

Nothing here ever receives image bytes, decoded pixels or landmark
coordinates. Logs carry shapes, timings and outcomes — never anything from
which a face could be reconstructed.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from time import perf_counter

import structlog
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.config import SERVICE_NAME, SERVICE_VERSION

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
REQUESTS = Counter("glamirk_ai_requests_total", "Requests handled", ["endpoint", "status"])
ERRORS = Counter("glamirk_ai_errors_total", "Errors returned", ["endpoint", "code"])
CACHE_EVENTS = Counter("glamirk_ai_cache_total", "Cache outcomes", ["result"])

# Buckets skewed low: the target is sub-100 ms analysis, so the interesting
# resolution is below a second.
_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 1.0, 2.5, 5.0)

STAGE_LATENCY = Histogram(
    "glamirk_ai_stage_seconds",
    "Per-stage latency",
    ["stage"],
    buckets=_BUCKETS,
)
INFERENCE_LATENCY = Histogram(
    "glamirk_ai_inference_seconds",
    "Model inference latency",
    ["model"],
    buckets=_BUCKETS,
)


@contextmanager
def stage_timer(stage: str) -> Iterator[None]:
    """Times one pipeline stage into the stage histogram."""
    started = perf_counter()
    try:
        yield
    finally:
        STAGE_LATENCY.labels(stage=stage).observe(perf_counter() - started)


@contextmanager
def inference_timer(model: str) -> Iterator[None]:
    started = perf_counter()
    try:
        yield
    finally:
        INFERENCE_LATENCY.labels(model=model).observe(perf_counter() - started)


def metrics_payload() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def configure_logging(level: str = "INFO", *, json_output: bool = True) -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
    )

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]
    if json_output:
        processors += [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=False))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    structlog.contextvars.bind_contextvars(service=SERVICE_NAME, version=SERVICE_VERSION)

    for noisy in ("httpx", "httpcore", "urllib3", "PIL", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def configure_sentry(dsn: str | None, environment: str) -> bool:
    """Wire up Sentry if a DSN is configured.

    PII sending is explicitly disabled: this service handles face photographs,
    and an error report must never carry one.
    """
    if not dsn:
        return False
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            send_default_pii=False,
            max_request_body_size="never",  # never attach the uploaded image
            traces_sample_rate=0.05,
        )
        return True
    except Exception:  # noqa: BLE001 - monitoring must not block startup
        return False


def get_logger(name: str):
    return structlog.get_logger(name)
