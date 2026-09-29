"""Image helpers that are not part of loading or colour maths.

Decoding, EXIF/ICC handling and resizing live in `services/image_loader.py`;
this module holds the small pure helpers used across stages.
"""

from __future__ import annotations

import hashlib

import numpy as np


def image_sha256(data: bytes) -> str:
    """Content hash used as the cache identity.

    Derived from the upload bytes alone and never from user identity, so the
    cache cannot become a per-person record of who submitted what.
    """
    return hashlib.sha256(data).hexdigest()


def crop_with_padding(
    image: np.ndarray, bbox: tuple[int, int, int, int], pad_ratio: float = 0.08
) -> np.ndarray:
    """Crop a bounding box with a little context, clamped to the image."""
    x, y, w, h = bbox
    pad_x, pad_y = int(w * pad_ratio), int(h * pad_ratio)
    ih, iw = image.shape[:2]
    x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
    x1, y1 = min(iw, x + w + pad_x), min(ih, y + h + pad_y)
    crop = image[y0:y1, x0:x1]
    return crop if crop.size else image
