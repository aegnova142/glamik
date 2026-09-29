"""Phase 2 recommendation engine.

The property that matters most here is not any single score: it's that a hard
filter really removes a product rather than merely lowering its rank, and that
nothing the engine returns can point at a product that wasn't in the request's
own catalog.
"""

from __future__ import annotations

import copy

from app.schemas.recommendation import (
    AnalysisPayload,
    PreferencesPayload,
    RecommendationRequest,
)
from app.services import recommendation_engine as engine

FOUNDATION = {
    "id": "prod-foundation-1",
    "name": "Second Skin Foundation",
    "category": "Makeup",
    "subCategory": "Foundation",
    "price": 1200.0,
    "inStock": True,
    "stock": 10,
    "ingredients": ["Aqua", "Titanium Dioxide", "Fragrance"],
    "benefits": ["Hydrating", "Buildable coverage"],
    "attributes": [{"id": "a1", "name": "Pregnancy Safe", "value": "Yes", "sortOrder": 0}],
    "shades": [
        {
            "id": "shade-warm-30",
            "name": "30 Warm",
            "hex": "#c68e5d",
            "undertone": "Warm",
            "isActive": True,
            "stock": 5,
        },
        {
            "id": "shade-cool-30",
            "name": "30 Cool",
            "hex": "#a877c9",
            "undertone": "Cool",
            "isActive": True,
            "stock": 5,
        },
        {
            "id": "shade-out-of-stock",
            "name": "10 Fair",
            "hex": "#f0d9c0",
            "undertone": "Warm",
            "isActive": True,
            "stock": 0,
        },
        {
            "id": "shade-discontinued",
            "name": "Discontinued Deep",
            "hex": "#3a2416",
            "undertone": "Warm",
            "isActive": False,
            "stock": 5,
        },
    ],
}

LIPSTICK = {
    "id": "prod-lipstick-1",
    "name": "Velvet Matte Lipstick",
    "category": "Makeup",
    "subCategory": "Lips",
    "price": 800.0,
    "inStock": True,
    "stock": 20,
    "benefits": ["Long-wearing", "Matte finish"],
    "shades": [
        {
            "id": "shade-ruby",
            "name": "Ruby Red",
            "hex": "#c68e5d",  # deliberately close to the user's skin colour
            "undertone": "Warm",
            "isActive": True,
            "stock": 3,
        }
    ],
}

SERUM = {
    "id": "prod-serum-1",
    "name": "Clear Skin Serum",
    "category": "Skin",
    "subCategory": "Serum",
    "price": 950.0,
    "inStock": True,
    "stock": 15,
    "skinType": ["Oily", "Combination"],
    "benefits": ["Reduces acne and blemishes", "Oil control"],
    "ingredients": ["Salicylic Acid", "Niacinamide"],
}

EXPENSIVE_PRODUCT = {
    "id": "prod-luxury-1",
    "name": "Luxury Cream",
    "category": "Skin",
    "subCategory": "Moisturiser",
    "price": 9999.0,
    "inStock": True,
    "stock": 3,
}

FULL_CATALOG = [FOUNDATION, LIPSTICK, SERUM, EXPENSIVE_PRODUCT]

# LAB for #c68e5d — close to FOUNDATION's warm shade and LIPSTICK's colour,
# far from its cool shade.
USER_LAB = {"l": 62.0, "a": 17.0, "b": 32.0}


def _all_ids(catalog: list[dict]) -> set[str]:
    ids: set[str] = set()
    for product in catalog:
        ids.add(product["id"])
        for shade in product.get("shades", []):
            ids.add(shade["id"])
    return ids


