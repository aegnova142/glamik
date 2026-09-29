"""Shared async HTTP client for calls back to the Node backend.

One `httpx.AsyncClient` is created during lifespan and reused: a per-request
client would discard the connection pool and pay a fresh TLS handshake every
time.

Retries are deliberately narrow. Only idempotent reads are retried; a mutation
is never replayed, because a timeout does not prove the request failed to
arrive.

Phase 1 uses none of this yet — catalog fetching belongs to Phase 2. The
client exists so the integration seam and its timeout/retry policy are settled
before anything depends on them.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.config import Settings
from app.core.errors import AIServiceError, ErrorCode

logger = structlog.get_logger(__name__)

# Node endpoint the AI service reads the catalog from. Documented in the
# README as an integration requirement; it is NOT added by this service.
CATALOG_PATH = "/api/internal/ai/catalog"


class NodeClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    async def connect(self) -> None:
        s = self._settings
        self._client = httpx.AsyncClient(
            base_url=s.node_backend_url.rstrip("/"),
            timeout=httpx.Timeout(
                connect=s.node_connect_timeout,
                read=s.node_read_timeout,
                write=s.node_write_timeout,
                pool=s.node_total_timeout,
            ),
            limits=httpx.Limits(
                max_connections=s.node_max_connections,
                max_keepalive_connections=s.node_max_connections // 2 or 1,
            ),
            headers={
                s.internal_api_key_header: s.internal_api_key,
                "Accept": "application/json",
                "User-Agent": "glamirk-ai/1.0",
            },
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def connected(self) -> bool:
        return self._client is not None

    async def get_json(self, path: str) -> Any:
        """GET with bounded retries. Safe: GET is idempotent."""
        if self._client is None:
            raise AIServiceError(ErrorCode.CATALOG_UNAVAILABLE, "Node client is not initialised.")

        @retry(
            reraise=True,
            stop=stop_after_attempt(self._settings.node_max_retries + 1),
            wait=wait_exponential_jitter(initial=0.1, max=1.5),
            retry=retry_if_exception_type((httpx.TransportError, httpx.TimeoutException)),
        )
        async def _attempt() -> httpx.Response:
            assert self._client is not None
            return await self._client.get(path)

        try:
            response = await _attempt()
        except httpx.HTTPError as exc:
            logger.error("node_request_failed", path=path, error=str(exc))
            raise AIServiceError(
                ErrorCode.CATALOG_UNAVAILABLE,
                "The Glamirk backend is unreachable. Please try again shortly.",
            ) from exc

        if response.status_code in (401, 403):
            raise AIServiceError(
                ErrorCode.CATALOG_UNAVAILABLE,
                "The AI service is not authorised to call the Glamirk backend.",
            )
        if response.status_code >= 400:
            raise AIServiceError(
                ErrorCode.CATALOG_UNAVAILABLE,
                f"The Glamirk backend returned an error ({response.status_code}).",
            )

        try:
            return response.json()
        except ValueError as exc:
            raise AIServiceError(
                ErrorCode.CATALOG_UNAVAILABLE, "The Glamirk backend returned invalid JSON."
            ) from exc

    async def healthy(self) -> bool:
        if self._client is None:
            return False
        try:
            response = await self._client.get("/api/health", timeout=3.0)
            return response.status_code < 500
        except httpx.HTTPError:
            return False
