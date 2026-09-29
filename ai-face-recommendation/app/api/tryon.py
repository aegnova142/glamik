"""POST /v1/tryon — PHASE 3.

Lipstick and blush are implemented; the route is gated behind `ENABLE_TRYON`
and returns `NOT_IMPLEMENTED` while that is false, the same discipline every
other phase-gated endpoint here follows.

Declared `def`, not `async def`: the body is CPU-bound (face parsing, OpenCV
compositing) and FastAPI runs `def` endpoints in a threadpool, which is where
that work belongs. Running it on the event loop would stall every other request
in the worker for the duration of a render.
"""

from __future__ import annotations

import json
from time import perf_counter

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import ValidationError

from app.config import API_PREFIX
from app.core.errors import AIServiceError, ErrorCode, retake_photo
from app.core.lifecycle import get_state
from app.core.logging import REQUESTS, get_logger, stage_timer
from app.core.security import require_internal_key
from app.schemas.tryon import (
    LAYER_ORDER,
    MAX_LAYERS,
    PHASE_3_SCOPE,
    TryOnRequest,
    TryOnResponse,
)
from app.services import face_landmarks, image_loader, image_quality, tryon_engine

logger = get_logger(__name__)

router = APIRouter(prefix=API_PREFIX, tags=["tryon"])


@router.post("/tryon", response_model=TryOnResponse, summary="Render makeup onto a face photo")
def tryon(
    request: Request,
    image: UploadFile = File(..., description="JPEG, PNG, WebP or HEIC."),
    layers: str = Form(
        ...,
        description=(
            "JSON array of makeup layers, e.g. "
            '[{"type":"lipstick","color_hex":"#b4004e","intensity":0.8,"finish":"gloss"}]'
        ),
    ),
    return_original: bool = Form(default=False),
    mirrored: bool = Form(default=False),
    _: None = Depends(require_internal_key),
) -> TryOnResponse:
    started = perf_counter()
    state = get_state(request)
    settings = state.settings

    if not settings.enable_tryon:
        REQUESTS.labels(endpoint="tryon", status="disabled").inc()
        raise AIServiceError(
            ErrorCode.NOT_IMPLEMENTED,
            "Virtual try-on is not enabled on this deployment.",
            extra={
                "phase": 3,
                "implemented": [str(layer) for layer in PHASE_3_SCOPE],
                "planned_layer_order": [str(layer) for layer in LAYER_ORDER],
                "max_layers": MAX_LAYERS,
            },
        )

    # --- parse the layer spec -------------------------------------------
    try:
        parsed_layers = json.loads(layers)
    except json.JSONDecodeError as exc:
        raise AIServiceError(
            ErrorCode.INVALID_REQUEST, "The 'layers' field is not valid JSON."
        ) from exc

    try:
        spec = TryOnRequest(
            layers=parsed_layers, return_original=return_original, mirrored=mirrored
        )
    except ValidationError as exc:
        # Field locations only — the submitted values are echoed back by
        # pydantic's default rendering and there is no reason to reflect them.
        raise AIServiceError(
            ErrorCode.INVALID_REQUEST,
            "The 'layers' field did not match the expected shape.",
            extra={"fields": [".".join(str(p) for p in e.get("loc", ())) for e in exc.errors()]},
        ) from exc

    # --- read the upload, bounded ---------------------------------------
    with stage_timer("upload_validation"):
        data = image.file.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            REQUESTS.labels(endpoint="tryon", status="too_large").inc()
            raise AIServiceError(
                ErrorCode.IMAGE_TOO_LARGE,
                f"Image is larger than the {settings.max_upload_mb} MB limit.",
            )

    # Face parsing is what produces the lip and skin regions, so try-on is as
    # dependent on it as analysis is. No parser means no render — not a render
    # based on a landmark polygon that would paint over teeth.
    if not state.models.face_parser.available or not state.models.face_landmarker.available:
        missing = [
            slot.describe()
            for slot in (state.models.face_landmarker, state.models.face_parser)
            if not slot.available
        ]
        REQUESTS.labels(endpoint="tryon", status="model_not_configured").inc()
        raise AIServiceError(
            ErrorCode.MODEL_NOT_CONFIGURED,
            "Virtual try-on is unavailable on this deployment because required models "
            "are not configured.",
            extra={"missing_models": missing},
        )

    with stage_timer("image_decode"):
        loaded = image_loader.load_image(
            data, settings, content_type=image.content_type, mirrored=spec.mirrored
        )
    with stage_timer("resize"):
        working = image_loader.resize_for_analysis(loaded.bgr, settings.tryon_max_dimension)

    # A lighter gate than analysis uses. Try-on is not a measurement, so a
    # photo that is too uneven to *measure* may still be perfectly fine to
    # render makeup onto; only gross problems that would break landmarking are
    # worth rejecting here.
    with stage_timer("quality_gate"):
        basic = image_quality.assess_basic(working)
    blocking = {"BLURRY", "LOW_LIGHT"} & set(basic.issues)
    if blocking:
        REQUESTS.labels(endpoint="tryon", status="retake").inc()
        raise retake_photo("Please use a sharper, better-lit photo for try-on.", sorted(blocking))

    with stage_timer("face_landmarks"):
        face = face_landmarks.detect_face(working, state.models)

    response = tryon_engine.apply_makeup(working, spec, face, state.models)
    response.duration_ms = round((perf_counter() - started) * 1000, 1)

    REQUESTS.labels(endpoint="tryon", status="ok").inc()
    # `data`, `loaded` and `working` fall out of scope here. No image — input,
    # intermediate or rendered — was written to disk at any point.
    return response
