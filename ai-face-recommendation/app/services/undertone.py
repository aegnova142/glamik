"""Undertone estimation: warm / cool / neutral.

Undertone is the hue of skin once lightness is factored out, so it is read
from the CIELAB opponent axes: b* (yellow-blue) against a* (red-green). Skin
always sits in the yellow-red quadrant; what varies is the balance.

  higher b* relative to a*  ->  golden / yellow  ->  warm
  higher a* relative to b*  ->  pink / red       ->  cool
  balanced                  ->  neutral

This is materially less reliable than tone estimation — white balance shifts
hue directly, and consumer cameras rarely white-balance skin correctly. So the
estimator is conservative: when the signal is weak or the regions disagree, it
returns "neutral" and says why, rather than guessing warm or cool.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.services.face_landmarks import FOREHEAD, LEFT_CHEEK, RIGHT_CHEEK, FaceResult
from app.utils.color import hue_angle, masked_lab_stats
from app.utils.validation import normalise_confidence

# b*/a* ratio decision boundaries, tuned so that clearly golden and clearly
# pink skin separate while the ambiguous middle falls to neutral.
WARM_RATIO = 1.55
COOL_RATIO = 1.05
# Below this chroma the hue is too washed out to read at all.
MIN_CHROMA = 6.0


@dataclass
class UndertoneResult:
    value: str
    confidence: float
    ratio: float
    hue: float
    region_agreement: float
    notes: list[str] = field(default_factory=list)


def _region_ratio(image_bgr: np.ndarray, face: FaceResult, indices: list[int]) -> float | None:
    pts = face.points(indices)
    if len(pts) < 3:
        return None
    mask = np.zeros(image_bgr.shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(pts.astype(np.int32)), 255)
    mask = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    stats = masked_lab_stats(image_bgr, mask)
    if stats is None or abs(stats.a) < 1e-3:
        return None
    return stats.b / stats.a


def _classify(ratio: float) -> str:
    if ratio >= WARM_RATIO:
        return "warm"
    if ratio <= COOL_RATIO:
        return "cool"
    return "neutral"


def estimate_undertone(
    image_bgr: np.ndarray, mask: np.ndarray, face: FaceResult
) -> UndertoneResult | None:
    stats = masked_lab_stats(image_bgr, mask)
    if stats is None:
        return None

    notes: list[str] = []
    chroma = float(np.hypot(stats.a, stats.b))

    if abs(stats.a) < 1e-3:
        return UndertoneResult(
            value="neutral",
            confidence=0.3,
            ratio=0.0,
            hue=0.0,
            region_agreement=0.0,
            notes=["Skin colour too desaturated to read an undertone."],
        )

    overall_ratio = stats.b / stats.a
    value = _classify(overall_ratio)
    confidence = 0.8

    # Cross-check against individual regions. Agreement is the strongest
    # available evidence that we are reading skin and not a lighting cast.
    region_values: list[str] = []
    for region in (LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD):
        r = _region_ratio(image_bgr, face, region)
        if r is not None:
            region_values.append(_classify(r))

    agreement = 0.0
    if region_values:
        agreement = region_values.count(value) / len(region_values)
        if agreement < 0.5:
            notes.append(
                "Facial regions disagreed on undertone, which usually means uneven "
                "lighting or a colour cast."
            )
            value = "neutral"
            confidence -= 0.25
        else:
            confidence += 0.10 * (agreement - 0.5) * 2

    if chroma < MIN_CHROMA:
        notes.append("Low skin colour saturation reduces undertone reliability.")
        confidence -= 0.25
        value = "neutral"

    # Near a decision boundary the classification is essentially a coin flip.
    distance = min(abs(overall_ratio - WARM_RATIO), abs(overall_ratio - COOL_RATIO))
    if distance < 0.12:
        confidence -= 0.15
        notes.append("Undertone sits close to the warm/cool boundary.")

    if stats.l_std > 14.0:
        confidence -= 0.10
        notes.append("Uneven lighting across the face reduces confidence.")

    confidence = normalise_confidence(confidence)

    # Below this, asserting warm or cool would overstate what we know.
    if confidence < 0.45 and value != "neutral":
        notes.append(f"Estimated '{value}' but confidence is low; reporting neutral instead.")
        value = "neutral"

    return UndertoneResult(
        value=value,
        confidence=confidence,
        ratio=round(overall_ratio, 3),
        hue=round(hue_angle(stats.a, stats.b), 2),
        region_agreement=round(agreement, 2),
        notes=notes,
    )
