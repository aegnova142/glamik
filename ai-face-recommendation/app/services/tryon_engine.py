"""Virtual makeup try-on — PHASE 3.

Lipstick and blush. Both are rendered the same way, and the way is the whole
point:

**Colour is applied in CIELAB by modifying a\\* and b\\* while leaving L\\*
completely untouched.** L* carries the skin's own luminance — its shading, its
pores, the specular roll-off across a lip. Replacing it is precisely what makes
cheap try-on look like a flat sticker pasted onto a face. Shifting only the two
chroma axes recolours the region while every bit of that structure survives.

**Every mask edge is feathered** by a radius proportional to face size, so the
same code looks right on a 400px thumbnail and a 2000px photo. A hard mask
boundary reads as fake instantly, no matter how good the colour is.

**The lip mask excludes the mouth interior.** It is built from the face
parser's upper-lip and lower-lip classes with the mouth-interior class
subtracted, not from the outer lip contour — a contour polygon paints straight
over teeth, and nothing about the result looks like lipstick.

**Gloss is a small localised specular highlight.** It lifts L* only where L* is
already in the top decile inside the lip region. A global lightness lift would
wash out the whole mouth instead of reading as shine.

Nothing here is persisted. The input image, the intermediate masks and the
rendered result all live in local variables for the duration of one call.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np

from app.core.errors import AIServiceError, ErrorCode
from app.core.logging import get_logger, stage_timer
from app.models.registry import ModelRegistry
from app.schemas.tryon import (
    LAYER_ORDER,
    PHASE_3_SCOPE,
    AppliedLayer,
    Finish,
    MakeupLayer,
    MakeupLayerType,
    TryOnRequest,
    TryOnResponse,
)
from app.services import face_parser
from app.services.face_landmarks import LEFT_CHEEK, RIGHT_CHEEK, FaceResult
from app.utils.color import bgr_to_lab_true, hex_to_lab, lab_true_to_bgr

logger = get_logger(__name__)

# CelebAMask-HQ classes, same labelling `face_parser` assumes throughout.
CLASS_SKIN = 1
CLASS_MOUTH_INTERIOR = 11  # teeth and inner mouth — never painted
CLASS_UPPER_LIP = 12
CLASS_LOWER_LIP = 13

# Feather radius as a fraction of face width, so softness scales with the
# subject rather than with the image resolution.
LIP_FEATHER_RATIO = 0.006
BLUSH_FEATHER_RATIO = 0.055

# Below this a "layer" has nothing to paint, and saying so is more useful than
# returning an unchanged image and calling it a try-on.
MIN_PAINTABLE_PIXELS = 40

# Maximum chroma shift at full strength. Tuned so full intensity reads as an
# opaque product rather than a tint, without clipping into impossible colours.
MAX_LIP_STRENGTH = 0.92
MAX_BLUSH_STRENGTH = 0.42

GLOSS_PERCENTILE = 90.0
GLOSS_MAX_L_LIFT = 20.0
MATTE_HIGHLIGHT_DAMPING = 0.35

# Gamut fitting: how hard to push chroma back so that recolouring does not
# change lightness. Each pass costs two colour-space conversions, so the
# iteration count is a direct latency/fidelity trade.
GAMUT_FIT_ITERATIONS = 6
GAMUT_CHROMA_STEP = 0.82
GAMUT_L_TOLERANCE = 1.0

JPEG_QUALITY = 92


@dataclass
class RenderedLayer:
    layer: MakeupLayer
    pixels: int
    mask_source: str


def _feather(mask: np.ndarray, sigma: float) -> np.ndarray:
    """uint8 mask -> float32 alpha in 0..1 with a soft edge."""
    alpha = mask.astype(np.float32) / 255.0
    if sigma > 0.3:
        alpha = cv2.GaussianBlur(alpha, (0, 0), sigma)
    return np.clip(alpha, 0.0, 1.0)


def _lip_mask(class_map: np.ndarray) -> np.ndarray:
    """Upper and lower lip, with the mouth interior removed.

    The subtraction is the reason this is built from segmentation rather than
    from the landmark lip contour: an open smile puts teeth inside that
    contour, and painting them is the single most obvious way a try-on gives
    itself away.
    """
    mask = np.zeros(class_map.shape, dtype=np.uint8)
    mask[(class_map == CLASS_UPPER_LIP) | (class_map == CLASS_LOWER_LIP)] = 255
    mask[class_map == CLASS_MOUTH_INTERIOR] = 0
    return mask


def _blush_mask(class_map: np.ndarray, face: FaceResult, shape: tuple[int, int]) -> np.ndarray:
    """Cheek region, intersected with parsed skin.

    Face parsing has no cheek class — cheeks are just skin. So the landmarks
    say *where* the cheek is and the parser says *what is actually skin there*,
    which is what keeps blush off a stray lock of hair or the rim of a pair of
    glasses crossing the cheekbone.
    """
    region = np.zeros(shape, dtype=np.uint8)
    for indices in (LEFT_CHEEK, RIGHT_CHEEK):
        points = face.points(indices)
        if len(points) >= 3:
            cv2.fillConvexPoly(region, cv2.convexHull(points.astype(np.int32)), (255,))
    skin = np.zeros(shape, dtype=np.uint8)
    skin[class_map == CLASS_SKIN] = 255
    return cv2.bitwise_and(region, skin)


def _composite(original: np.ndarray, modified: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Keep `modified` only where the layer actually painted.

    Converting to LAB and back is lossy at 8 bits — every pixel shifts by a
    unit or two. Without this, painting lips would nudge the colour of the
    entire photograph, and the drift would compound once per layer. Restoring
    untouched pixels byte-for-byte makes a layer's effect exactly as wide as
    its mask.
    """
    touched = (weight > 0.0)[..., None]
    return np.where(touched, modified, original)


