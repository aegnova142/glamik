"""Image quality gate.

Runs before any expensive analysis. A skin-tone estimate from a dim, blurry or
heavily-filtered photo is not a worse estimate — it is a meaningless one, and
returning it with a confidence number attached would be misleading. So this
gate fails closed.

Thresholds are empirical and deliberately stated as named constants rather
than buried in the code, because they are the kind of thing that needs tuning
against real traffic.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.config import Settings
from app.services.face_landmarks import FaceResult

# --- thresholds -------------------------------------------------------------
BLUR_MIN = 55.0  # variance of Laplacian; below this is visibly soft
BRIGHTNESS_MIN = 55.0  # mean luma 0..255
BRIGHTNESS_MAX = 215.0
CONTRAST_MIN = 18.0  # std of luma
CLIPPED_MAX = 0.14  # fraction of pixels at 0 or 255
FACE_RATIO_MIN = 0.045  # face bbox area / image area
FACE_RATIO_IDEAL = 0.12
YAW_MAX = 15.0
PITCH_MAX = 15.0
ROLL_MAX = 20.0
EDGE_MARGIN = 0.02  # face must not be flush against the frame edge
SMOOTHNESS_MAX = 0.0022  # suspiciously low skin texture => beauty filter


@dataclass
class QualityReport:
    score: float
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metrics: dict[str, float] = field(default_factory=dict)

    @property
    def acceptable(self) -> bool:
        return not self.issues


def _luma(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)


def assess_basic(image_bgr: np.ndarray) -> QualityReport:
    """Whole-image checks that do not need a face.

    Cheap, and lets an obviously unusable photo be rejected before the
    landmarker runs at all.
    """
    gray = _luma(image_bgr)
    report = QualityReport(score=1.0)

    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())
    clipped = float(np.mean((gray <= 2) | (gray >= 253)))

    report.metrics.update(
        blur=round(blur, 2),
        brightness=round(brightness, 2),
        contrast=round(contrast, 2),
        clipped_fraction=round(clipped, 4),
    )

    if blur < BLUR_MIN:
        report.issues.append("BLURRY")
    if brightness < BRIGHTNESS_MIN:
        report.issues.append("LOW_LIGHT")
    elif brightness > BRIGHTNESS_MAX:
        report.issues.append("OVEREXPOSED")
    if contrast < CONTRAST_MIN:
        report.issues.append("LOW_CONTRAST")
    if clipped > CLIPPED_MAX:
        # Blown highlights destroy exactly the mid-tones skin analysis needs.
        report.issues.append("HARSH_LIGHTING")

    # Score here too, not only in assess_with_face. When the basic gate rejects
    # an image the request ends right there, and reporting "score: 1.0" next to
    # an issue list is self-contradictory to whoever reads the response.
    report.score = _score(report)
    return report


def assess_with_face(
    image_bgr: np.ndarray,
    face: FaceResult,
    base: QualityReport,
    settings: Settings | None = None,
) -> QualityReport:
    """Face-dependent checks, merged into the basic report.

    Pose limits come from settings when supplied, so a deployment can loosen or
    tighten them without a code change; the constants above are the defaults.
    """
    yaw_max = settings.max_yaw_degrees if settings else YAW_MAX
    pitch_max = settings.max_pitch_degrees if settings else PITCH_MAX

    report = QualityReport(
        score=base.score,
        issues=list(base.issues),
        warnings=list(base.warnings),
        metrics=dict(base.metrics),
    )

    h, w = face.image_shape
    x, y, bw, bh = face.bbox
    ratio = face.face_area_ratio

    report.metrics.update(
        face_area_ratio=round(ratio, 4),
        yaw=face.pose.yaw,
        pitch=face.pose.pitch,
        roll=face.pose.roll,
    )

    if ratio < FACE_RATIO_MIN:
        report.issues.append("FACE_TOO_SMALL")
    elif ratio < FACE_RATIO_IDEAL:
        report.warnings.append("FACE_SMALL")

    margin_x, margin_y = EDGE_MARGIN * w, EDGE_MARGIN * h
    if x <= margin_x or y <= margin_y or (x + bw) >= (w - margin_x) or (y + bh) >= (h - margin_y):
        # A face touching the frame edge is usually partially outside it, so
        # the regions we sample may simply not be present.
        report.warnings.append("FACE_NEAR_EDGE")

    if abs(face.pose.yaw) > yaw_max:
        report.issues.append("HEAD_TURNED")
    if abs(face.pose.pitch) > pitch_max:
        report.issues.append("HEAD_TILTED_VERTICALLY")
    if abs(face.pose.roll) > ROLL_MAX:
        report.warnings.append("HEAD_ROTATED")

    smoothness = _skin_smoothness(image_bgr, face)
    report.metrics["skin_texture"] = round(smoothness, 5)
    if smoothness < SMOOTHNESS_MAX:
        # Beauty filters flatten pore-level texture. The colour may survive,
        # but concern detection on filtered skin is worthless, so flag it.
        report.warnings.append("POSSIBLE_BEAUTY_FILTER")

    report.score = _score(report)
    return report


def _skin_smoothness(image_bgr: np.ndarray, face: FaceResult) -> float:
    """High-frequency energy over the cheeks, normalised by local brightness.

    Real skin has pore and fine-line texture. Aggressive smoothing filters
    remove it, which is detectable without needing to identify the filter.
    """
    from app.services.face_landmarks import LEFT_CHEEK, RIGHT_CHEEK

    gray = _luma(image_bgr).astype(np.float32)
    pts = np.vstack([face.points(LEFT_CHEEK), face.points(RIGHT_CHEEK)])
    if len(pts) < 3:
        return 1.0

    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillConvexPoly(mask, cv2.convexHull(pts.astype(np.int32)), 255)
    selected = mask.astype(bool)
    if int(np.count_nonzero(selected)) < 100:
        return 1.0

    blurred = cv2.GaussianBlur(gray, (0, 0), 1.5)
    detail = np.abs(gray - blurred)[selected]
    mean_level = float(gray[selected].mean()) or 1.0
    return float(detail.mean() / mean_level)


def _score(report: QualityReport) -> float:
    """A single 0..1 number for the caller to show or threshold on."""
    score = 1.0
    score -= 0.28 * len(report.issues)
    score -= 0.06 * len(report.warnings)

    blur = report.metrics.get("blur", BLUR_MIN)
    if blur < BLUR_MIN * 3:
        score -= 0.10 * (1.0 - min(1.0, blur / (BLUR_MIN * 3)))

    ratio = report.metrics.get("face_area_ratio")
    if ratio is not None and ratio < FACE_RATIO_IDEAL:
        score -= 0.10 * (1.0 - min(1.0, ratio / FACE_RATIO_IDEAL))

    return round(max(0.0, min(1.0, score)), 2)
