"""The Phase 1 analysis pipeline, as one synchronous function.

    validate -> decode -> resize -> quality gate -> landmarks -> face quality
             -> face parsing -> skin mask -> tone -> undertone -> concerns

Kept separate from the route so it can be tested without HTTP, and so the
route can stay `async` (for the Redis round-trips) while this whole body runs
in a worker thread. Every step here is CPU-bound; none of it may touch the
event loop.

The image exists only as a local variable. Nothing is written to disk, and no
pixel data is logged.
"""

from __future__ import annotations

from time import perf_counter

from app.config import Settings
from app.core.errors import AIServiceError, ErrorCode, retake_photo
from app.core.logging import get_logger, stage_timer
from app.models.registry import ModelRegistry
from app.schemas.analysis import (
    AnalysisBlock,
    AnalyzeResponse,
    Concerns,
    ModelVersions,
    Pipeline,
    Quality,
    SkinTone,
    Undertone,
)
from app.services import (
    face_landmarks,
    image_loader,
    image_quality,
    skin_concerns,
    skin_mask,
    skin_tone,
    undertone,
)

logger = get_logger(__name__)


def run_analysis(
    data: bytes,
    *,
    settings: Settings,
    models: ModelRegistry,
    content_type: str | None,
    mirrored: bool,
    image_sha: str,
) -> AnalyzeResponse:
    started = perf_counter()

    # Required models are checked before any work: producing a partial result
    # and calling it an analysis would be worse than refusing outright.
    if not models.ready:
        raise AIServiceError(
            ErrorCode.MODEL_NOT_CONFIGURED,
            "Skin analysis is unavailable on this deployment because required models "
            "are not configured. No estimate is produced rather than an unreliable one.",
            extra={"missing_models": [s.describe() for s in models.missing_required()]},
        )

    with stage_timer("image_decode"):
        loaded = image_loader.load_image(
            data, settings, content_type=content_type, mirrored=mirrored
        )

    with stage_timer("resize"):
        working = image_loader.resize_for_analysis(loaded.bgr, settings.max_image_dimension)

    # Cheap whole-image checks first, so an unusable photo never reaches a model.
    with stage_timer("quality_gate"):
        basic = image_quality.assess_basic(working)
    if not basic.acceptable:
        raise retake_photo(_retake_message(basic.issues), basic.issues)

    with stage_timer("face_landmarks"):
        face = face_landmarks.detect_face(working, models)

    with stage_timer("face_quality"):
        quality = image_quality.assess_with_face(working, face, basic, settings)
    if not quality.acceptable:
        raise retake_photo(_retake_message(quality.issues), quality.issues)

    # Segmentation-derived skin region. Raises MODEL_NOT_CONFIGURED if the
    # parser is missing; there is deliberately no geometric fallback.
    with stage_timer("face_parsing"):
        mask = skin_mask.build_skin_mask(working, face, models)

    with stage_timer("skin_tone"):
        tone = skin_tone.estimate_skin_tone(working, mask.mask)
    if tone is None:
        raise retake_photo(
            "Skin colour could not be measured reliably from this photo.",
            [*quality.issues, "TONE_UNMEASURABLE"],
        )

    # A tone below the confidence floor is not reported at a lower confidence —
    # it is not reported at all. A number on screen reads as a fact regardless
    # of the confidence printed beside it.
    if tone.confidence < settings.min_confidence:
        raise retake_photo(
            "The skin tone reading was not confident enough to report. Please retake "
            "the photo in even, natural light with no filter.",
            [*quality.issues, "LOW_CONFIDENCE"],
        )

    with stage_timer("undertone"):
        under = undertone.estimate_undertone(working, mask.mask, face)

    with stage_timer("skin_analysis"):
        concerns = skin_concerns.predict_concerns(working, face, models)

    response = AnalyzeResponse(
        model_version=ModelVersions(**models.versions()),
        analysis=AnalysisBlock(
            skin_tone=SkinTone(
                category=tone.category,
                label=tone.label,
                monk_scale=tone.monk_scale,
                ita=tone.ita,
                confidence=tone.confidence,
                lab=tone.lab,
            ),
            undertone=Undertone(
                value=under.value if under else "neutral",
                confidence=under.confidence if under else 0.0,
                notes=(
                    under.notes if under else ["Undertone could not be measured from this photo."]
                ),
            ),
            concerns=Concerns(
                available=concerns.available,
                scores=concerns.scores,
                reason=concerns.reason,
                notes=concerns.notes,
            ),
        ),
        quality=Quality(
            score=quality.score,
            issues=quality.issues,
            warnings=quality.warnings,
            metrics=quality.metrics,
        ),
        pipeline=Pipeline(
            skin_mask_source=mask.source,
            skin_pixels=mask.skin_pixels,
            face_coverage=mask.coverage,
            refined_by_landmarks=mask.refined_by_landmarks,
            image_sha256=image_sha,
            source_format=loaded.source_format,
            exif_transposed=loaded.exif_transposed,
            icc_converted=loaded.icc_converted,
            unmirrored=loaded.unmirrored,
            cached=False,
            duration_ms=round((perf_counter() - started) * 1000, 1),
        ),
    )

    logger.info(
        "analysis_complete",
        image_sha=image_sha[:12],
        duration_ms=response.pipeline.duration_ms,
        quality_score=quality.score,
        skin_pixels=mask.skin_pixels,
        tone=tone.category,
        undertone=response.analysis.undertone.value,
        concerns_available=concerns.available,
    )
    return response


def _retake_message(issues: list[str]) -> str:
    """Tell the user what to change, not merely that something was wrong."""
    hints = {
        "BLURRY": "hold the camera steady so the photo is sharp",
        "LOW_LIGHT": "move somewhere brighter",
        "OVEREXPOSED": "move out of direct light",
        "LOW_CONTRAST": "use more even lighting",
        "HARSH_LIGHTING": "avoid strong direct light and harsh shadows",
        "FACE_TOO_SMALL": "hold the camera closer so your face fills more of the frame",
        "HEAD_TURNED": "face the camera straight on",
        "HEAD_TILTED_VERTICALLY": "keep your chin level",
    }
    actions = [hints[i] for i in issues if i in hints]
    if not actions:
        return "Please retake the photo facing the camera in even, natural light."
    return "Please retake the photo: " + ", ".join(actions) + "."
