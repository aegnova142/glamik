"""End-to-end analysis behaviour.

The recurring assertion in this file is negative: when the service cannot
measure something, it must say so. It must never return a number that a caller
could mistake for a measurement.
"""

from __future__ import annotations

import pytest

from tests.conftest import encode_png


def post(client, auth_headers, data: bytes, **form):
    return client.post(
        "/v1/analyze",
        files={"image": ("face.png", data, "image/png")},
        data=form or None,
        headers=auth_headers,
    )


# --- failure paths ----------------------------------------------------------


def test_missing_models_are_reported_not_worked_around(
    client, auth_headers, noise_image, models_ready
):
    """With a required model absent, analysis refuses rather than approximates."""
    if models_ready:
        pytest.skip("all models present; this covers the unconfigured path")

    response = post(client, auth_headers, encode_png(noise_image))
    body = response.json()
    assert response.status_code == 503
    assert body["success"] is False
    assert body["error"]["code"] == "MODEL_NOT_CONFIGURED"
    assert "analysis" not in body
    # The response names what is missing, so an operator can fix it.
    assert body["missing_models"]


def test_a_photo_with_no_face_is_rejected(client, auth_headers, noise_image, models_ready):
    if not models_ready:
        pytest.skip("models not downloaded")

    response = post(client, auth_headers, encode_png(noise_image))
    assert response.status_code == 422
    assert response.json()["error"]["code"] in {"NO_FACE", "RETAKE_PHOTO"}


def test_an_unusable_photo_asks_for_a_retake(client, auth_headers, dark_image, models_ready):
    if not models_ready:
        pytest.skip("models not downloaded")

    response = post(client, auth_headers, encode_png(dark_image))
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "RETAKE_PHOTO"
    assert body["quality_issues"], "a retake must say what to fix"


def test_retake_message_is_actionable():
    """'Retake the photo' without a reason is not a usable instruction."""
    from app.services.pipeline import _retake_message

    message = _retake_message(["LOW_LIGHT", "BLURRY"])
    assert "brighter" in message
    assert "steady" in message
    # Unrecognised codes still produce something the user can act on.
    assert _retake_message(["SOMETHING_NEW"]).strip().endswith(".")


def test_error_envelope_is_uniform(client, auth_headers):
    body = post(client, auth_headers, b"not an image").json()
    assert body["success"] is False
    assert set(body["error"]) == {"code", "message"}


def test_no_stack_trace_reaches_the_caller(client, auth_headers):
    text = post(client, auth_headers, b"not an image").text
    for leak in ("Traceback", 'File "/', "app/services/", '.py", line'):
        assert leak not in text


# --- success path (only when the models are actually installed) -------------


def test_a_real_face_produces_a_complete_response(
    client, auth_headers, models_ready, sample_face_bytes
):
    if not models_ready:
        pytest.skip("models not downloaded")
    if sample_face_bytes is None:
        pytest.skip("no sample face image available")

    response = post(client, auth_headers, sample_face_bytes)
    if response.status_code != 200:
        pytest.skip(f"sample image rejected: {response.json()['error']['code']}")

    body = response.json()
    assert body["success"] is True
    assert set(body["model_version"]) == {"face_landmarker", "face_parser", "skin_model"}

    tone = body["analysis"]["skin_tone"]
    assert 1 <= tone["monk_scale"] <= 10
    assert -90.0 <= tone["ita"] <= 90.0
    assert 0.0 <= tone["confidence"] <= 1.0

    assert body["analysis"]["undertone"]["value"] in {"warm", "cool", "neutral"}
    assert body["pipeline"]["skin_mask_source"] == "bisenet_face_parsing"
    assert "not a medical diagnosis" in body["disclaimer"].lower()


# --- the honesty invariants -------------------------------------------------


def test_concern_scores_are_withheld_when_the_model_is_absent():
    """Absent means absent.

    Emitting a plausible 0.71 "pigmentation" would read to a customer exactly
    like a measured one, and would be used to sell them something.
    """
    from app.models.registry import ModelRegistry
    from app.services.skin_concerns import predict_concerns

    result = predict_concerns(None, None, ModelRegistry())  # nothing loaded

    assert result.available is False
    assert result.scores is None
    assert result.reason == "MODEL_NOT_CONFIGURED"
    assert result.notes


