"""Skin-concern inference (acne, pigmentation, oiliness, dryness, wrinkles).

No concern model ships with this repository. That is handled explicitly: when
the model is absent this returns `available=False` with a MODEL_NOT_CONFIGURED
reason, and the analysis response carries nulls rather than numbers.

It would be trivial to emit plausible-looking scores from simple image
statistics. That is deliberately not done — a fabricated 0.71 "pigmentation"
reads to a customer exactly like a measured one, and would be used to sell
them something. Absent means absent.

The full inference path is implemented so that dropping a trained ONNX model
into models/skin/ is the only step needed to switch it on.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.core.logging import get_logger, inference_timer
from app.models.registry import ModelRegistry, ModelStatus
from app.services.face_landmarks import FaceResult

logger = get_logger(__name__)

CONCERN_LABELS = ["acne", "pigmentation", "oiliness", "dryness", "wrinkles"]
INPUT_SIZE = 224


@dataclass
class ConcernResult:
    available: bool
    scores: dict[str, float] | None = None
    reason: str | None = None
    model_status: str = str(ModelStatus.NOT_CONFIGURED)
    notes: list[str] = field(default_factory=list)


def _crop_face(image_bgr: np.ndarray, face: FaceResult) -> np.ndarray:
    x, y, w, h = face.bbox
    pad_x, pad_y = int(w * 0.08), int(h * 0.08)
    ih, iw = image_bgr.shape[:2]
    x0, y0 = max(0, x - pad_x), max(0, y - pad_y)
    x1, y1 = min(iw, x + w + pad_x), min(ih, y + h + pad_y)
    crop = image_bgr[y0:y1, x0:x1]
    if crop.size == 0:
        crop = image_bgr
    return cv2.resize(crop, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_AREA)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def predict_concerns(
    image_bgr: np.ndarray, face: FaceResult, registry: ModelRegistry
) -> ConcernResult:
    slot = registry.skin_concerns

    if not slot.available:
        return ConcernResult(
            available=False,
            reason="MODEL_NOT_CONFIGURED",
            model_status=str(slot.status),
            notes=[
                slot.detail,
                "Concern scores are withheld rather than estimated, so no value here "
                "can be mistaken for a measurement.",
            ],
        )

    try:
        crop = _crop_face(image_bgr, face)
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        rgb = (rgb - np.array([0.485, 0.456, 0.406], np.float32)) / np.array(
            [0.229, 0.224, 0.225], np.float32
        )
        tensor = np.transpose(rgb, (2, 0, 1))[None, ...].astype(np.float32)

        session = slot.handle
        with inference_timer("skin_model"):
            logits = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]

        # Multi-label: each concern is independent, so sigmoid per output
        # rather than a softmax across them.
        probs = _sigmoid(np.asarray(logits, dtype=np.float32))
        count = min(len(CONCERN_LABELS), len(probs))
        scores = {
            CONCERN_LABELS[i]: round(float(np.clip(probs[i], 0.0, 1.0)), 2) for i in range(count)
        }
        if count < len(CONCERN_LABELS):
            return ConcernResult(
                available=False,
                reason="MODEL_OUTPUT_MISMATCH",
                model_status=str(slot.status),
                notes=[
                    f"Model returned {len(probs)} outputs but "
                    f"{len(CONCERN_LABELS)} concerns are expected."
                ],
            )

        return ConcernResult(
            available=True,
            scores=scores,
            model_status=str(slot.status),
            notes=["Cosmetic analysis signals only — not a medical assessment."],
        )
    except Exception as exc:
        logger.error("Skin concern inference failed", exc_info=True)
        return ConcernResult(
            available=False,
            reason="INFERENCE_FAILED",
            model_status=str(slot.status),
            notes=[f"Concern model failed at inference time: {exc}"],
        )


def infer_skin_type(
    tone_lab: dict[str, float], concerns: ConcernResult
) -> tuple[str | None, float, list[str]]:
    """Derive a coarse skin type from concern scores.

    Only possible when the concern model is available — oiliness and dryness
    are exactly what distinguishes the types. Without it, returns None rather
    than guessing.
    """
    if not concerns.available or not concerns.scores:
        return None, 0.0, ["Skin type requires the skin-concern model, which is not configured."]

    oily = concerns.scores.get("oiliness", 0.0)
    dry = concerns.scores.get("dryness", 0.0)

    if oily >= 0.6 and dry < 0.4:
        value, confidence = "oily", 0.6 + 0.3 * (oily - 0.6) / 0.4
    elif dry >= 0.6 and oily < 0.4:
        value, confidence = "dry", 0.6 + 0.3 * (dry - 0.6) / 0.4
    elif oily >= 0.4 and dry >= 0.4:
        value, confidence = "combination", 0.55 + 0.2 * min(oily, dry)
    else:
        value, confidence = "normal", 0.5 + 0.2 * (1.0 - max(oily, dry))

    return value, round(min(0.95, confidence), 2), []
