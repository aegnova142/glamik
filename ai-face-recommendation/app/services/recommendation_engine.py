"""Catalog-based recommendation — PHASE 2.

Two passes over the catalog Node supplies on every call:

1. **Hard filters.** A product/shade failing any of these is removed
   outright, never merely down-ranked — an allergy exclusion that only
   lowered a score would still show the customer the product.

       1. in stock            5. pregnancy-safe (only when requested)
       2. active               6. budget
       3. skin type            7. shade availability (folded into 1 and 2)
       4. allergies / excluded ingredients

2. **Ranking**, over whatever survives filtering:

   - **Undertone compatibility.** An exact match scores highest, a
     Universal/Neutral shade scores partial credit, and a true opposite
     (Warm vs Cool) is down-ranked, never eliminated — the hard-filter list
     above does not include undertone, deliberately.
   - **Colour match**, CIELAB + CIEDE2000, but **only for complexion
     products** (foundation/concealer/powder-type). CIEDE2000 rather than
     Euclidean distance because perceptual difference in skin tones is
     strongly non-uniform in plain LAB. This is never applied to lip/eye/
     cheek shades: a lipstick is not a better match for being closer in
     colour to the wearer's skin.
   - **Concern relevance**, a modest boost when the user's reported concern
     scores line up with keywords actually present in the product's own
     `benefits`/attributes text. There is no "concern weight" field on a real
     product to multiply against — inventing one would be exactly the kind of
     fabricated signal this service exists to avoid, so this reads real text
     instead of a number that doesn't exist.

Non-negotiables carried over from Phase 1:

  - Catalog data comes from the Node backend, in the request. This service
    holds no product store and never invents an id, a name, a price or a
    shade — every `product_id`/`variant_id` returned is copied verbatim from
    an entry in `request.catalog`.
  - No exact match returns `status: "NO_MATCH"` or an explicitly-marked
    `"BROADER_MATCH"`. Never an external brand, never a silently-loosened
    match presented as exact.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.recommendation import (
    AnalysisPayload,
    PreferencesPayload,
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
)
from app.utils.color import clamp01, delta_e2000, hex_to_lab

# Below this, an undertone reading is a coin flip, and letting it drive a hard
# ranking decision would present that coin flip as a colourist's judgement.
MIN_TRUSTED_UNDERTONE_CONFIDENCE = 0.4

# Shade colour distance beyond which "match" stops meaning anything — used
# only to scale ΔE00 into a 0..1 similarity, not as a filter.
MAX_MEANINGFUL_DELTA_E = 60.0

COMPATIBLE_UNDERTONES = {"universal", "neutral"}
GENERIC_SKIN_TYPE_MARKERS = {"all", "all skin types", "any", "universal"}

# Keyword lists a product's own text is checked against — never a per-product
# numeric weight that would have to be invented.
CONCERN_KEYWORDS: dict[str, list[str]] = {
    "acne": ["acne", "blemish", "breakout", "blackhead"],
    "pigmentation": ["pigmentation", "dark spot", "uneven tone", "brightening", "dullness"],
    "oiliness": ["oil control", "mattify", "oil-free", "oily", "shine control", "sebum"],
    "dryness": ["hydrating", "hydration", "moisturi", "dry skin", "nourish", "dewy"],
    "wrinkles": ["anti-ageing", "anti-aging", "fine line", "wrinkle", "firming", "plumping"],
}
CONCERN_SCORE_THRESHOLD = 0.5

COMPLEXION_HINTS = [
    "foundation",
    "concealer",
    "powder",
    "complexion",
    "tinted",
    "bb cream",
    "cc cream",
    "compact",
    "colour correct",
    "color correct",
]

_REASON_LABELS = {
    "out_of_stock": "out of stock",
    "inactive_shade": "shade discontinued",
    "inactive_product": "product inactive",
    "skin_type_mismatch": "not suited to the detected skin type",
    "excluded_ingredient": "contains an excluded ingredient",
    "pregnancy_safety_unconfirmed": "pregnancy-safe status not confirmed by the catalog",
    "over_budget": "over budget",
    "category_excluded": "outside the requested categories",
}


@dataclass
class _Candidate:
    product: dict[str, Any]
    shade: dict[str, Any] | None
    score: float = 0.0
    reason: str = ""
    undertone_ok: bool = True


# --- field extraction (defensive: catalog entries are arbitrary JSON) -------


def _to_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _resolve_price(product: dict[str, Any], shade: dict[str, Any] | None) -> float | None:
    if shade is not None:
        shade_price = _to_float(shade.get("price"))
        if shade_price is not None:
            return shade_price
    return _to_float(product.get("price"))


def _resolve_stock(product: dict[str, Any], shade: dict[str, Any] | None) -> int | None:
    if shade is not None:
        shade_stock = _to_int(shade.get("stock"))
        if shade_stock is not None:
            return shade_stock
    return _to_int(product.get("stock"))


def _skin_types(product: dict[str, Any]) -> list[str]:
    raw = product.get("skinType")
    if isinstance(raw, list) and raw:
        return [str(x).strip().lower() for x in raw if str(x).strip()]
    details = product.get("details")
    if isinstance(details, dict):
        legacy = details.get("skinType")
        if isinstance(legacy, str) and legacy.strip():
            return [part.strip().lower() for part in legacy.split(",") if part.strip()]
    return []


def _skin_type_matches(declared: list[str], user_skin_type: str) -> bool:
    if any(d in GENERIC_SKIN_TYPE_MARKERS for d in declared):
        return True
    target = user_skin_type.strip().lower()
    return any(target == d or target in d or d in target for d in declared)


def _ingredient_text(product: dict[str, Any]) -> str:
    parts: list[str] = []
    ingredients = product.get("ingredients")
    if isinstance(ingredients, list):
        parts.extend(str(i) for i in ingredients)
    details = product.get("details")
    if isinstance(details, dict):
        legacy = details.get("ingredientsList")
        if isinstance(legacy, str):
            parts.append(legacy)
    return " ".join(parts).lower()


def _benefit_text(product: dict[str, Any]) -> str:
    parts: list[str] = [str(product.get("subtitle", "")), str(product.get("description", ""))]
    benefits = product.get("benefits")
    if isinstance(benefits, list):
        parts.extend(str(b) for b in benefits)
    attributes = product.get("attributes")
    if isinstance(attributes, list):
        parts.extend(str(a.get("value", "")) for a in attributes if isinstance(a, dict))
    return " ".join(parts).lower()


def _pregnancy_safety(product: dict[str, Any]) -> bool | None:
    """True/False when the catalog says so explicitly; None when it doesn't.

    There is no dedicated field for this on a real product — only the
    free-form admin-entered "Details & Attributes" list. Reading that honestly
    means the answer is often "unknown", and unknown must not be treated as
    "yes": failing a safety-relevant filter closed is the only defensible
    default when the data simply isn't there.
    """
    attributes = product.get("attributes")
    if not isinstance(attributes, list):
        return None
    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue
        name = str(attribute.get("name", "")).lower()
        if "pregnan" not in name:
            continue
        value = str(attribute.get("value", "")).strip().lower()
        if any(neg in value for neg in ("not safe", "unsafe", "avoid", "not recommended")):
            return False
        if value in {"no", "false"}:
            return False
        if value in {"yes", "true"} or "safe" in value:
            return True
    return None


# --- hard filters ------------------------------------------------------------


def _passes_hard_filters(
    product: dict[str, Any],
    shade: dict[str, Any] | None,
    prefs: PreferencesPayload,
    skin_type: str | None,
) -> tuple[bool, str | None]:
    if prefs.categories and str(product.get("category", "")) not in prefs.categories:
        return False, "category_excluded"

    if product.get("inStock") is False:
        return False, "out_of_stock"
    stock = _resolve_stock(product, shade)
    if stock is not None and stock <= 0:
        return False, "out_of_stock"

    if shade is not None and shade.get("isActive") is False:
        return False, "inactive_shade"
    if product.get("active") is False or product.get("isActive") is False:
        return False, "inactive_product"

    if skin_type:
        declared = _skin_types(product)
        if declared and not _skin_type_matches(declared, skin_type):
            return False, "skin_type_mismatch"

    if prefs.exclude_ingredients:
        text = _ingredient_text(product)
        for excluded in prefs.exclude_ingredients:
            term = excluded.strip().lower()
            if term and term in text:
                return False, "excluded_ingredient"

    if prefs.pregnancy_safe_only and _pregnancy_safety(product) is not True:
        return False, "pregnancy_safety_unconfirmed"

    if prefs.budget_max is not None:
        price = _resolve_price(product, shade)
        if price is not None and price > prefs.budget_max:
            return False, "over_budget"

    return True, None


# --- ranking ------------------------------------------------------------


def _undertone_component(
    shade_undertone: str | None, user_undertone: str | None, trust_undertone: bool
) -> tuple[float, str | None, bool]:
    """Returns (score 0..1, reason if any, whether this counts as compatible)."""
    if not shade_undertone or not user_undertone or not trust_undertone:
        return 0.5, None, True
    s, u = shade_undertone.strip().lower(), user_undertone.strip().lower()
    if s == u:
        return 1.0, f"{shade_undertone} undertone match", True
    if s in COMPATIBLE_UNDERTONES:
        return 0.75, f"{shade_undertone} undertone (works broadly)", True
    if {s, u} == {"warm", "cool"}:
        return 0.15, None, False
    return 0.5, None, True


def _is_complexion_product(product: dict[str, Any]) -> bool:
    haystack = " ".join(str(product.get(key, "")) for key in ("subCategory", "category")).lower()
    details = product.get("details")
    if isinstance(details, dict):
        haystack += " " + str(details.get("coverage", "")).lower()
    return any(hint in haystack for hint in COMPLEXION_HINTS)


def _colour_match_component(
    user_lab: dict[str, float] | None, shade_hex: str | None, applicable: bool
) -> tuple[float | None, str | None]:
    if not applicable or not user_lab or not shade_hex:
        return None, None
    try:
        skin_lab = (float(user_lab["l"]), float(user_lab["a"]), float(user_lab["b"]))
    except (KeyError, TypeError, ValueError):
        return None, None
    shade_lab = hex_to_lab(shade_hex)
    if shade_lab is None:
        return None, None

    delta = delta_e2000(skin_lab, shade_lab)
    similarity = clamp01(1.0 - delta / MAX_MEANINGFUL_DELTA_E)
    if delta <= 3.0:
        return similarity, "very close colour match to your skin"
    if delta <= 8.0:
        return similarity, "close colour match to your skin"
    return similarity, None


def _concern_component(
    concerns: dict[str, float], product: dict[str, Any]
) -> tuple[float | None, str | None]:
    relevant = [name for name, value in concerns.items() if value >= CONCERN_SCORE_THRESHOLD]
    if not relevant:
        return None, None
    text = _benefit_text(product)
    matched = sorted(
        {
            concern
            for concern in relevant
            if any(keyword in text for keyword in CONCERN_KEYWORDS.get(concern, []))
        }
    )
    if not matched:
        return 0.5, None
    return 1.0, "helps with " + ", ".join(matched)


def _score_candidate(
    product: dict[str, Any], shade: dict[str, Any] | None, analysis: AnalysisPayload
) -> tuple[float, str, bool]:
    components: list[tuple[float, float]] = []  # (value, weight)
    reasons: list[str] = []
    undertone_ok = True

    if shade is not None:
        trust = analysis.undertone_confidence >= MIN_TRUSTED_UNDERTONE_CONFIDENCE
        score, reason, undertone_ok = _undertone_component(
            shade.get("undertone"), analysis.undertone, trust
        )
        components.append((score, 2.0))
        if reason:
            reasons.append(reason)

    colour_score, colour_reason = _colour_match_component(
        analysis.lab,
        shade.get("hex") if shade else None,
        applicable=shade is not None and _is_complexion_product(product),
    )
    if colour_score is not None:
        components.append((colour_score, 2.5))
        if colour_reason:
            reasons.append(colour_reason)

    concern_score, concern_reason = _concern_component(analysis.concerns, product)
    if concern_score is not None:
        components.append((concern_score, 1.5))
        if concern_reason:
            reasons.append(concern_reason)

    if not components:
        components = [(0.5, 1.0)]

    total_weight = sum(weight for _, weight in components)
    score = sum(value * weight for value, weight in components) / total_weight
    reason = "; ".join(reasons) if reasons else "Matches your stated preferences."

    return round(clamp01(score), 4), reason, undertone_ok


def _summarise_rejections(counts: dict[str, int]) -> str | None:
    if not counts:
        return None
    ordered = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    parts = [
        f"{count} excluded ({_REASON_LABELS.get(reason, reason)})" for reason, count in ordered
    ]
    return "No products matched: " + "; ".join(parts) + "."


# --- entry point --------------------------------------------------------


def recommend(request: RecommendationRequest) -> RecommendationResponse:
    """Score `request.catalog` against `request.analysis`, or say why not."""
    analysis, prefs = request.analysis, request.preferences
    notes: list[str] = []

    if analysis.lab is None:
        notes.append(
            "No measured skin colour was supplied; colour-distance matching was "
            "skipped in favour of undertone compatibility only."
        )
    if not analysis.concerns:
        notes.append("No skin-concern scores were supplied; concern-based ranking was skipped.")

    eligible: list[_Candidate] = []
    rejected: dict[str, int] = {}

    for product in request.catalog:
        if not isinstance(product, dict) or not product.get("id"):
            continue

        shades = product.get("shades")
        if isinstance(shades, list) and shades:
            for shade in shades:
                if not isinstance(shade, dict) or not shade.get("id"):
                    continue
                ok, reason = _passes_hard_filters(product, shade, prefs, analysis.skin_type)
                if ok:
                    eligible.append(_Candidate(product=product, shade=shade))
                elif reason:
                    rejected[reason] = rejected.get(reason, 0) + 1
        else:
            ok, reason = _passes_hard_filters(product, None, prefs, analysis.skin_type)
            if ok:
                eligible.append(_Candidate(product=product, shade=None))
            elif reason:
                rejected[reason] = rejected.get(reason, 0) + 1

    if not eligible:
        notes.append(
            _summarise_rejections(rejected)
            or "The catalog supplied for this request contained no eligible products."
        )
        return RecommendationResponse(status="NO_MATCH", recommendations=[], notes=notes)

    for candidate in eligible:
        candidate.score, candidate.reason, candidate.undertone_ok = _score_candidate(
            candidate.product, candidate.shade, analysis
        )

    eligible.sort(key=lambda c: c.score, reverse=True)
    top = eligible[: prefs.limit]

    status = "OK"
    if top and not top[0].undertone_ok:
        status = "BROADER_MATCH"
        notes.append(
            "No shade matched your undertone exactly; showing the closest available "
            "options from the Glamrik catalog instead."
        )

    recommendations = [
        RecommendationItem(
            product_id=str(candidate.product["id"]),
            variant_id=str(candidate.shade["id"]) if candidate.shade else None,
            match_score=candidate.score,
            reason=candidate.reason,
        )
        for candidate in top
    ]
    return RecommendationResponse(status=status, recommendations=recommendations, notes=notes)