def _apply_colour(
    bgr: np.ndarray, alpha: np.ndarray, target_lab: tuple[float, float, float], strength: float
) -> np.ndarray:
    """Recolour through a*/b* only. L* is never written.

    That single constraint is what preserves the shading and texture of the
    underlying skin, and it is why this reads as pigment sitting on a face
    rather than as a coloured shape drawn over one.
    """
    source = bgr_to_lab_true(bgr)
    original_lightness = source[..., 0].copy()
    weight = (alpha * strength).astype(np.float32)

    # A vivid lipstick red simply does not exist at skin lightness inside the
    # sRGB gamut. Blending straight to it and letting the 8-bit conversion clamp
    # is not neutral — measured across a lip the clamping darkens by ~2 L*,
    # which would make "we preserve L*" quietly untrue for exactly the bold
    # shades people most want to try.
    #
    # So: pull chroma back, and only on the pixels that actually need it, until
    # the colour is representable at the lightness it started with. Slightly
    # less saturation on those pixels is the honest trade — the alternative is
    # a lip that renders darker than the face it belongs to.
    scale = np.ones_like(weight)
    painted = bgr
    for _ in range(GAMUT_FIT_ITERATIONS):
        adjusted = weight * scale
        lab = source.copy()
        lab[..., 1] = source[..., 1] * (1.0 - adjusted) + target_lab[1] * adjusted
        lab[..., 2] = source[..., 2] * (1.0 - adjusted) + target_lab[2] * adjusted
        painted = lab_true_to_bgr(lab)

        drift = np.abs(bgr_to_lab_true(painted)[..., 0] - original_lightness)
        out_of_gamut = (drift > GAMUT_L_TOLERANCE) & (adjusted > 0.0)
        if not out_of_gamut.any():
            break
        scale = np.where(out_of_gamut, scale * GAMUT_CHROMA_STEP, scale)

    return _composite(bgr, painted, weight)


def _apply_finish(bgr: np.ndarray, alpha: np.ndarray, finish: Finish) -> np.ndarray:
    """Gloss and matte act on L*, and only inside the painted region."""
    region = alpha > 0.5
    if finish is Finish.SATIN or not region.any():
        return bgr

    lab = bgr_to_lab_true(bgr)
    lightness = lab[..., 0]

    if finish is Finish.GLOSS:
        # Only pixels already among the brightest in the region are lifted, so
        # the result is a highlight where light genuinely falls, not a wash.
        threshold = float(np.percentile(lightness[region], GLOSS_PERCENTILE))
        # Normalised against the region's OWN spread above the threshold, not
        # against absolute lightness. A lip photographed dark has a small
        # absolute range but the same relative structure, and dividing by
        # `100 - threshold` would make gloss silently vanish on exactly those
        # photos while working fine on bright ones.
        peak = float(lightness[region].max())
        headroom = max(1e-3, peak - threshold)
        highlight = np.clip((lightness - threshold) / headroom, 0.0, 1.0) * alpha
        highlight = cv2.GaussianBlur(highlight, (0, 0), 1.5)
        lab[..., 0] = np.clip(lightness + highlight * GLOSS_MAX_L_LIFT, 0.0, 100.0)
        weight = highlight
    else:  # matte: pull the existing sheen down rather than flattening the lot
        median = float(np.median(lightness[region]))
        excess = np.clip(lightness - median, 0.0, None) * alpha
        lab[..., 0] = np.clip(lightness - excess * MATTE_HIGHLIGHT_DAMPING, 0.0, 100.0)
        weight = excess

    return _composite(bgr, lab_true_to_bgr(lab), weight)


