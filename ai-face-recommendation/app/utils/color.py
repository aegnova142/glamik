"""Colour-space maths for skin analysis.

Everything here operates in CIELAB, because perceptual lightness (L*) and the
two opponent axes (a* red-green, b* yellow-blue) separate "how light is this
skin" from "which way does it lean" far more cleanly than RGB, where the two
are entangled.

OpenCV's 8-bit LAB is scaled: L is 0..255 rather than the true 0..100, and a/b
are offset by +128.
Everything below converts back to true CIELAB before doing any arithmetic, so
the numbers are comparable to published skin-tone literature.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class LabStats:
    """Robust LAB summary of a masked skin region."""

    l: float
    a: float
    b: float
    l_std: float
    a_std: float
    b_std: float
    sample_count: int


def bgr_to_lab_true(image_bgr: np.ndarray) -> np.ndarray:
    """Convert BGR uint8 to true CIELAB floats (L 0..100, a/b roughly -128..127)."""
    lab8 = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab = np.empty_like(lab8)
    lab[..., 0] = lab8[..., 0] * (100.0 / 255.0)
    lab[..., 1] = lab8[..., 1] - 128.0
    lab[..., 2] = lab8[..., 2] - 128.0
    return lab


def lab_true_to_bgr(lab: np.ndarray) -> np.ndarray:
    """Inverse of `bgr_to_lab_true`: true CIELAB floats back to BGR uint8.

    Clipped before the cast because makeup blending can push a channel just
    outside the representable range; wrapping a uint8 overflow would turn a
    slightly-too-bright pixel into a black one.
    """
    lab8 = np.empty_like(lab, dtype=np.float32)
    lab8[..., 0] = lab[..., 0] * (255.0 / 100.0)
    lab8[..., 1] = lab[..., 1] + 128.0
    lab8[..., 2] = lab[..., 2] + 128.0
    return cv2.cvtColor(np.clip(lab8, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


def masked_lab_stats(image_bgr: np.ndarray, mask: np.ndarray) -> LabStats | None:
    """LAB statistics over the masked pixels only.

    Uses the median rather than the mean: skin regions routinely contain a few
    specular highlights or a stray shadow, and a mean lets those drag the whole
    estimate. The median is unmoved by a minority of extreme pixels.
    """
    lab = bgr_to_lab_true(image_bgr)
    selected = mask.astype(bool)
    count = int(np.count_nonzero(selected))
    if count < 50:
        return None

    l_vals = lab[..., 0][selected]
    a_vals = lab[..., 1][selected]
    b_vals = lab[..., 2][selected]

    # Trim the brightest and darkest 10% of pixels by lightness — these are
    # overwhelmingly specular highlights and cast shadows rather than skin.
    lo, hi = np.percentile(l_vals, [10, 90])
    keep = (l_vals >= lo) & (l_vals <= hi)
    if int(np.count_nonzero(keep)) >= 50:
        l_vals, a_vals, b_vals = l_vals[keep], a_vals[keep], b_vals[keep]

    return LabStats(
        l=float(np.median(l_vals)),
        a=float(np.median(a_vals)),
        b=float(np.median(b_vals)),
        l_std=float(np.std(l_vals)),
        a_std=float(np.std(a_vals)),
        b_std=float(np.std(b_vals)),
        sample_count=count,
    )


def individual_typology_angle(l: float, b: float) -> float:
    """ITA° — the standard instrumental measure of constitutive skin colour.

        ITA = arctan((L* - 50) / b*) * 180 / pi

    Higher is lighter. Undefined when b* is 0, which cannot occur for real
    skin but is guarded anyway.
    """
    if abs(b) < 1e-6:
        return 90.0 if l >= 50 else -90.0
    return math.degrees(math.atan2(l - 50.0, b))


def hue_angle(a: float, b: float) -> float:
    """CIELAB hue angle in degrees, 0..360."""
    return math.degrees(math.atan2(b, a)) % 360.0


def chroma(a: float, b: float) -> float:
    return math.hypot(a, b)


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def rgb_stats(image_bgr: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """Median R/G/B of the masked region, for reporting and debugging."""
    selected = mask.astype(bool)
    if not selected.any():
        return {"r": 0.0, "g": 0.0, "b": 0.0}
    b, g, r = (image_bgr[..., i][selected] for i in range(3))
    return {
        "r": float(np.median(r)),
        "g": float(np.median(g)),
        "b": float(np.median(b)),
    }


def hex_to_lab(hex_colour: str) -> tuple[float, float, float] | None:
    """Convert a `#rrggbb` swatch colour to true CIELAB.

    Routed through the same `cv2.cvtColor` path as every skin measurement
    (rather than a separate library's colour-management pipeline), so a shade
    swatch and a measured skin tone are never subject to two different
    roundings of the same colour space. Returns None for anything that is not
    a plain 6-digit hex colour — a catalog swatch is admin-entered text, not a
    guaranteed-valid colour.
    """
    text = hex_colour.strip().lstrip("#")
    # `#abc` is valid CSS shorthand for `#aabbcc`, and both appear in
    # admin-entered swatch data.
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return None
    try:
        r, g, b = (int(text[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None
    pixel = np.array([[[b, g, r]]], dtype=np.uint8)
    lab = bgr_to_lab_true(pixel)[0, 0]
    return float(lab[0]), float(lab[1]), float(lab[2])


def delta_e2000(lab_a: tuple[float, float, float], lab_b: tuple[float, float, float]) -> float:
    """Perceptual colour distance (CIEDE2000).

    Plain Euclidean distance in LAB is not perceptually uniform — the same
    numeric gap reads as a much bigger colour difference in some regions of
    the space than others, which is exactly wrong for judging whether two skin
    tones look alike. CIEDE2000 corrects for that; the formula is delegated to
    `colour-science` rather than reimplemented, since a subtly wrong distance
    formula would silently misorder every shade match.
    """
    import colour

    return float(
        colour.delta_E(
            np.array(lab_a, dtype=np.float64), np.array(lab_b, dtype=np.float64), method="CIE 2000"
        )
    )
