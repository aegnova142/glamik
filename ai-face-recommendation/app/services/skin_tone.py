"""Skin-tone estimation from the masked skin region.

Uses the Individual Typology Angle (ITA°), the standard instrumental measure
of constitutive skin colour, computed from CIELAB. The ITA cut-points below
are the widely-cited Chardon/Del Bino boundaries.

The Monk Skin Tone scale is a *perceptual* 10-point scale and has no published
exact ITA mapping, so the conversion here is an approximation derived by
aligning the two orderings. It is reported as an approximation, never as a
measurement.

Nothing here is a medical or dermatological assessment.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.utils.color import LabStats, individual_typology_angle, masked_lab_stats, rgb_stats
from app.utils.validation import normalise_confidence

# Del Bino / Chardon ITA classification boundaries, lightest first.
ITA_BANDS: list[tuple[str, float]] = [
    ("very_light", 55.0),
    ("light", 41.0),
    ("intermediate", 28.0),
    ("tan", 10.0),
    ("brown", -30.0),
    ("dark", float("-inf")),
]

# Presentation labels for the storefront.
CATEGORY_LABELS = {
    "very_light": "very fair",
    "light": "fair",
    "intermediate": "medium",
    "tan": "tan",
    "brown": "deep",
    "dark": "rich",
}

# Approximate ITA upper bounds per Monk step (1 lightest .. 10 deepest).
# fmt: off
MONK_BOUNDS: list[tuple[int, float]] = [
    (1, 66.0), (2, 56.0), (3, 46.0), (4, 34.0), (5, 22.0),
    (6, 10.0), (7, -5.0), (8, -22.0), (9, -40.0), (10, float("-inf")),
]
# fmt: on


@dataclass
class SkinToneResult:
    category: str
    label: str
    monk_scale: int
    ita: float
    confidence: float
    lab: dict[str, float]
    rgb: dict[str, float]
    sample_count: int


def _category_for_ita(ita: float) -> str:
    for name, lower in ITA_BANDS:
        if ita > lower:
            return name
    return "dark"


def _monk_for_ita(ita: float) -> int:
    for step, upper in MONK_BOUNDS:
        if ita >= upper:
            return step
    return 10


def _confidence(stats: LabStats, ita: float) -> float:
    """How much to trust this estimate.

    Three things reduce it:
      - too few sampled pixels (small or heavily-masked face);
      - high lightness variance, which means uneven lighting rather than
        uniform skin;
      - sitting close to a band boundary, where a small measurement error
        flips the category.
    """
    confidence = 0.95

    if stats.sample_count < 1500:
        confidence -= 0.25 * (1.0 - min(1.0, stats.sample_count / 1500.0))

    # L* std above ~12 indicates a strong lighting gradient across the face.
    if stats.l_std > 12.0:
        confidence -= min(0.30, (stats.l_std - 12.0) / 40.0)

    boundaries = [b for _, b in ITA_BANDS if b != float("-inf")]
    nearest = min(abs(ita - b) for b in boundaries)
    if nearest < 6.0:
        confidence -= 0.18 * (1.0 - nearest / 6.0)

    return normalise_confidence(confidence)


def estimate_skin_tone(image_bgr: np.ndarray, mask: np.ndarray) -> SkinToneResult | None:
    stats = masked_lab_stats(image_bgr, mask)
    if stats is None:
        return None

    ita = individual_typology_angle(stats.l, stats.b)
    category = _category_for_ita(ita)

    return SkinToneResult(
        category=category,
        label=CATEGORY_LABELS[category],
        monk_scale=_monk_for_ita(ita),
        ita=round(ita, 2),
        confidence=_confidence(stats, ita),
        lab={
            "l": round(stats.l, 2),
            "a": round(stats.a, 2),
            "b": round(stats.b, 2),
            "l_std": round(stats.l_std, 2),
        },
        rgb={k: round(v, 1) for k, v in rgb_stats(image_bgr, mask).items()},
        sample_count=stats.sample_count,
    )