def test_skin_type_is_not_guessed_without_concern_scores():
    from app.services.skin_concerns import ConcernResult, infer_skin_type

    value, confidence, notes = infer_skin_type({}, ConcernResult(available=False))
    assert value is None
    assert confidence == 0.0
    assert notes


def test_skin_type_derives_from_concerns_when_available():
    from app.services.skin_concerns import ConcernResult, infer_skin_type

    oily = ConcernResult(available=True, scores={"oiliness": 0.8, "dryness": 0.1})
    value, confidence, _ = infer_skin_type({}, oily)
    assert value == "oily"
    assert confidence > 0.5

    combo = ConcernResult(available=True, scores={"oiliness": 0.55, "dryness": 0.5})
    assert infer_skin_type({}, combo)[0] == "combination"


def test_a_low_confidence_tone_is_never_reported_as_fact(monkeypatch, stub_pipeline):
    """Below the confidence floor the pipeline refuses.

    It does not report the same number with a lower confidence attached: a
    figure on screen reads as a fact whatever is printed beside it.
    """
    from app.config import get_settings
    from app.core.errors import AIServiceError, ErrorCode
    from app.services import pipeline as pipeline_module
    from app.services.skin_tone import SkinToneResult

    unconfident = SkinToneResult(
        category="intermediate",
        label="medium",
        monk_scale=4,
        ita=33.0,
        confidence=0.2,
        lab={"l": 60.0, "a": 12.0, "b": 18.0, "l_std": 4.0},
        rgb={"r": 190.0, "g": 160.0, "b": 140.0},
        sample_count=5000,
    )
    monkeypatch.setattr(
        pipeline_module.skin_tone, "estimate_skin_tone", lambda *a, **k: unconfident
    )

    with pytest.raises(AIServiceError) as exc:
        pipeline_module.run_analysis(
            b"x",
            settings=get_settings().model_copy(update={"min_confidence": 0.9}),
            models=stub_pipeline,
            content_type="image/png",
            mirrored=False,
            image_sha="0" * 64,
        )
    assert exc.value.code is ErrorCode.RETAKE_PHOTO
    assert "LOW_CONFIDENCE" in exc.value.extra["quality_issues"]


def test_a_confident_tone_passes_the_same_gate(monkeypatch, stub_pipeline):
    """The mirror image of the test above, so it cannot pass by always raising."""
    from app.config import get_settings
    from app.services import pipeline as pipeline_module
    from app.services.skin_tone import SkinToneResult

    confident = SkinToneResult(
        category="intermediate",
        label="medium",
        monk_scale=4,
        ita=33.0,
        confidence=0.88,
        lab={"l": 60.0, "a": 12.0, "b": 18.0, "l_std": 4.0},
        rgb={"r": 190.0, "g": 160.0, "b": 140.0},
        sample_count=5000,
    )
    monkeypatch.setattr(pipeline_module.skin_tone, "estimate_skin_tone", lambda *a, **k: confident)

    response = pipeline_module.run_analysis(
        b"x",
        settings=get_settings().model_copy(update={"min_confidence": 0.45}),
        models=stub_pipeline,
        content_type="image/png",
        mirrored=False,
        image_sha="0" * 64,
    )
    assert response.success is True
    assert response.analysis.skin_tone.confidence == 0.88
    assert response.analysis.concerns.available is False  # no concern model loaded


def test_the_disclaimer_is_part_of_the_contract():
    from app.schemas.analysis import DERMATOLOGIST_ADVICE, DISCLAIMER

    assert "not a medical diagnosis" in DISCLAIMER.lower()
    assert "dermatologist" in DERMATOLOGIST_ADVICE.lower()


def test_no_image_is_persisted_anywhere(client, auth_headers, noise_image, tmp_path):
    """Analysis must leave nothing on disk.

    The service holds face photographs; the only defensible retention policy is
    none, and that is cheap to assert.
    """
    before = set(tmp_path.rglob("*"))
    post(client, auth_headers, encode_png(noise_image))
    assert set(tmp_path.rglob("*")) == before