def _request(
    catalog=None,
    undertone="Warm",
    undertone_confidence=0.8,
    lab=USER_LAB,
    concerns=None,
    skin_type=None,
    **prefs,
) -> RecommendationRequest:
    return RecommendationRequest(
        analysis=AnalysisPayload(
            skin_tone_category="intermediate",
            monk_scale=4,
            lab=lab,
            undertone=undertone,
            undertone_confidence=undertone_confidence,
            skin_type=skin_type,
            concerns=concerns or {},
        ),
        preferences=PreferencesPayload(**prefs),
        catalog=catalog if catalog is not None else copy.deepcopy(FULL_CATALOG),
    )


# --- hard filters ------------------------------------------------------------


def test_out_of_stock_shade_is_excluded():
    response = engine.recommend(_request())
    ids = {r.variant_id for r in response.recommendations}
    assert "shade-out-of-stock" not in ids


def test_discontinued_shade_is_excluded():
    response = engine.recommend(_request())
    ids = {r.variant_id for r in response.recommendations}
    assert "shade-discontinued" not in ids


def test_product_marked_inactive_is_excluded():
    catalog = copy.deepcopy(FULL_CATALOG)
    catalog[2]["isActive"] = False  # SERUM
    response = engine.recommend(_request(catalog=catalog))
    ids = {r.product_id for r in response.recommendations}
    assert "prod-serum-1" not in ids


def test_excluded_ingredient_removes_the_whole_product():
    response = engine.recommend(_request(exclude_ingredients=["Fragrance"]))
    ids = {r.product_id for r in response.recommendations}
    assert "prod-foundation-1" not in ids


def test_ingredient_exclusion_is_case_insensitive():
    response = engine.recommend(_request(exclude_ingredients=["fragrance"]))
    assert "prod-foundation-1" not in {r.product_id for r in response.recommendations}


def test_pregnancy_safe_only_excludes_products_without_a_confirmed_flag():
    """Unknown must not be treated as safe.

    FOUNDATION is explicitly marked safe; LIPSTICK, SERUM and EXPENSIVE_PRODUCT
    carry no such attribute at all — absence of data, not a "no".
    """
    response = engine.recommend(_request(pregnancy_safe_only=True))
    ids = {r.product_id for r in response.recommendations}
    assert "prod-foundation-1" in ids
    assert "prod-lipstick-1" not in ids
    assert "prod-serum-1" not in ids


def test_pregnancy_unsafe_attribute_excludes_even_without_the_flag_checked():
    catalog = copy.deepcopy(FULL_CATALOG)
    catalog[1]["attributes"] = [
        {"id": "a1", "name": "Pregnancy Safe", "value": "No", "sortOrder": 0}
    ]
    response = engine.recommend(_request(catalog=catalog, pregnancy_safe_only=True))
    assert "prod-lipstick-1" not in {r.product_id for r in response.recommendations}


def test_over_budget_product_is_excluded():
    response = engine.recommend(_request(budget_max=1000.0))
    ids = {r.product_id for r in response.recommendations}
    assert "prod-luxury-1" not in ids
    assert "prod-foundation-1" not in ids  # price 1200 > 1000
    assert "prod-serum-1" in ids  # price 950 <= 1000


def test_category_filter_removes_other_categories():
    response = engine.recommend(_request(categories=["Skin"]))
    categories_seen = {
        p["category"]
        for p in FULL_CATALOG
        for r in response.recommendations
        if r.product_id == p["id"]
    }
    assert categories_seen <= {"Skin"}
    assert "prod-foundation-1" not in {r.product_id for r in response.recommendations}


def test_skin_type_mismatch_excludes_the_product():
    response = engine.recommend(_request(skin_type="Dry"))
    assert "prod-serum-1" not in {r.product_id for r in response.recommendations}


def test_skin_type_match_keeps_the_product():
    response = engine.recommend(_request(skin_type="Oily"))
    assert "prod-serum-1" in {r.product_id for r in response.recommendations}


def test_a_product_with_no_skin_type_restriction_is_not_excluded():
    # FOUNDATION declares no skinType at all — must not be treated as a mismatch.
    response = engine.recommend(_request(skin_type="Dry"))
    assert "prod-foundation-1" in {r.product_id for r in response.recommendations}


