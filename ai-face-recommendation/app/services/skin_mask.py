"""Builds the skin region that every colour measurement is taken from.

The mask **comes from face parsing**. Landmarks only narrow it down to the
regions worth sampling — cheeks, forehead, chin — which are flat, centrally
lit, and free of the specular highlight that concentrates on the nose.

A final statistical pass drops pixels whose colour is far from the region's
own median, catching whatever survived segmentation (a stray strand, a
blemish, a cast shadow).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.core.errors import AIServiceError, ErrorCode
from app.models.registry import ModelRegistry
from app.services import face_parser
from app.services.face_landmarks import CHIN, FOREHEAD, LEFT_CHEEK, RIGHT_CHEEK, FaceResult

# Below this, the sample is too small for a median to mean anything.
MIN_SKIN_PIXELS = 400


@dataclass
class SkinMask:
    mask: np.ndarray
    source: str
    skin_pixels: int
    coverage: float  # masked pixels / face bbox area
    refined_by_landmarks: bool


def _region_mask(shape: tuple[int, int], face: FaceResult, regions: list[list[int]]) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    for region in regions:
        pts = face.points(region)
        if len(pts) >= 3:
            cv2.fillConvexPoly(mask, cv2.convexHull(pts.astype(np.int32)), 255)
    return cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))


def _reject_colour_outliers(image_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Drop pixels far from the region's own median colour.

    Median + MAD rather than mean + standard deviation: the outliers being
    removed would themselves inflate a standard deviation, so the test would
    widen to admit them.
    """
    selected = mask.astype(bool)
    if int(np.count_nonzero(selected)) < 100:
        return mask

    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    samples = lab[selected]
    median = np.median(samples, axis=0)
    deviation = np.abs(samples - median)
    mad = np.median(deviation, axis=0) + 1e-6

    # 1.4826 rescales MAD to a standard-deviation equivalent for normal data.
    keep = np.all(deviation <= 3.0 * mad * 1.4826, axis=1)

    refined = np.zeros_like(mask)
    ys, xs = np.nonzero(selected)
    refined[ys[keep], xs[keep]] = 255
    return refined if int(np.count_nonzero(refined)) >= MIN_SKIN_PIXELS else mask


def build_skin_mask(image_bgr: np.ndarray, face: FaceResult, registry: ModelRegistry) -> SkinMask:
    """Produce the skin-only mask, or raise if it cannot be trusted."""
    # Raises MODEL_NOT_CONFIGURED when no parser is installed — there is
    # deliberately no geometric fallback.
    parsed = face_parser.parse_face(image_bgr, registry)

    if parsed.skin_pixels < MIN_SKIN_PIXELS:
        raise AIServiceError(
            ErrorCode.RETAKE_PHOTO,
            "Not enough clear skin was visible to analyse. Remove heavy coverage and "
            "retake the photo in even lighting.",
            extra={"quality_issues": ["INSUFFICIENT_SKIN_VISIBLE"]},
        )

    mask = parsed.skin_mask
    refined = False

    # Narrow to the stable sampling regions when that still leaves enough
    # pixels. Measurably more consistent under uneven lighting; skipped rather
    # than forced when it would starve the sample.
    height, width = int(image_bgr.shape[0]), int(image_bgr.shape[1])
    preferred = _region_mask((height, width), face, [LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN])
    combined = cv2.bitwise_and(mask, preferred)
    if int(np.count_nonzero(combined)) >= MIN_SKIN_PIXELS:
        mask = combined
        refined = True

    mask = _reject_colour_outliers(image_bgr, mask)

    _, _, bw, bh = face.bbox
    count = int(np.count_nonzero(mask))
    if count < MIN_SKIN_PIXELS:
        raise AIServiceError(
            ErrorCode.RETAKE_PHOTO,
            "Skin colour could not be measured reliably from this photo.",
            extra={"quality_issues": ["INSUFFICIENT_SKIN_VISIBLE"]},
        )

    return SkinMask(
        mask=mask,
        source="bisenet_face_parsing",
        skin_pixels=count,
        coverage=round(count / float(max(1, bw * bh)), 4),
        refined_by_landmarks=refined,
    )
