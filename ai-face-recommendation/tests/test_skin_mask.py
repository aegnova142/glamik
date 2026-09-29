"""The skin mask — where it comes from, and what it must exclude.

The central rule: the mask is produced by face parsing. A landmark convex hull
is not an acceptable substitute, and when no parser is configured the service
refuses rather than falling back to geometry.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.core.errors import AIServiceError, ErrorCode
from app.models.registry import ModelRegistry
from app.services import face_parser, skin_mask
from app.services.face_landmarks import FaceResult, HeadPose


def _face() -> FaceResult:
    points = np.zeros((478, 2), dtype=np.float32)
    rng = np.random.default_rng(1)
    points[:] = rng.uniform(80, 240, size=(478, 2))
    return FaceResult(
        landmarks=points,
        bbox=(80, 80, 160, 160),
        pose=HeadPose(0.0, 0.0, 0.0),
        face_count=1,
        image_shape=(320, 320),
    )


def test_missing_parser_raises_model_not_configured(noise_image):
    """No parser means no analysis. There is deliberately no fallback."""
    with pytest.raises(AIServiceError) as exc:
        face_parser.parse_face(noise_image, ModelRegistry())
    assert exc.value.code is ErrorCode.MODEL_NOT_CONFIGURED


def test_skin_mask_refuses_without_a_parser(noise_image):
    with pytest.raises(AIServiceError) as exc:
        skin_mask.build_skin_mask(noise_image, _face(), ModelRegistry())
    assert exc.value.code is ErrorCode.MODEL_NOT_CONFIGURED


def test_every_non_skin_class_is_excluded():
    """Hair, brows, eyes, glasses, lips, neck and clothing are all darker or
    differently coloured than skin. Any of them inside the mask biases the
    measured tone, and does so worse for some hairstyles than others."""
    expected = {
        0,  # background
        2,
        3,  # brows
        4,
        5,  # eyes
        6,  # eyeglasses
        7,
        8,
        9,  # ears, earring
        11,
        12,
        13,  # mouth, lips
        14,
        15,  # neck, necklace
        16,  # clothing
        17,  # hair
        18,  # hat
    }
    assert frozenset(expected) == face_parser.EXCLUDED_CLASSES
    assert face_parser.CLASS_SKIN not in face_parser.EXCLUDED_CLASSES


def test_nose_is_kept_but_is_not_the_skin_class():
    # Nose is skin, but is sampled separately because specular highlight
    # concentrates there; it must not be in the exclusion set.
    assert face_parser.CLASS_NOSE not in face_parser.EXCLUDED_CLASSES


def test_colour_outlier_rejection_removes_contamination():
    """A dark strand crossing the cheek must not survive into the sample."""
    image = np.zeros((200, 200, 3), dtype=np.uint8)
    image[:, :] = (150, 165, 190)  # skin
    image[90:100, :] = (20, 22, 28)  # a dark band, e.g. hair

    mask = np.full((200, 200), 255, dtype=np.uint8)
    refined = skin_mask._reject_colour_outliers(image, mask)

    dark_before = int(np.count_nonzero(mask[90:100]))
    dark_after = int(np.count_nonzero(refined[90:100]))
    assert dark_after < dark_before * 0.5


def test_outlier_rejection_keeps_ordinary_skin_variation():
    """It must not be so aggressive that normal skin is thrown away."""
    rng = np.random.default_rng(4)
    image = np.clip(
        np.full((200, 200, 3), (150, 165, 190), dtype=np.int16)
        + rng.integers(-8, 9, (200, 200, 3)),
        0,
        255,
    ).astype(np.uint8)

    mask = np.full((200, 200), 255, dtype=np.uint8)
    refined = skin_mask._reject_colour_outliers(image, mask)
    assert np.count_nonzero(refined) > 0.8 * np.count_nonzero(mask)


def test_outlier_rejection_is_a_no_op_on_a_tiny_sample():
    image = np.full((200, 200, 3), (150, 165, 190), dtype=np.uint8)
    mask = np.zeros((200, 200), dtype=np.uint8)
    mask[:5, :5] = 255  # 25 pixels
    assert np.array_equal(skin_mask._reject_colour_outliers(image, mask), mask)


def test_minimum_sample_size_is_enforced():
    """Below a few hundred pixels a median carries no information."""
    assert skin_mask.MIN_SKIN_PIXELS >= 100
