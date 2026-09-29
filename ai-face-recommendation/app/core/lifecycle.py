"""Application lifespan and request-scoped accessors.

Models, the Redis connection and the Node HTTP client are built exactly once
here and held on `app.state.ai`. Nothing in a request handler constructs them:
loading a model per request would dominate latency and exhaust memory under
any real concurrency.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass

import cv2
import structlog
from fastapi import FastAPI, Request

from app.config import Settings, get_settings
from app.core.errors import AIServiceError, ErrorCode
from app.models.loader import load_models
from app.models.registry import ModelRegistry
from app.services.cache import CacheClient
from app.services.catalog_client import NodeClient

logger = structlog.get_logger(__name__)


@dataclass
class AppState:
    settings: Settings
    models: ModelRegistry
    cache: CacheClient
    node: NodeClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # OpenCV defaults to one thread per core per operation. With several
    # Gunicorn workers each doing that, the box is oversubscribed several
    # times over and everything slows down. Parallelism belongs at the
    # request level, not inside each cv2 call.
    cv2.setNumThreads(1)

    for warning in settings.config_warnings():
        logger.warning("config_warning", detail=warning)

    models = load_models(settings)

    cache = CacheClient(settings)
    await cache.connect()

    node = NodeClient(settings)
    await node.connect()

    app.state.ai = AppState(settings=settings, models=models, cache=cache, node=node)

    logger.info(
        "service_started",
        ready=models.ready,
        cache=cache.available,
        node_backend=settings.node_backend_url,
        missing_models=[s.name for s in models.missing_required()],
    )

    try:
        yield
    finally:
        await node.close()
        await cache.close()
        models.close()
        logger.info("service_stopped")


# --- accessors --------------------------------------------------------------


def get_state(request: Request) -> AppState:
    state = getattr(request.app.state, "ai", None)
    if state is None:
        # Only reachable if a request arrives before lifespan finished.
        raise AIServiceError(ErrorCode.INTERNAL_ERROR, "The service is still starting up.")
    return state


def get_settings_dep(request: Request) -> Settings:
    return get_state(request).settings


def get_models(request: Request) -> ModelRegistry:
    return get_state(request).models


def get_cache(request: Request) -> CacheClient:
    return get_state(request).cache


def get_node(request: Request) -> NodeClient:
    return get_state(request).node
