"""Image ingestion: bytes in, an sRGB BGR NumPy array out.

Pillow is used **only** as an input loader — HEIC decoding, EXIF orientation
and ICC-to-sRGB conversion, all of which OpenCV does not do. The moment the
pixels are correct, everything hands off to OpenCV/NumPy.

Fast path (JPEG/PNG with no ICC profile and no rotation) skips Pillow entirely
and goes straight through cv2.imdecode, which is markedly quicker.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageCms, ImageFile, ImageOps, UnidentifiedImageError

from app.config import Settings
from app.core.errors import AIServiceError, ErrorCode

# A truncated upload must fail, not be silently padded with grey — padding
# would corrupt every measurement taken from it.
ImageFile.LOAD_TRUNCATED_IMAGES = False

# Registered once at import; without it Pillow cannot open HEIC at all.
try:  # pragma: no cover - depends on the wheel being present
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_AVAILABLE = True
except Exception:  # noqa: BLE001
    HEIF_AVAILABLE = False


ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

# Magic bytes. The Content-Type header is attacker-controlled, so format is
# decided from the actual file contents.
_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
]


@dataclass
class LoadedImage:
    bgr: np.ndarray
    source_format: str
    original_size: tuple[int, int]  # (w, h) before any resize
    used_pillow: bool
    exif_transposed: bool
    icc_converted: bool
    unmirrored: bool


def _sniff_format(data: bytes) -> str | None:
    for prefix, name in _MAGIC:
        if data.startswith(prefix):
            return name
    if len(data) >= 12:
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "WEBP"
        # ISO-BMFF container: 'ftyp' at offset 4, HEIC/AVIF brands follow.
        if data[4:8] == b"ftyp":
            brand = data[8:12]
            if brand in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
                return "HEIC"
    return None


def _needs_pillow(data: bytes, fmt: str) -> bool:
    """Whether this image needs Pillow's slower, correcter path.

    HEIC always does. JPEG does when it carries EXIF orientation or an ICC
    profile, because cv2.imdecode ignores both and would silently produce a
    rotated or wrongly-coloured image — fatal for colour analysis.
    """
    if fmt in {"HEIC", "WEBP"}:
        return True
    if fmt == "JPEG":
        # Cheap scan of the first 64 KB for the relevant APP segments.
        head = data[:65536]
        return b"Exif\x00\x00" in head or b"ICC_PROFILE" in head
    if fmt == "PNG":
        return b"iCCP" in data[:65536]
    return False


def _to_srgb(image: Image.Image) -> tuple[Image.Image, bool]:
    """Convert an embedded ICC profile to sRGB.

    A photo tagged Display P3 (every recent iPhone) has materially different
    RGB numbers for the same real-world colour. Ignoring the profile shifts
    measured skin tone, so it is converted rather than assumed.
    """
    profile = image.info.get("icc_profile")
    if not profile:
        return image, False
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(profile))
        target = ImageCms.createProfile("sRGB")
        converted = ImageCms.profileToProfile(image, source, target, outputMode="RGB")
        return (converted or image), converted is not None
    except Exception:  # noqa: BLE001 - a broken profile must not fail the upload
        return image, False


def load_image(
    data: bytes,
    settings: Settings,
    *,
    content_type: str | None = None,
    mirrored: bool = False,
) -> LoadedImage:
    """Decode upload bytes safely, or raise AIServiceError.

    `mirrored=True` marks a front-camera capture: browsers show a mirrored
    preview, and analysing the mirrored frame would flip every left/right
    region. It is un-mirrored here, before anything measures it.
    """
    if not data:
        raise AIServiceError(ErrorCode.IMAGE_INVALID, "The uploaded file is empty.")

    if len(data) > settings.max_upload_bytes:
        raise AIServiceError(
            ErrorCode.IMAGE_TOO_LARGE,
            f"Image is larger than the {settings.max_upload_mb} MB limit.",
        )

    declared = (content_type or "").split(";")[0].strip().lower()
    if declared and declared not in ALLOWED_CONTENT_TYPES:
        raise AIServiceError(
            ErrorCode.IMAGE_INVALID,
            "Unsupported image type. Upload a JPEG, PNG, WebP or HEIC.",
        )

    fmt = _sniff_format(data)
    if fmt is None:
        raise AIServiceError(
            ErrorCode.IMAGE_INVALID,
            "This file is not a supported image. Upload a JPEG, PNG, WebP or HEIC.",
        )
    if fmt == "HEIC" and not HEIF_AVAILABLE:
        raise AIServiceError(
            ErrorCode.IMAGE_INVALID,
            "HEIC images are not supported by this deployment. Upload a JPEG or PNG.",
        )

    # Header-only probe, on EVERY path. `Image.open` parses the header without
    # decoding pixels, so this is nearly free — and it means the pixel guard
    # runs before any allocation, including on the cv2 fast path below, where
    # `imdecode` would otherwise allocate the whole bomb first and only then be
    # asked whether it was allowed to.
    try:
        with Image.open(io.BytesIO(data)) as probe:
            _guard_pixels(probe.size[0], probe.size[1], settings)
    except AIServiceError:
        raise
    except Image.DecompressionBombError as exc:
        # Pillow has its own ceiling. Ours is tighter, so this only fires for
        # something enormous — but it must surface as "too large", not as an
        # unhandled error that becomes a generic 500.
        raise AIServiceError(
            ErrorCode.IMAGE_TOO_LARGE, "Image resolution is too large to process safely."
        ) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AIServiceError(
            ErrorCode.IMAGE_INVALID, "The image could not be decoded. It may be corrupted."
        ) from exc

    exif_transposed = False
    icc_converted = False
    used_pillow = _needs_pillow(data, fmt)

    if used_pillow:
        try:
            image: Image.Image = Image.open(io.BytesIO(data))
            before = image.size
            # Applies EXIF orientation and drops the tag, so downstream code
            # never has to think about it again.
            image = ImageOps.exif_transpose(image) or image
            exif_transposed = image.size != before or "exif" in image.info

            image, icc_converted = _to_srgb(image)
            if image.mode != "RGB":
                image = image.convert("RGB")

            rgb = np.asarray(image, dtype=np.uint8)
            original_size = (image.size[0], image.size[1])
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except AIServiceError:
            raise
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise AIServiceError(
                ErrorCode.IMAGE_INVALID, "The image could not be decoded. It may be corrupted."
            ) from exc
    else:
        # Fast path: OpenCV decodes JPEG/PNG considerably faster than Pillow.
        buffer = np.frombuffer(data, dtype=np.uint8)
        bgr = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
        if bgr is None:
            raise AIServiceError(
                ErrorCode.IMAGE_INVALID, "The image could not be decoded. It may be corrupted."
            )
        _guard_pixels(bgr.shape[1], bgr.shape[0], settings)
        original_size = (bgr.shape[1], bgr.shape[0])

    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise AIServiceError(ErrorCode.IMAGE_INVALID, "Unexpected image channel layout.")

    unmirrored = False
    if mirrored:
        bgr = cv2.flip(bgr, 1)
        unmirrored = True

    return LoadedImage(
        bgr=bgr,
        source_format=fmt,
        original_size=original_size,
        used_pillow=used_pillow,
        exif_transposed=exif_transposed,
        icc_converted=icc_converted,
        unmirrored=unmirrored,
    )


def _guard_pixels(width: int, height: int, settings: Settings) -> None:
    if width <= 0 or height <= 0:
        raise AIServiceError(ErrorCode.IMAGE_INVALID, "The image has no usable dimensions.")
    if width * height > settings.max_decoded_pixels:
        # A few-KB file can declare a gigapixel canvas; refuse before allocating.
        raise AIServiceError(
            ErrorCode.IMAGE_TOO_LARGE,
            "Image resolution is too large to process safely.",
        )


def resize_for_analysis(image: np.ndarray, max_side: int) -> np.ndarray:
    """Downscale early so every later stage works on a small image.

    INTER_AREA is the correct choice for downscaling — it averages the source
    pixels rather than sampling them, which preserves the mean colour that
    skin-tone estimation depends on. Never upscales: that would invent detail.
    """
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return image
    scale = max_side / float(longest)
    return cv2.resize(
        image,
        (max(1, round(width * scale)), max(1, round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