# --- ranking ------------------------------------------------------------


def test_undertone_exact_match_outranks_the_opposite_undertone():
    response = engine.recommend(_request(undertone="Warm"))
    by_variant = {r.variant_id: r.match_score for r in response.recommendations}
    assert by_variant["shade-warm-30"] > by_variant["shade-cool-30"]


def test_colour_match_applies_only_to_complexion_products():
    """LIPSTICK's shade is colour-identical to the user's skin; FOUNDATION's
    warm shade is merely close. If colour-matching leaked into lip products,
    the lipstick's reason would claim a skin colour match it has no business
    claiming."""
    response = engine.recommend(_request())
    by_variant = {r.variant_id: r.reason for r in response.recommendations}
    assert "colour match" not in by_variant["shade-ruby"]


def test_close_colour_match_is_named_in_the_reason():
    response = engine.recommend(_request())
    warm_reco = next(r for r in response.recommendations if r.variant_id == "shade-warm-30")
    assert "colour match" in warm_reco.reason


def test_concern_relevant_product_is_boosted_when_benefits_mention_it():
    response = engine.recommend(_request(concerns={"acne": 0.9}))
    serum_reco = next(r for r in response.recommendations if r.product_id == "prod-serum-1")
    assert "acne" in serum_reco.reason


def test_concern_score_below_threshold_does_not_trigger_the_boost():
    response = engine.recommend(_request(concerns={"acne": 0.1}))
    serum_reco = next(r for r in response.recommendations if r.product_id == "prod-serum-1")
    assert "acne" not in serum_reco.reason


def test_low_confidence_undertone_is_not_trusted():
    """Below the confidence floor, undertone must not drive ranking at all.

    Isolated to a non-complexion product with no concern data, so undertone
    compatibility is the *only* scoring component — anything other than exact
    equality here would mean a coin-flip undertone reading still swung which
    shade came out on top.
    """
    catalog = [
        {
            "id": "prod-lips",
            "category": "Makeup",
            "subCategory": "Lips",
            "price": 100.0,
            "inStock": True,
            "stock": 5,
            "shades": [
                {
                    "id": "shade-a-warm",
                    "hex": "#111111",
                    "undertone": "Warm",
                    "isActive": True,
                    "stock": 5,
                },
                {
                    "id": "shade-b-cool",
                    "hex": "#222222",
                    "undertone": "Cool",
                    "isActive": True,
                    "stock": 5,
                },
            ],
        }
    ]

    confident = engine.recommend(
        _request(catalog=catalog, undertone="Cool", undertone_confidence=0.9, lab=None)
    )
    unsure = engine.recommend(
        _request(catalog=catalog, undertone="Cool", undertone_confidence=0.1, lab=None)
    )

    confident_scores = {r.variant_id: r.match_score for r in confident.recommendations}
    unsure_scores = {r.variant_id: r.match_score for r in unsure.recommendations}

    assert confident_scores["shade-b-cool"] > confident_scores["shade-a-warm"]
    assert unsure_scores["shade-a-warm"] == unsure_scores["shade-b-cool"] == 0.5


# --- status ------------------------------------------------------------


def test_status_ok_when_the_top_pick_matches_undertone():
    response = engine.recommend(_request(undertone="Warm"))
    assert response.status == "OK"


def test_status_broader_match_when_only_a_mismatched_undertone_is_eligible():
    catalog = [
        {
            "id": "prod-only-cool",
            "category": "Makeup",
            "subCategory": "Foundation",
            "price": 100.0,
            "inStock": True,
            "stock": 5,
            "shades": [
                {
                    "id": "shade-only-cool",
                    "hex": "#a877c9",
                    "undertone": "Cool",
                    "isActive": True,
                    "stock": 5,
                }
            ],
        }
    ]
    response = engine.recommend(
        _request(catalog=catalog, undertone="Warm", undertone_confidence=0.9)
    )
    assert response.status == "BROADER_MATCH"
    assert any("undertone" in note.lower() for note in response.notes)