def _render_layer(
    canvas: np.ndarray,
    layer: MakeupLayer,
    class_map: np.ndarray,
    face: FaceResult,
    face_width: int,
) -> tuple[np.ndarray, RenderedLayer | None]:
    shape = (int(canvas.shape[0]), int(canvas.shape[1]))

    if layer.type is MakeupLayerType.LIPSTICK:
        mask = _lip_mask(class_map)
        sigma = max(0.8, face_width * LIP_FEATHER_RATIO)
        max_strength = MAX_LIP_STRENGTH
        source = "face_parsing_lips_excluding_mouth_interior"
    elif layer.type is MakeupLayerType.BLUSH:
        mask = _blush_mask(class_map, face, shape)
        sigma = max(2.0, face_width * BLUSH_FEATHER_RATIO)
        max_strength = MAX_BLUSH_STRENGTH
        source = "cheek_landmarks_intersected_with_parsed_skin"
    else:  # pragma: no cover - the route rejects these before we get here
        raise AIServiceError(
            ErrorCode.NOT_IMPLEMENTED,
            f"Layer type '{layer.type}' is not implemented.",
        )

    pixels = int(np.count_nonzero(mask))
    if pixels < MIN_PAINTABLE_PIXELS:
        return canvas, None

    target_lab = hex_to_lab(layer.color_hex)
    if target_lab is None:
        raise AIServiceError(
            ErrorCode.INVALID_REQUEST,
            f"'{layer.color_hex}' is not a usable colour for the {layer.type} layer.",
        )

    alpha = _feather(mask, sigma)
    painted = _apply_colour(canvas, alpha, target_lab, layer.intensity * max_strength)
    painted = _apply_finish(painted, alpha, layer.finish)

    return painted, RenderedLayer(layer=layer, pixels=pixels, mask_source=source)


def _encode(bgr: np.ndarray) -> str:
    ok, buffer = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ok:
        raise AIServiceError(ErrorCode.TRYON_FAILED, "The rendered image could not be encoded.")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def apply_makeup(
    image_bgr: np.ndarray,
    request: TryOnRequest,
    face: FaceResult,
    registry: ModelRegistry,
) -> TryOnResponse:
    """Render the requested layers onto `image_bgr`.

    Raises rather than returning an unmodified image when it cannot do the job:
    an untouched photo returned as a success is indistinguishable from a try-on
    that ran and had no visible effect.
    """
    unsupported = sorted(
        {str(layer.type) for layer in request.layers if layer.type not in PHASE_3_SCOPE}
    )
    if unsupported:
        raise AIServiceError(
            ErrorCode.NOT_IMPLEMENTED,
            "These layer types are not implemented yet: " + ", ".join(unsupported) + ".",
            extra={
                "unsupported_layers": unsupported,
                "implemented": [str(t) for t in PHASE_3_SCOPE],
            },
        )

    with stage_timer("face_parsing"):
        parsed = face_parser.parse_face(image_bgr, registry)

    # Paint order is fixed by LAYER_ORDER, not by the order the caller listed
    # them: lipstick applied before blush would let a cheek layer bleed over
    # the mouth. The caller's ordering is not a rendering instruction.
    ordered = sorted(request.layers, key=lambda layer: LAYER_ORDER.index(layer.type))

    _, _, face_width, _ = face.bbox
    canvas = image_bgr.copy()
    rendered: list[RenderedLayer] = []
    notes: list[str] = []

    for layer in ordered:
        with stage_timer(f"tryon_{layer.type}"):
            canvas, result = _render_layer(canvas, layer, parsed.class_map, face, face_width)
        if result is None:
            notes.append(
                f"The {layer.type} layer was not applied: no {layer.type} region was "
                "visible in this photo."
            )
        else:
            rendered.append(result)

    if not rendered:
        # Every layer found nothing to paint. Returning the original here would
        # be a lie by omission dressed up as a 200.
        raise AIServiceError(
            ErrorCode.TRYON_FAILED,
            "None of the requested makeup could be applied to this photo. Try a "
            "clearer, front-facing picture with the face fully visible.",
            extra={"notes": notes},
        )

    response = TryOnResponse(
        image_base64=_encode(canvas),
        original_base64=_encode(image_bgr) if request.return_original else None,
        applied_layers=[
            AppliedLayer(
                type=item.layer.type,
                color_hex=item.layer.color_hex,
                intensity=item.layer.intensity,
                finish=item.layer.finish,
                product_id=item.layer.product_id,
                variant_id=item.layer.variant_id,
                pixels=item.pixels,
                mask_source=item.mask_source,
            )
            for item in rendered
        ],
        notes=notes,
    )

    logger.info(
        "tryon_complete",
        layers=[str(item.layer.type) for item in rendered],
        skipped=len(notes),
    )
    return response
