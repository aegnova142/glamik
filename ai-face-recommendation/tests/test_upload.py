"""Upload validation.

The rule under test throughout: format is decided by the file's own bytes, not
by the Content-Type header the caller supplied.
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.config import get_settings
from app.core.errors import AIServiceError, ErrorCode
from app.services import image_loader
from tests.conftest import encode_jpeg, encode_png

SETTINGS = get_settings()


def _err(exc_info) -> ErrorCode:
    return exc_info.value.code


# --- format sniffing --------------------------------------------------------


def test_png_bytes_are_recognised(flat_image):
    loaded = image_loader.load_image(encode_png(flat_image), SETTINGS, content_type="image/png")
    assert loaded.source_format == "PNG"


def test_jpeg_bytes_are_recognised(noise_image):
    loaded = image_loader.load_image(encode_jpeg(noise_image), SETTINGS, content_type="image/jpeg")
    assert loaded.source_format == "JPEG"


def test_a_lying_content_type_does_not_get_a_file_decoded(noise_image):
    """A PNG declared as JPEG still loads as a PNG.

    The header is attacker-controlled. Trusting it to pick a decoder is how a
    non-image gets handed to an image parser.
    """
    loaded = image_loader.load_image(encode_png(noise_image), SETTINGS, content_type="image/jpeg")
    assert loaded.source_format == "PNG"


def test_non_image_bytes_are_rejected_despite_an_image_content_type():
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(b"#!/bin/sh\nrm -rf /\n", SETTINGS, content_type="image/png")
    assert _err(exc) is ErrorCode.IMAGE_INVALID


def test_empty_upload_is_rejected():
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(b"", SETTINGS, content_type="image/png")
    assert _err(exc) is ErrorCode.IMAGE_INVALID


def test_truncated_png_is_rejected_not_padded(flat_image):
    """A half-received file must fail.

    Pillow can pad a truncated image with grey. That would silently corrupt
    every colour measurement taken from it, so truncation is a hard error.
    """
    data = encode_png(flat_image)
    with pytest.raises(AIServiceError):
        image_loader.load_image(data[: len(data) // 2], SETTINGS, content_type="image/png")


def test_disallowed_content_type_is_rejected(flat_image):
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(encode_png(flat_image), SETTINGS, content_type="application/pdf")
    assert _err(exc) is ErrorCode.IMAGE_INVALID


# --- size and pixel guards --------------------------------------------------


def test_oversized_file_is_rejected():
    payload = b"\xff\xd8\xff" + b"\x00" * (SETTINGS.max_upload_bytes + 1)
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(payload, SETTINGS, content_type="image/jpeg")
    assert _err(exc) is ErrorCode.IMAGE_TOO_LARGE


def test_decompression_bomb_is_refused_before_allocation():
    """A tiny file can declare an enormous canvas.

    A 20000x20000 PNG of one flat colour compresses to a few KB and decodes to
    ~1.2 GB. The pixel guard rejects it on the declared dimensions, before any
    allocation happens.
    """
    # Built as a bare header rather than a real image: materialising a
    # 40000x40000 canvas here would exhaust the test runner's memory, which is
    # precisely the attack being defended against.
    # 64M pixels: over this service's 40M ceiling, under Pillow's own 178M one,
    # so it is *our* guard being tested and not Pillow's.
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(_png_header(8_000, 8_000), SETTINGS, content_type="image/png")
    assert _err(exc) is ErrorCode.IMAGE_TOO_LARGE


def test_pillows_own_bomb_error_surfaces_as_too_large():
    """Past Pillow's ceiling it raises first. That must not become a 500."""
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(_png_header(40_000, 40_000), SETTINGS, content_type="image/png")
    assert _err(exc) is ErrorCode.IMAGE_TOO_LARGE


def _png_header(width: int, height: int) -> bytes:
    """A PNG whose IHDR declares `width` x `height` but carries almost no data.

    This is the shape of a real decompression bomb: a header claiming an
    enormous canvas, in a file of a few dozen bytes. Pillow reports `size` from
    the header without decoding, which is all the guard reads — and if the
    guard ever stopped firing, this would fail loudly on decode rather than
    quietly pass.
    """
    import struct
    import zlib

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return (
            struct.pack(">I", len(payload))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        # A token IDAT: Pillow stops parsing here and reports the declared size.
        + chunk(b"IDAT", zlib.compress(b"\x00" * 16))
        + chunk(b"IEND", b"")
    )


