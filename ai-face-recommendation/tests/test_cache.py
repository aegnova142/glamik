"""Cache keys, TTL behaviour and graceful degradation.

Redis is not required for these: the key construction is pure, and the client
is asserted to degrade to a miss when it is absent, which is exactly the state
the test suite runs in.
"""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.models.registry import ModelRegistry
from app.services.cache import NAMESPACE, CacheClient, build_cache_key

SHA = "a" * 64


def test_key_is_namespaced_and_versioned():
    key = build_cache_key("analysis", SHA, ModelRegistry().cache_signature(), {})
    assert key.startswith(f"{NAMESPACE}:analysis:{SHA}:")


def test_a_model_upgrade_invalidates_cached_results():
    """The core reason versions are in the key.

    Without this, upgrading a model would keep serving answers computed by the
    previous one until every TTL expired.
    """
    old = ModelRegistry()
    new = ModelRegistry()
    new.face_parser.version = "bisenet-v2.0.0"

    assert build_cache_key("analysis", SHA, old.cache_signature(), {}) != build_cache_key(
        "analysis", SHA, new.cache_signature(), {}
    )


def test_different_images_get_different_keys():
    signature = ModelRegistry().cache_signature()
    assert build_cache_key("analysis", "a" * 64, signature, {}) != build_cache_key(
        "analysis", "b" * 64, signature, {}
    )


def test_parameters_are_part_of_the_key():
    """A mirrored capture is a different analysis of the same bytes."""
    signature = ModelRegistry().cache_signature()
    assert build_cache_key("analysis", SHA, signature, {"mirrored": True}) != build_cache_key(
        "analysis", SHA, signature, {"mirrored": False}
    )


def test_key_order_does_not_matter():
    signature = ModelRegistry().cache_signature()
    assert build_cache_key("analysis", SHA, signature, {"a": 1, "b": 2}) == build_cache_key(
        "analysis", SHA, signature, {"b": 2, "a": 1}
    )


def test_the_key_contains_no_user_identity():
    """Identity is the image hash, never a user id.

    The cache must not become a record of who submitted which face.
    """
    key = build_cache_key("analysis", SHA, ModelRegistry().cache_signature(), {})
    assert "user" not in key and "customer" not in key


@pytest.mark.asyncio
async def test_cache_degrades_to_a_miss_when_redis_is_absent():
    client = CacheClient(get_settings().model_copy(update={"redis_url": None}))
    await client.connect()
    assert client.available is False
    assert await client.get_json("anything") is None
    await client.set_json("anything", {"x": 1})  # must not raise
    await client.close()


@pytest.mark.asyncio
async def test_rate_limiting_fails_open():
    """A Redis outage must not take analysis down with it.

    Losing rate limiting briefly is a smaller failure than refusing every
    request, and the Node backend is the real perimeter.
    """
    client = CacheClient(get_settings().model_copy(update={"redis_url": None}))
    await client.connect()
    assert await client.allow_request("rate:test", 1) is True
    assert await client.allow_request("rate:test", 1) is True
    await client.close()


def test_ttl_is_finite():
    """Nothing is cached forever."""
    settings = get_settings()
    assert 0 < settings.cache_ttl_seconds <= 86_400
