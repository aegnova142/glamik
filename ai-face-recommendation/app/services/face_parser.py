"""BiSeNet face parsing — the primary source of the skin mask.

This is REQUIRED, not optional. A landmark polygon (convex hull of the face
oval) is explicitly **not** an acceptable substitute: it cannot exclude a
fringe falling across the forehead, spectacle frames, a stray hair strand, or
the shadow under a chin. Every one of those is darker than skin, and including
them biases the measured tone systematically darker — silently, and worse for
some hairstyles and face shapes than others.

So when the model is absent the service returns MODEL_NOT_CONFIGURED rather
than falling back to geometry.

Landmarks are still used, but only to *refine* the parsed mask (restricting
sampling to stable regions), never to produce it.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
import structlog

from app.core.errors import AIServiceError, ErrorCode
from app.core.logging import inference_timer
from app.models.registry import ModelRegistry

logger = structlog.get_logger(__name__)

# CelebAMask-HQ class indices, the labelling almost every public BiSeNet
# face-parsing checkpoint uses.
CLASS_BACKGROUND = 0
CLASS_SKIN = 1
CLASS_NOSE = 10

# Everything that is not skin and must never contribute a pixel to a colour
# measurement.
EXCLUDED_CLASSES = frozenset(
    {
        0,   # background
        2,   # left eyebrow
        3,   # right eyebrow
        4,   # left eye
        5,   # right eye
        6,   # eyeglasses
        7,   # left ear
        8,   # right ear
        9,   # earring
        11,  # mouth interior / teeth
        12,  # upper lip
        13,  # lower lip
        14,  # neck
        15,  # necklace
        16,  # clothing
        17,  # hair
        18,  # hat
    }
)  # fmt: skip

DEFAULT_INPUT_SIZE = 512
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@dataclass
class ParseResult:
    skin_mask: np.ndarray  # uint8 0/255
    class_map: np.ndarray  # uint8 per-pixel class ids, at original resolution
    skin_pixels: int


def _input_size(session) -> tuple[int, int]:
    """Resolve the model's expected HxW, tolerating symbolic dimensions."""
    shape = session.get_inputs()[0].shape
    height = shape[2] if isinstance(shape[2], int) else DEFAULT_INPUT_SIZE
    width = shape[3] if isinstance(shape[3], int) else DEFAULT_INPUT_SIZE
    return int(height), int(width)


def parse_face(image_bgr: np.ndarray, registry: ModelRegistry) -> ParseResult:
    """Segment the face, or raise MODEL_NOT_CONFIGURED / MODEL_UNAVAILABLE."""
    slot = registry.face_parser

    if not slot.available:
        raise AIServiceError(
            ErrorCode.MODEL_NOT_CONFIGURED,
            "Face parsing is required for skin analysis, and no face-parsing model is "
            "configured on this deployment.",
            extra={"model": slot.describe()},
        )

    session = slot.handle
    in_h, in_w = _input_size(session)

    resized = cv2.resize(image_bgr, (in_w, in_h), interpolation=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rgb = (rgb - _IMAGENET_MEAN) / _IMAGENET_STD
    tensor = np.ascontiguousarray(np.transpose(rgb, (2, 0, 1))[None, ...], dtype=np.float32)

    try:
        with inference_timer("face_parser"):
            output = session.run(None, {session.get_inputs()[0].name: tensor})[0]
    except Exception as exc:
        logger.error("face_parsing_failed", error=str(exc))
        raise AIServiceError(
            ErrorCode.MODEL_UNAVAILABLE,
            "Face parsing failed while processing this image.",
        ) from exc

    # (1, C, H, W) logits -> per-pixel class ids
    class_map_small = np.argmax(output[0], axis=0).astype(np.uint8)

    skin_small = (class_map_small == CLASS_SKIN).astype(np.uint8) * 255
    for cls in EXCLUDED_CLASSES:
        skin_small[class_map_small == cls] = 0

    h, w = image_bgr.shape[:2]
    # NEAREST, because interpolating class labels would invent boundary values
    # that correspond to no class at all.
    skin_mask = cv2.resize(skin_small, (w, h), interpolation=cv2.INTER_NEAREST)
    class_map = cv2.resize(class_map_small, (w, h), interpolation=cv2.INTER_NEAREST)

    # Erode slightly: segmentation boundaries are soft, and a one-pixel halo of
    # hair or lip colour around the edge is exactly the contamination this
    # whole module exists to prevent.
    skin_mask = cv2.erode(skin_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

    return ParseResult(
        skin_mask=skin_mask,
        class_map=class_map,
        skin_pixels=int(np.count_nonzero(skin_mask)),
    )