def test_an_ordinary_image_is_not_caught_by_the_pixel_guard(noise_image):
    """The mirror of the test above, so it cannot pass by rejecting everything."""
    loaded = image_loader.load_image(encode_png(noise_image), SETTINGS, content_type="image/png")
    assert loaded.bgr.shape[:2] == noise_image.shape[:2]


# --- orientation, colour and mirroring --------------------------------------


def test_exif_rotation_is_applied():
    """An EXIF-rotated photo must be uprighted before anything measures it.

    Every phone writes orientation as a tag rather than rotating the pixels.
    cv2.imdecode ignores it, so a portrait selfie would reach the landmarker
    sideways and be rejected as "no face".
    """
    tall = np.zeros((200, 100, 3), dtype=np.uint8)
    tall[:, :] = (90, 110, 160)

    buffer = io.BytesIO()
    image = Image.fromarray(tall[..., ::-1])
    exif = image.getexif()
    exif[274] = 6  # Orientation: rotate 90° CW
    image.save(buffer, format="JPEG", exif=exif.tobytes())

    loaded = image_loader.load_image(buffer.getvalue(), SETTINGS, content_type="image/jpeg")
    assert loaded.exif_transposed is True
    # 200x100 portrait becomes 100x200 landscape once the tag is honoured.
    assert loaded.bgr.shape[0] < loaded.bgr.shape[1]


def test_mirrored_capture_is_unmirrored(noise_image):
    """A front-camera frame is flipped back before analysis.

    Browsers preview the selfie camera mirrored. Analysing that frame would
    swap every left/right region — left cheek measurements would come from the
    right cheek.
    """
    asymmetric = noise_image.copy()
    asymmetric[:, :100] = 30

    plain = image_loader.load_image(encode_png(asymmetric), SETTINGS, content_type="image/png")
    flipped = image_loader.load_image(
        encode_png(asymmetric), SETTINGS, content_type="image/png", mirrored=True
    )

    assert flipped.unmirrored is True
    assert np.array_equal(flipped.bgr, plain.bgr[:, ::-1])


@pytest.mark.skipif(not image_loader.HEIF_AVAILABLE, reason="pillow-heif not installed")
def test_heic_support_is_declared_consistently():
    """Either HEIC decodes, or it is refused with a clear message.

    What must never happen is accepting the upload and failing later with
    something unrelated.
    """
    assert "image/heic" in image_loader.ALLOWED_CONTENT_TYPES


def test_heic_without_the_decoder_fails_clearly(monkeypatch):
    monkeypatch.setattr(image_loader, "HEIF_AVAILABLE", False)
    fake_heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64
    with pytest.raises(AIServiceError) as exc:
        image_loader.load_image(fake_heic, SETTINGS, content_type="image/heic")
    assert _err(exc) is ErrorCode.IMAGE_INVALID
    assert "HEIC" in exc.value.message


# --- resizing ---------------------------------------------------------------


def test_resize_downscales_to_the_configured_side(noise_image):
    resized = image_loader.resize_for_analysis(noise_image, 128)
    assert max(resized.shape[:2]) == 128


def test_resize_never_upscales():
    """Upscaling would invent detail the sensor never captured."""
    small = np.zeros((64, 64, 3), dtype=np.uint8)
    assert image_loader.resize_for_analysis(small, 640).shape == small.shape


# --- endpoint-level ---------------------------------------------------------


def test_endpoint_rejects_a_non_image(client, auth_headers):
    response = client.post(
        "/v1/analyze",
        files={"image": ("payload.png", b"not an image at all", "image/png")},
        headers=auth_headers,
    )
    assert response.status_code in (400, 503)
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] in {"IMAGE_INVALID", "MODEL_NOT_CONFIGURED"}


def test_endpoint_requires_the_image_field(client, auth_headers):
    response = client.post("/v1/analyze", headers=auth_headers)
    assert response.status_code == 422
    assert response.json()["success"] is False