def test_status_no_match_when_the_catalog_has_nothing_eligible():
    response = engine.recommend(_request(catalog=[], undertone="Warm"))
    assert response.status == "NO_MATCH"
    assert response.recommendations == []
    assert response.notes


def test_status_no_match_when_every_product_is_filtered_out():
    response = engine.recommend(_request(budget_max=1.0))
    assert response.status == "NO_MATCH"
    assert response.recommendations == []


def test_missing_lab_is_noted_not_silently_ignored():
    response = engine.recommend(_request(lab=None))
    assert any("colour" in note.lower() for note in response.notes)


def test_missing_concerns_are_noted():
    response = engine.recommend(_request(concerns={}))
    assert any("concern" in note.lower() for note in response.notes)


# --- the non-negotiable invariant --------------------------------------


def test_every_returned_id_exists_in_the_input_catalog():
    """No response may point at a product or shade that wasn't supplied.

    This is what makes fabrication structurally impossible rather than merely
    discouraged: the engine has no other source of ids to draw from.
    """
    catalog = copy.deepcopy(FULL_CATALOG)
    valid_ids = _all_ids(catalog)

    response = engine.recommend(_request(catalog=catalog, limit=50))
    for item in response.recommendations:
        assert item.product_id in valid_ids
        if item.variant_id is not None:
            assert item.variant_id in valid_ids


def test_limit_is_respected():
    response = engine.recommend(_request(limit=2))
    assert len(response.recommendations) <= 2


def test_malformed_catalog_entries_are_skipped_not_crashed():
    """Built with `model_construct` to bypass pydantic validation entirely.

    `RecommendationRequest.catalog` is typed `list[dict]`, so FastAPI itself
    rejects a non-dict entry with a 422 before this function ever runs — that
    boundary is tested in test_upload.py's request-validation tests, not here.
    What's worth testing directly is the engine's *own* defensiveness against
    a dict-shaped-but-incomplete entry, since nothing at the schema level rules
    those out (`catalog: list[dict]` says nothing about which keys a dict has).
    """
    catalog = [
        None,
        "not a product",
        {"id": None, "price": 10},
        {"category": "Makeup"},  # no id
        {
            "id": "prod-ok",
            "category": "Skin",
            "price": 100,
            "inStock": True,
            "stock": 5,
            "shades": [
                None,
                {"id": None},
                {"id": "shade-ok", "hex": "#c68e5d", "isActive": True, "stock": 1},
            ],
        },
    ]
    request = _request(catalog=[])
    request = RecommendationRequest.model_construct(
        analysis=request.analysis, preferences=request.preferences, catalog=catalog
    )
    response = engine.recommend(request)
    ids = {r.product_id for r in response.recommendations}
    assert ids == {"prod-ok"}


def test_match_scores_are_bounded():
    response = engine.recommend(_request(limit=50))
    for item in response.recommendations:
        assert 0.0 <= item.match_score <= 1.0


# --- endpoint ------------------------------------------------------------


def test_recommend_endpoint_returns_real_results_when_enabled(client, auth_headers, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_recommendation", True)
    response = client.post(
        "/v1/recommend",
        json={
            "analysis": {
                "skin_tone_category": "intermediate",
                "undertone": "Warm",
                "undertone_confidence": 0.8,
                "lab": USER_LAB,
            },
            "preferences": {"limit": 5},
            "catalog": copy.deepcopy(FULL_CATALOG),
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["status"] in {"OK", "NO_MATCH", "BROADER_MATCH"}
    catalog_ids = _all_ids(FULL_CATALOG)
    for item in body["recommendations"]:
        assert item["product_id"] in catalog_ids


def test_recommend_endpoint_still_requires_auth_when_enabled(client, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_recommendation", True)
    response = client.post("/v1/recommend", json={"analysis": {}})
    assert response.status_code == 401
