"""Shared test fixtures.

The environment is set here, before any app import, because `Settings` is read
at import time and cached. Tests therefore run against throwaway local values
and never against a real key, a real Redis or a real Node backend.
"""

from __future__ import annotations

import os

import numpy as np
import pytest

os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("REDIS_URL", "")  # cache and rate limiting disabled
os.environ.setdefault("NODE_BACKEND_URL", "http://localhost:3000")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("SENTRY_DSN", "")

TEST_KEY = os.environ["INTERNAL_API_KEY"]
AUTH = {"X-Internal-AI-Key": TEST_KEY}


@pytest.fixture(scope="session")
def auth_headers() -> dict[str, str]:
    return dict(AUTH)


@pytest.fixture(scope="session")
def client():
    """TestClient with the lifespan run, so models load exactly as in production."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def registry(client):
    return client.app.state.ai.models


@pytest.fixture(scope="session")
def models_ready(registry) -> bool:
    """Whether every required model is actually present.

    Vision tests skip rather than fail when they are not: the models are a
    separate download, and their absence is a configuration state this service
    is designed to report, not a code defect. The tests that assert on that
    reporting always run.
    """
    return bool(registry.ready)


@pytest.fixture(scope="session")
def landmarker_available(registry) -> bool:
    return bool(registry.face_landmarker.available)


# --- image helpers ----------------------------------------------------------


def encode_png(image: np.ndarray) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".png", image)
    assert ok, "failed to encode test image"
    return buf.tobytes()


def encode_jpeg(image: np.ndarray, quality: int = 92) -> bytes:
    import cv2

    ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    assert ok, "failed to encode test image"
    return buf.tobytes()


def upload(image_bytes: bytes, name: str = "face.png", mime: str = "image/png") -> dict:
    return {"image": (name, image_bytes, mime)}


@pytest.fixture
def flat_image() -> np.ndarray:
    """Plain mid-grey: decodes fine, has no texture and no face."""
    return np.full((480, 480, 3), 128, dtype=np.uint8)


@pytest.fixture
def noise_image() -> np.ndarray:
    """Textured noise — passes blur and contrast checks, still has no face."""
    rng = np.random.default_rng(7)
    return rng.integers(60, 200, size=(480, 480, 3), dtype=np.uint8)


@pytest.fixture
def dark_image() -> np.ndarray:
    """Too dark to analyse; must trip the quality gate."""
    rng = np.random.default_rng(11)
    return rng.integers(0, 22, size=(480, 480, 3), dtype=np.uint8)


@pytest.fixture
def blurry_image() -> np.ndarray:
    import cv2

    rng = np.random.default_rng(13)
    base = rng.integers(60, 200, size=(480, 480, 3), dtype=np.uint8)
    return cv2.GaussianBlur(base, (0, 0), 9)


def synthetic_skin_patch(bgr: tuple[int, int, int], size: int = 256) -> np.ndarray:
    """A textured patch of a known colour, for colour-maths tests.

    Texture is added deliberately: the analysis trims extreme percentiles, so a
    perfectly uniform patch would not exercise the real code path.
    """
    rng = np.random.default_rng(3)
    base = np.zeros((size, size, 3), dtype=np.int16)
    base[:, :] = bgr
    base += rng.integers(-6, 7, size=base.shape, dtype=np.int16)
    return np.clip(base, 0, 255).astype(np.uint8)


def full_mask(image: np.ndarray) -> np.ndarray:
    return np.full(image.shape[:2], 255, dtype=np.uint8)


@pytest.fixture(scope="session")
def sample_face_bytes() -> bytes | None:
    """A real face photo, if one has been placed in tests/assets/.

    None is returned when it has not. No face image is committed to this
    repository — the service exists to handle people's faces, and its test
    suite should not be a place where one is stored.
    """
    from pathlib import Path

    assets = Path(__file__).parent / "assets"
    for candidate in sorted(assets.glob("face.*")) if assets.is_dir() else []:
        if candidate.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".heic"}:
            return candidate.read_bytes()
    return None


@pytest.fixture
def stub_pipeline(monkeypatch):
    """A registry with every model marked loaded, and the stages around the
    one under test replaced by stubs.

    This isolates pipeline *control flow* — which gates fire, in what order —
    from the vision models, which are a separate download and are exercised by
    their own tests.
    """
    from app.models.registry import ModelRegistry, ModelStatus
    from app.services import pipeline as pipeline_module
    from app.services.skin_concerns import ConcernResult

    registry = ModelRegistry()
    for slot in registry.slots():
        slot.status = ModelStatus.LOADED
        slot.handle = object()
        slot.detail = "stubbed for tests"

    class _Loaded:
        bgr = np.zeros((64, 64, 3), dtype=np.uint8)
        source_format = "PNG"
        exif_transposed = False
        icc_converted = False
        unmirrored = False

    class _Quality:
        def __init__(self):
            self.acceptable = True
            self.issues: list[str] = []
            self.warnings: list[str] = []
            self.metrics: dict[str, float] = {}
            self.score = 0.9

    class _Mask:
        mask = np.full((64, 64), 255, dtype=np.uint8)
        source = "bisenet_face_parsing"
        skin_pixels = 5000
        coverage = 0.5
        refined_by_landmarks = True

    monkeypatch.setattr(pipeline_module.image_loader, "load_image", lambda *a, **k: _Loaded())
    monkeypatch.setattr(
        pipeline_module.image_loader, "resize_for_analysis", lambda image, side: image
    )
    monkeypatch.setattr(pipeline_module.image_quality, "assess_basic", lambda image: _Quality())
    monkeypatch.setattr(
        pipeline_module.image_quality, "assess_with_face", lambda *a, **k: _Quality()
    )
    monkeypatch.setattr(pipeline_module.face_landmarks, "detect_face", lambda *a, **k: object())
    monkeypatch.setattr(pipeline_module.skin_mask, "build_skin_mask", lambda *a, **k: _Mask())
    monkeypatch.setattr(pipeline_module.undertone, "estimate_undertone", lambda *a, **k: None)
    monkeypatch.setattr(
        pipeline_module.skin_concerns,
        "predict_concerns",
        lambda *a, **k: ConcernResult(available=False, reason="MODEL_NOT_CONFIGURED"),
    )
    return registry
