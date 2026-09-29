"""Registry of loaded models, each carrying an explicit version.

Versions matter beyond reporting: they are part of the cache key, so bumping
one invalidates every result the previous version produced. Without that, a
model upgrade would keep serving stale answers until the TTL expired.

A model that failed to load is recorded as such. Nothing here ever substitutes
a fallback prediction for a missing model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.config import (
    FACE_LANDMARKER_VERSION,
    FACE_PARSER_VERSION,
    SKIN_MODEL_VERSION,
)


class ModelStatus(StrEnum):
    LOADED = "LOADED"
    NOT_CONFIGURED = "NOT_CONFIGURED"  # file absent
    FAILED = "FAILED"  # file present, would not load


@dataclass
class ModelSlot:
    name: str
    version: str
    required: bool
    status: ModelStatus = ModelStatus.NOT_CONFIGURED
    detail: str = "Model file not present."
    handle: Any = None

    @property
    def available(self) -> bool:
        return self.status is ModelStatus.LOADED and self.handle is not None

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "status": str(self.status),
            "required": self.required,
            "detail": self.detail,
        }


@dataclass
class ModelRegistry:
    face_landmarker: ModelSlot = field(
        default_factory=lambda: ModelSlot(
            "face_landmarker", FACE_LANDMARKER_VERSION, required=True
        )
    )
    # Face parsing is REQUIRED. The skin mask must come from segmentation;
    # a landmark polygon is not an acceptable substitute, because it cannot
    # exclude hair, glasses or stray strands and would silently contaminate
    # every colour measurement.
    face_parser: ModelSlot = field(
        default_factory=lambda: ModelSlot("face_parser", FACE_PARSER_VERSION, required=True)
    )
    skin_concerns: ModelSlot = field(
        default_factory=lambda: ModelSlot("skin_model", SKIN_MODEL_VERSION, required=True)
    )

    def slots(self) -> list[ModelSlot]:
        return [self.face_landmarker, self.face_parser, self.skin_concerns]

    @property
    def ready(self) -> bool:
        """Readiness requires every model marked required to be loaded."""
        return all(slot.available for slot in self.slots() if slot.required)

    def missing_required(self) -> list[ModelSlot]:
        return [slot for slot in self.slots() if slot.required and not slot.available]

    def versions(self) -> dict[str, str]:
        """Versions reported in every analysis response."""
        return {
            "face_landmarker": self.face_landmarker.version,
            "face_parser": self.face_parser.version,
            "skin_model": self.skin_concerns.version,
        }

    def cache_signature(self) -> str:
        """Compact version string folded into every cache key."""
        return "|".join(
            f"{slot.name}={slot.version}" for slot in self.slots()
        )

    def describe(self) -> list[dict[str, Any]]:
        return [slot.describe() for slot in self.slots()]

    def close(self) -> None:
        for slot in self.slots():
            handle = slot.handle
            if handle is not None and hasattr(handle, "close"):
                try:
                    handle.close()
                except Exception:  # noqa: BLE001 - shutdown must not raise
                    pass
            slot.handle = None
