"""Recommendation contract — PHASE 2.

`AnalysisPayload` is deliberately shaped so Node can forward the `analysis`
block of a prior `/v1/analyze` response almost verbatim, rather than Node
re-deriving or summarising it. `lab` in particular is what lets shade matching
compare an actual measured colour instead of reconstructing one from a coarse
category label.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class AnalysisPayload(BaseModel):
    skin_tone_category: str | None = None
    monk_scale: int | None = Field(default=None, ge=1, le=10)
    # From `/v1/analyze`'s `analysis.skin_tone.lab` — true CIELAB, keys l/a/b.
    # Optional: without it, shade matching falls back to undertone compatibility
    # only, and says so in `notes` rather than inventing a colour distance.
    lab: dict[str, float] | None = None
    undertone: str | None = None
    undertone_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    skin_type: str | None = None
    concerns: dict[str, float] = Field(default_factory=dict)


class PreferencesPayload(BaseModel):
    categories: list[str] = Field(default_factory=list)
    budget_max: float | None = Field(default=None, ge=0)
    exclude_ingredients: list[str] = Field(default_factory=list)
    pregnancy_safe_only: bool = False
    limit: int = Field(default=12, ge=1, le=50)


class RecommendationRequest(BaseModel):
    analysis: AnalysisPayload
    preferences: PreferencesPayload = Field(default_factory=PreferencesPayload)
    # Node sends the catalog on every call; this service never holds one and
    # never invents a product, a price, or a shade that isn't in this list.
    catalog: list[dict] = Field(default_factory=list)


class RecommendationItem(BaseModel):
    product_id: str = Field(
        description="Real product id, copied from an entry in the request catalog."
    )
    variant_id: str | None = Field(
        default=None, description="Shade id, when the match is shade-specific."
    )
    match_score: float = Field(ge=0.0, le=1.0)
    reason: str


class RecommendationResponse(BaseModel):
    success: bool = True
    status: str = Field(default="OK", description="OK | NO_MATCH | BROADER_MATCH")
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
