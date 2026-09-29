"""Try-on contract — PHASE 3.

Lipstick and blush are implemented. The remaining layer types are declared
here because the paint order has to be settled before any of them ships, but a
request for one is **rejected by name**, never silently dropped: a response
that quietly ignored a requested layer would be indistinguishable from one
where the layer was applied and simply didn't show.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class MakeupLayerType(StrEnum):
    FOUNDATION = "foundation"
    CONCEALER = "concealer"
    BLUSH = "blush"
    EYESHADOW = "eyeshadow"
    BROWS = "brows"
    LIPSTICK = "lipstick"


class Finish(StrEnum):
    MATTE = "matte"
    SATIN = "satin"
    GLOSS = "gloss"


# Paint order: later layers sit on top of earlier ones. Base coverage first,
# colour on top, exactly as it is applied on a real face.
LAYER_ORDER: list[MakeupLayerType] = [
    MakeupLayerType.FOUNDATION,
    MakeupLayerType.CONCEALER,
    MakeupLayerType.BLUSH,
    MakeupLayerType.EYESHADOW,
    MakeupLayerType.BROWS,
    MakeupLayerType.LIPSTICK,
]

MAX_LAYERS = 6

# What this phase actually renders. Anything else returns NOT_IMPLEMENTED.
PHASE_3_SCOPE = [MakeupLayerType.LIPSTICK, MakeupLayerType.BLUSH]


class MakeupLayer(BaseModel):
    type: MakeupLayerType
    color_hex: str = Field(pattern=r"^#(?:[0-9a-fA-F]{3}){1,2}$")
    intensity: float = Field(default=0.7, ge=0.0, le=1.0)
    finish: Finish = Finish.SATIN
    # Carried through to the response untouched, so the caller can tie a
    # rendered layer back to the catalog entry it came from. Never used to
    # look anything up — this service holds no catalog.
    product_id: str | None = None
    variant_id: str | None = None


class TryOnRequest(BaseModel):
    layers: list[MakeupLayer] = Field(min_length=1, max_length=MAX_LAYERS)
    return_original: bool = False
    mirrored: bool = False


class AppliedLayer(BaseModel):
    type: MakeupLayerType
    color_hex: str
    intensity: float
    finish: Finish
    product_id: str | None = None
    variant_id: str | None = None
    # Pixels actually painted. A caller can tell a layer that rendered from one
    # that found no region to render into — the latter is reported, not hidden.
    pixels: int
    mask_source: str


class TryOnResponse(BaseModel):
    success: bool = True
    image_base64: str
    mime_type: str = "image/jpeg"
    original_base64: str | None = None
    applied_layers: list[AppliedLayer] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    duration_ms: float | None = None
