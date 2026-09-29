"""Skin-tone maths: ITA, banding and the Monk approximation."""

from __future__ import annotations

import numpy as np

from app.services.skin_tone import ITA_BANDS, _category_for_ita, _monk_for_ita, estimate_skin_tone
from app.utils.color import individual_typology_angle, masked_lab_stats
from tests.conftest import synthetic_skin_patch


def full_mask(image: np.ndarray) -> np.ndarray:
    return np.full(image.shape[:2], 255, dtype=np.uint8)


def test_ita_formula_matches_definition():
    # ITA = arctan((L-50)/b) in degrees.
    assert individual_typology_angle(50.0, 10.0) == 0.0
    assert individual_typology_angle(60.0, 10.0) > 0
    assert individual_typology_angle(40.0, 10.0) < 0


def test_lighter_skin_yields_higher_ita():
    light = synthetic_skin_patch((190, 205, 225))  # BGR, pale
    deep = synthetic_skin_patch((45, 60, 85))  # BGR, deep

    light_result = estimate_skin_tone(light, full_mask(light))
    deep_result = estimate_skin_tone(deep, full_mask(deep))

    assert light_result is not None and deep_result is not None
    assert light_result.ita > deep_result.ita
    # And the ordering must carry through to the Monk approximation.
    assert light_result.monk_scale < deep_result.monk_scale


def test_categories_are_ordered_by_ita():
    assert _category_for_ita(70.0) == "very_light"
    assert _category_for_ita(48.0) == "light"
    assert _category_for_ita(33.0) == "intermediate"
    assert _category_for_ita(18.0) == "tan"
    assert _category_for_ita(-10.0) == "brown"
    assert _category_for_ita(-50.0) == "dark"


def test_every_band_is_reachable():
    produced = {_category_for_ita(ita) for ita in range(-90, 91, 1)}
    assert produced == {name for name, _ in ITA_BANDS}


def test_monk_scale_stays_in_range():
    for ita in range(-90, 91, 3):
        assert 1 <= _monk_for_ita(float(ita)) <= 10


def test_monk_is_monotonic_in_ita():
    values = [_monk_for_ita(float(i)) for i in range(90, -91, -3)]
    assert values == sorted(values), "deeper ITA must not map to a lighter Monk step"


def test_returns_none_without_enough_pixels():
    image = synthetic_skin_patch((150, 170, 190))
    empty = np.zeros(image.shape[:2], dtype=np.uint8)
    assert estimate_skin_tone(image, empty) is None


def test_confidence_drops_with_uneven_lighting():
    size = 256
    even = synthetic_skin_patch((150, 170, 195), size)

    # A strong left-to-right lighting gradient over the same base colour.
    uneven = even.astype(np.int16)
    gradient = np.linspace(-55, 55, size).astype(np.int16)
    uneven += gradient[None, :, None]
    uneven = np.clip(uneven, 0, 255).astype(np.uint8)

    even_result = estimate_skin_tone(even, full_mask(even))
    uneven_result = estimate_skin_tone(uneven, full_mask(uneven))
    assert even_result is not None and uneven_result is not None
    assert uneven_result.confidence <= even_result.confidence


def test_median_resists_specular_highlights():
    """A minority of blown-out pixels must not drag the estimate lighter."""
    image = synthetic_skin_patch((140, 160, 185))
    contaminated = image.copy()
    contaminated[:18, :, :] = 255  # ~7% specular highlight

    clean = estimate_skin_tone(image, full_mask(image))
    dirty = estimate_skin_tone(contaminated, full_mask(contaminated))
    assert clean is not None and dirty is not None
    assert abs(clean.ita - dirty.ita) < 6.0


def test_lab_stats_trim_extremes():
    image = synthetic_skin_patch((140, 160, 185))
    stats = masked_lab_stats(image, full_mask(image))
    assert stats is not None
    assert 0.0 <= stats.l <= 100.0
    assert stats.sample_count > 0
