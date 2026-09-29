"""Redis cache and rate limiter.

Cache keys are

    ai:v1:analysis:<image_sha256>:<model_version_hash>:<params_hash>

Three properties follow deliberately:

  - **Model versions are in the key**, so upgrading a model cannot serve a
    stale result computed by the previous one.
  - **The image hash is the identity**, never a user id, so the cache cannot
    become a record of who uploaded what.
  - **TTL is configurable and finite.** Nothing is cached forever.

Redis being down is never fatal; every operation degrades to a miss.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
from typing import Any

import structlog

from app.config import Settings
from app.core.logging import CACHE_EVENTS

logger = structlog.get_logger(__name__)

NAMESPACE = "ai:v1"


def _short_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def build_cache_key(
    kind: str, image_sha256: str, model_signature: str, params: dict[str, Any] | None = None
) -> str:
    params_hash = _short_hash(json.dumps(params or {}, sort_keys=True, default=str))
    return f"{NAMESPACE}:{kind}:{image_sha256}:{_short_hash(model_signature)}:{params_hash}"


class CacheClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._redis: Any = None
        self._enabled = bool(settings.redis_url)

    async def connect(self) -> None:
        url = self._settings.redis_url
        if not self._enabled or not url:
            logger.info("cache_disabled", reason="REDIS_URL not set")
            return
        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
            )
            await self._redis.ping()
            logger.info("cache_connected")
        except Exception as exc:  # noqa: BLE001 - cache is optional by design
            logger.warning("cache_unavailable", error=str(exc))
            self._redis = None

    async def close(self) -> None:
        if self._redis is not None:
            # Shutdown must not raise: a failure to close a socket cannot be
            # allowed to mask whatever else is happening during shutdown.
            with contextlib.suppress(Exception):
                await self._redis.aclose()
            self._redis = None

    @property
    def available(self) -> bool:
        return self._redis is not None

    async def get_json(self, key: str) -> dict[str, Any] | None:
        if self._redis is None:
            return None
        try:
            raw = await self._redis.get(key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache_read_failed", error=str(exc))
            return None
        if raw:
            CACHE_EVENTS.labels(result="hit").inc()
            return json.loads(raw)
        CACHE_EVENTS.labels(result="miss").inc()
        return None

    async def set_json(self, key: str, value: dict[str, Any], ttl: int | None = None) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.set(
                key, json.dumps(value, default=str), ex=ttl or self._settings.cache_ttl_seconds
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache_write_failed", error=str(exc))

    async def delete(self, key: str) -> int:
        if self._redis is None:
            return 0
        try:
            return int(await self._redis.delete(key))
        except Exception as exc:  # noqa: BLE001
            logger.warning("cache_delete_failed", error=str(exc))
            return 0

    async def allow_request(self, key: str, limit_per_minute: int) -> bool:
        """Fixed-window rate limit.

        Fails **open**: if Redis is unreachable the request proceeds. A cache
        outage taking down analysis entirely would be a worse failure than
        briefly losing rate limiting, and the Node backend is the real
        perimeter.
        """
        if self._redis is None:
            return True
        try:
            full_key = f"{NAMESPACE}:{key}"
            count = int(await self._redis.incr(full_key))
            if count == 1:
                await self._redis.expire(full_key, 60)
            return count <= limit_per_minute
        except Exception as exc:  # noqa: BLE001
            logger.warning("rate_limit_check_failed", error=str(exc))
            return True
