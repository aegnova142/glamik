"""Response models for POST /v1/analyze.

Field names are snake_case to match the contract the Node backend consumes.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

DISCLAIMER = "This is an AI-based cosmetic estimate and is not a medical diagnosis."

DERMATOLOGIST_ADVICE = (
    "If you have persistent or worsening skin concerns, or a mole or lesion that is "
    "changing, please consult a dermatologist. This service does not diagnose skin "
    "conditions."
)


class ModelVersions(BaseModel):
    face_landmarker: str
    face_parser: str
    skin_model: str


class SkinTone(BaseModel):
    category: str = Field(description="ITA band, e.g. 'intermediate'.")
    label: str = Field(description="Customer-facing wording for the band, e.g. 'medium'.")
    monk_scale: int = Field(ge=1, le=10, description="Approximate Monk Skin Tone step.")
    ita: float = Field(description="Individual Typology Angle, degrees.")
    confidence: float = Field(ge=0.0, le=1.0)
    lab: dict[str, float] = Field(default_factory=dict)


class Undertone(BaseModel):
    value: str = Field(description="warm | cool | neutral")
    confidence: float = Field(ge=0.0, le=1.0)
    notes: list[str] = Field(default_factory=list)


class Concerns(BaseModel):
    """Concern scores, or an explicit statement that they are unavailable.

    `available: false` with `scores: null` is the honest representation of a
    missing model. Emitting zeros or midpoints would be indistinguishable from
    a real measurement to anyone consuming this.
    """

    available: bool
    scores: dict[str, float] | None = None
    reason: str | None = None
    notes: list[str] = Field(default_factory=list)


class AnalysisBlock(BaseModel):
    skin_tone: SkinTone
    undertone: Undertone
    concerns: Concerns


class Quality(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    issues: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)


class Pipeline(BaseModel):
    """How the answer was produced, so the caller can judge how far to trust it."""

    skin_mask_source: str
    skin_pixels: int
    face_coverage: float
    refined_by_landmarks: bool = False
    image_sha256: str
    source_format: str
    exif_transposed: bool = False
    icc_converted: bool = False
    unmirrored: bool = False
    cached: bool = False
    duration_ms: float | None = None


class AnalyzeResponse(BaseModel):
    success: bool = True
    model_version: ModelVersions
    analysis: AnalysisBlock
    quality: Quality
    pipeline: Pipeline
    disclaimer: str = DISCLAIMER
    advice: str = DERMATOLOGIST_ADVICE


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorBody
    quality_issues: list[str] | None = None
