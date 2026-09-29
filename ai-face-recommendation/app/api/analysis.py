"""POST /v1/analyze.

The handler is `async` because it awaits Redis on both sides of the work, but
the analysis itself is CPU-bound (OpenCV, MediaPipe, ONNX) and is pushed to a
worker thread with `run_in_threadpool`. Running it inline would block the event
loop for the whole analysis and stall every other request in the worker.

The uploaded image is never written to disk, never logged, and never leaves
this function.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import API_PREFIX
from app.core.errors import AIServiceError, ErrorCode
from app.core.lifecycle import get_state
from app.core.logging import REQUESTS, get_logger, stage_timer
from app.core.security import require_internal_key
from app.schemas.analysis import AnalyzeResponse
from app.services.cache import build_cache_key
from app.services.pipeline import run_analysis
from app.utils.image import image_sha256

logger = get_logger(__name__)

router = APIRouter(prefix=API_PREFIX, tags=["analysis"])


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyse a face photo for skin tone and undertone",
)
async def analyze(
    request: Request,
    image: UploadFile = File(..., description="JPEG, PNG, WebP or HEIC."),
    mirrored: bool = Form(
        default=False,
        description=(
            "True for a selfie-camera capture. The frame is un-mirrored before "
            "analysis so left/right regions are not transposed."
        ),
    ),
    _: None = Depends(require_internal_key),
) -> AnalyzeResponse:
    state = get_state(request)
    settings = state.settings

    # Read with a hard ceiling. Reading first and checking the size afterwards
    # would mean an oversized upload had already been buffered in full.
    with stage_timer("upload_validation"):
        data = await image.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            REQUESTS.labels(endpoint="analyze", status="too_large").inc()
            raise AIServiceError(
                ErrorCode.IMAGE_TOO_LARGE,
                f"Image is larger than the {settings.max_upload_mb} MB limit.",
            )
        sha = image_sha256(data)

    # The key carries the model versions, so a model upgrade cannot serve a
    # result computed by the previous one.
    cache_key = build_cache_key(
        "analysis", sha, state.models.cache_signature(), {"mirrored": mirrored}
    )

    cached = await state.cache.get_json(cache_key)
    if cached is not None:
        REQUESTS.labels(endpoint="analyze", status="cache_hit").inc()
        response = AnalyzeResponse.model_validate(cached)
        # Flagged so the caller can tell a fresh measurement from a replay.
        response.pipeline.cached = True
        return response

    response = await run_in_threadpool(
        run_analysis,
        data,
        settings=settings,
        models=state.models,
        content_type=image.content_type,
        mirrored=mirrored,
        image_sha=sha,
    )

    # A cache write failure must never fail an analysis that already succeeded.
    await state.cache.set_json(cache_key, response.model_dump())

    REQUESTS.labels(endpoint="analyze", status="ok").inc()
    return response
