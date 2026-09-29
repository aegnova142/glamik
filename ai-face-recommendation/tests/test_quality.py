"""The image quality gate.

The property under test is that the gate fails closed. A tone estimate from a
dark or blurry photo is not a slightly worse estimate — it is a meaningless
one, and returning it with a confidence attached would mislead.
"""

from __future__ import annotations

import numpy as np

from app.config import get_settings
from app.services import image_quality

SETTINGS = get_settings()


def test_a_usable_image_passes(noise_image):
    report = image_quality.assess_basic(noise_image)
    assert report.acceptable
    assert report.score > 0.8


def test_a_dark_image_is_rejected(dark_image):
    report = image_quality.assess_basic(dark_image)
    assert not report.acceptable
    assert "LOW_LIGHT" in report.issues


def test_a_blurry_image_is_rejected(blurry_image):
    report = image_quality.assess_basic(blurry_image)
    assert not report.acceptable
    assert "BLURRY" in report.issues


def test_a_flat_image_is_rejected_for_contrast(flat_image):
    report = image_quality.assess_basic(flat_image)
    assert not report.acceptable
    assert {"LOW_CONTRAST", "BLURRY"} & set(report.issues)


def test_an_overexposed_image_is_rejected():
    rng = np.random.default_rng(5)
    bright = rng.integers(230, 256, size=(480, 480, 3), dtype=np.uint8)
    report = image_quality.assess_basic(bright)
    assert not report.acceptable
    assert {"OVEREXPOSED", "HARSH_LIGHTING"} & set(report.issues)


def test_score_never_contradicts_the_issue_list(dark_image, blurry_image, flat_image):
    """A rejected image must not also report a perfect score.

    This was a real defect: scoring only ran in the face-aware pass, so a basic
    rejection returned `score: 1.0` next to `issues: ["BLURRY"]` — two
    statements that cannot both be true.
    """
    for image in (dark_image, blurry_image, flat_image):
        report = image_quality.assess_basic(image)
        assert report.issues
        assert report.score < 1.0


def test_score_is_bounded():
    rng = np.random.default_rng(2)
    for _ in range(5):
        image = rng.integers(0, 256, size=(240, 240, 3), dtype=np.uint8)
        report = image_quality.assess_basic(image)
        assert 0.0 <= report.score <= 1.0


def test_metrics_are_reported_for_tuning(noise_image):
    report = image_quality.assess_basic(noise_image)
    assert {"blur", "brightness", "contrast", "clipped_fraction"} <= set(report.metrics)


def test_pose_limits_come_from_settings():
    """Thresholds are configuration, not hardcoded policy."""
    from app.services.face_landmarks import FaceResult, HeadPose

    face = FaceResult(
        landmarks=np.zeros((478, 2), dtype=np.float32),
        bbox=(100, 100, 200, 240),
        pose=HeadPose(yaw=20.0, pitch=0.0, roll=0.0),
        face_count=1,
        image_shape=(480, 480),
    )
    base = image_quality.QualityReport(score=1.0)

    strict = image_quality.assess_with_face(
        np.full((480, 480, 3), 140, np.uint8),
        face,
        base,
        SETTINGS.model_copy(update={"max_yaw_degrees": 15.0}),
    )
    assert "HEAD_TURNED" in strict.issues

    loose = image_quality.assess_with_face(
        np.full((480, 480, 3), 140, np.uint8),
        face,
        base,
        SETTINGS.model_copy(update={"max_yaw_degrees": 30.0}),
    )
    assert "HEAD_TURNED" not in loose.issues
