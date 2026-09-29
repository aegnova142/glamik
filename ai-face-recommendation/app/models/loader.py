"""Loads every model once, during application startup.

Execution providers are negotiated in preference order and fall back to CPU
when an accelerator is absent, so the same image runs unchanged on a plain CPU
box, an Intel host with OpenVINO, or a CUDA/TensorRT machine.

A missing model is recorded, never worked around.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog

from app.config import Settings
from app.models.registry import ModelRegistry, ModelStatus

logger = structlog.get_logger(__name__)

# Most specific accelerator first; CPU is always the final fallback.
PROVIDER_PREFERENCE = [
    "TensorrtExecutionProvider",
    "CUDAExecutionProvider",
    "OpenVINOExecutionProvider",
    "CPUExecutionProvider",
]


def _select_providers() -> list[str]:
    """Intersect our preference order with what this build actually offers."""
    import onnxruntime as ort

    available = set(ort.get_available_providers())
    selected = [p for p in PROVIDER_PREFERENCE if p in available]
    return selected or ["CPUExecutionProvider"]


def _make_session(path: Path) -> Any:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    # One thread per session: this service serves many small concurrent
    # requests across several Gunicorn workers. Letting each session spawn its
    # own pool oversubscribes the CPU and makes tail latency worse.
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), sess_options=options, providers=_select_providers())


def _load_face_landmarker(registry: ModelRegistry, settings: Settings) -> None:
    slot = registry.face_landmarker
    path = settings.face_landmarker_path

    if not path.exists():
        slot.status = ModelStatus.NOT_CONFIGURED
        slot.detail = (
            f"Expected {path}. Run: python scripts/download_models.py"
        )
        logger.warning("model_not_configured", model=slot.name, path=str(path))
        return

    try:
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        options = mp_vision.FaceLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(path)),
            running_mode=mp_vision.RunningMode.IMAGE,
            # Two, so a second face can be DETECTED and reported as
            # MULTIPLE_FACES rather than silently analysing whichever the
            # detector happened to rank first.
            num_faces=2,
            output_face_blendshapes=False,  # not needed; costs time
            output_facial_transformation_matrixes=True,  # yields head pose
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        slot.handle = mp_vision.FaceLandmarker.create_from_options(options)
        slot.status = ModelStatus.LOADED
        slot.detail = f"{path.name} (mediapipe {mp.__version__})"
        logger.info("model_loaded", model=slot.name, version=slot.version)
    except Exception as exc:  # noqa: BLE001 - startup reports, never crashes
        slot.status = ModelStatus.FAILED
        slot.detail = f"Failed to load: {exc}"
        logger.error("model_load_failed", model=slot.name, error=str(exc))


def _load_onnx_slot(slot, path: Path, missing_detail: str) -> None:
    if not path.exists():
        slot.status = ModelStatus.NOT_CONFIGURED
        slot.detail = missing_detail
        logger.warning("model_not_configured", model=slot.name, path=str(path))
        return
    try:
        slot.handle = _make_session(path)
        providers = slot.handle.get_providers()
        slot.status = ModelStatus.LOADED
        slot.detail = f"{path.name} via {providers[0]}"
        logger.info("model_loaded", model=slot.name, version=slot.version, providers=providers)
    except Exception as exc:  # noqa: BLE001
        slot.status = ModelStatus.FAILED
        slot.detail = f"Failed to load: {exc}"
        logger.error("model_load_failed", model=slot.name, error=str(exc))


def load_models(settings: Settings) -> ModelRegistry:
    """Build the registry. Called exactly once, from the app lifespan."""
    registry = ModelRegistry()

    _load_face_landmarker(registry, settings)

    _load_onnx_slot(
        registry.face_parser,
        settings.face_parser_path,
        missing_detail=(
            f"Expected a BiSeNet face-parsing ONNX model at {settings.face_parser_path}. "
            "Face parsing is REQUIRED: the skin mask must come from segmentation, not "
            "from a landmark polygon. Both analysis and try-on return "
            "MODEL_NOT_CONFIGURED without it. "
            "See README section 5 (Models) and offline-models/README.md."
        ),
    )

    _load_onnx_slot(
        registry.skin_concerns,
        settings.skin_model_path,
        missing_detail=(
            f"Expected a skin-concern ONNX model at {settings.skin_model_path}. "
            "Concern scores are reported as unavailable — never estimated. "
            "See offline-models/README.md for the export contract."
        ),
    )

    logger.info(
        "models_ready" if registry.ready else "models_incomplete",
        ready=registry.ready,
        loaded=[s.name for s in registry.slots() if s.available],
        missing=[s.name for s in registry.missing_required()],
    )
    return registry
