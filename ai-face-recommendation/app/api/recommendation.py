"""POST /v1/recommend — PHASE 2.

Implemented, but off by default: `ENABLE_RECOMMENDATION=false` makes this
return `NOT_IMPLEMENTED` regardless, same as Phase 1's other gated endpoints.
Enabling it is a deployment decision, not something flipping automatically the
moment the code lands.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import API_PREFIX
from app.core.errors import AIServiceError, ErrorCode
from app.core.lifecycle import get_settings_dep
from app.core.logging import REQUESTS, stage_timer
from app.core.security import require_internal_key
from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services import recommendation_engine

router = APIRouter(prefix=API_PREFIX, tags=["recommendation"])


@router.post("/recommend", response_model=RecommendationResponse)
def recommend(
    request: Request,
    payload: RecommendationRequest,
    _: None = Depends(require_internal_key),
) -> RecommendationResponse:
    settings = get_settings_dep(request)

    if not settings.enable_recommendation:
        REQUESTS.labels(endpoint="recommend", status="disabled").inc()
        raise AIServiceError(
            ErrorCode.NOT_IMPLEMENTED,
            "Product recommendation is not enabled on this deployment.",
            extra={
                "phase": 2,
                "contract": {
                    "hard_filters": [
                        "stock",
                        "active",
                        "skin_type",
                        "allergies",
                        "pregnancy_safe",
                        "budget",
                    ],
                    "shade_match": "CIELAB + CIEDE2000 for complexion products, undertone compatibility elsewhere",
                    "catalog_source": "supplied by the caller on every request; never invented here",
                    "no_match_behaviour": "status=NO_MATCH, or an explicitly-marked BROADER_MATCH",
                },
            },
        )

    # Pure and synchronous: no model inference, no I/O. Cheap enough to run
    # inline on the event loop rather than needing a threadpool.
    with stage_timer("recommendation"):
        response = recommendation_engine.recommend(payload)

    REQUESTS.labels(endpoint="recommend", status=response.status.lower()).inc()
    return response
