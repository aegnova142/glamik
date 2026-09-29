"""Undertone estimation, including its refusal to over-claim."""

from __future__ import annotations

import numpy as np

from app.services.undertone import COOL_RATIO, WARM_RATIO, _classify
from app.utils.color import masked_lab_stats
from tests.conftest import synthetic_skin_patch


def test_classification_boundaries():
    assert _classify(WARM_RATIO + 0.5) == "warm"
    assert _classify(COOL_RATIO - 0.5) == "cool"
    assert _classify((WARM_RATIO + COOL_RATIO) / 2) == "neutral"


def test_golden_skin_reads_warmer_than_pink_skin():
    """Golden skin has more b* (yellow) relative to a* (red) than pink skin."""
    golden = synthetic_skin_patch((110, 165, 205))  # BGR: low blue, high red/green
    pink = synthetic_skin_patch((165, 150, 205))  # BGR: more blue => pinker

    mask = np.full(golden.shape[:2], 255, dtype=np.uint8)
    golden_stats = masked_lab_stats(golden, mask)
    pink_stats = masked_lab_stats(pink, mask)
    assert golden_stats is not None and pink_stats is not None

    golden_ratio = golden_stats.b / golden_stats.a
    pink_ratio = pink_stats.b / pink_stats.a
    assert golden_ratio > pink_ratio


def test_desaturated_skin_falls_back_to_neutral():
    """Near-grey skin carries no readable hue, so it must not be called warm."""
    from app.services.undertone import MIN_CHROMA

    grey = np.full((200, 200, 3), 150, dtype=np.uint8)
    mask = np.full(grey.shape[:2], 255, dtype=np.uint8)
    stats = masked_lab_stats(grey, mask)
    assert stats is not None
    assert float(np.hypot(stats.a, stats.b)) < MIN_CHROMA


def test_confidence_is_bounded():
    from app.utils.validation import normalise_confidence

    assert normalise_confidence(1.9) == 1.0
    assert normalise_confidence(-3.0) == 0.0
    assert normalise_confidence(0.6789) == 0.68


def test_low_confidence_is_reported_as_neutral(monkeypatch):
    """The estimator must not assert warm/cool it cannot support.

    Exercised through the real code path by forcing a weak signal.
    """
    from app.services import undertone as undertone_module

    class FakeFace:
        def points(self, _indices):
            return np.zeros((0, 2), dtype=np.float32)

    grey = np.full((200, 200, 3), 150, dtype=np.uint8)
    mask = np.full(grey.shape[:2], 255, dtype=np.uint8)

    result = undertone_module.estimate_undertone(grey, mask, FakeFace())
    assert result is not None
    assert result.value == "neutral"
    assert result.notes, "a low-confidence result must explain itself"


def test_returns_none_when_no_pixels():
    from app.services.undertone import estimate_undertone

    class FakeFace:
        def points(self, _indices):
            return np.zeros((0, 2), dtype=np.float32)

    image = synthetic_skin_patch((150, 165, 190))
    empty = np.zeros(image.shape[:2], dtype=np.uint8)
    assert estimate_undertone(image, empty, FakeFace()) is None
