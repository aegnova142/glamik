"""Phase 3 virtual try-on.

The rendering functions are tested directly against synthetic class maps rather
than through the HTTP route, because the route needs a real face parser that is
a separate download. The properties under test — teeth excluded, L* preserved,
edges feathered, nothing silently skipped — are properties of the rendering,
not of the model.
"""

from __future__ import annotations

import base64
import json

import numpy as np
import pytest

from app.core.errors import AIServiceError, ErrorCode
from app.models.registry import ModelRegistry, ModelStatus
from app.schemas.tryon import (
    LAYER_ORDER,
    MAX_LAYERS,
    PHASE_3_SCOPE,
    Finish,
    MakeupLayer,
    MakeupLayerType,
    TryOnRequest,
)
from app.services import tryon_engine
from app.services.face_landmarks import FaceResult, HeadPose
from app.utils.color import bgr_to_lab_true, hex_to_lab, lab_true_to_bgr
from tests.conftest import encode_png, upload

SIZE = 200
LIPSTICK_HEX = "#b4004e"


def _face() -> FaceResult:
    """A face whose cheek landmarks land inside the synthetic image."""
    points = np.zeros((478, 2), dtype=np.float32)
    rng = np.random.default_rng(5)
    points[:] = rng.uniform(40, 160, size=(478, 2))
    return FaceResult(
        landmarks=points,
        bbox=(40, 40, 120, 130),
        pose=HeadPose(0.0, 0.0, 0.0),
        face_count=1,
        image_shape=(SIZE, SIZE),
    )


def _class_map(with_teeth: bool = True) -> np.ndarray:
    """A synthetic parse: skin everywhere, a lip band, teeth inside it."""
    class_map = np.full((SIZE, SIZE), tryon_engine.CLASS_SKIN, dtype=np.uint8)
    class_map[120:150, 60:140] = tryon_engine.CLASS_UPPER_LIP
    class_map[150:175, 60:140] = tryon_engine.CLASS_LOWER_LIP
    if with_teeth:
        class_map[140:155, 80:120] = tryon_engine.CLASS_MOUTH_INTERIOR
    return class_map


def _image() -> np.ndarray:
    """Textured mid-tone skin, so L* variation is real and measurable."""
    rng = np.random.default_rng(9)
    base = np.full((SIZE, SIZE, 3), (150, 165, 190), dtype=np.int16)
    base += rng.integers(-10, 11, size=base.shape, dtype=np.int16)
    return np.clip(base, 0, 255).astype(np.uint8)


def _loaded_registry() -> ModelRegistry:
    registry = ModelRegistry()
    for slot in registry.slots():
        slot.status = ModelStatus.LOADED
        slot.handle = object()
    return registry


class _Parsed:
    """Stands in for a real `ParseResult`."""

    def __init__(self, class_map: np.ndarray) -> None:
        self.class_map = class_map
        self.skin_mask = np.where(class_map == tryon_engine.CLASS_SKIN, 255, 0).astype(np.uint8)
        self.skin_pixels = int(np.count_nonzero(self.skin_mask))


@pytest.fixture
def parsed_face(monkeypatch):
    """Patch face parsing with a synthetic segmentation.

    The real parser is a separate download; what these tests are about is what
    the renderer does with a class map, not how the class map was produced.
    Returns a setter so a test can swap in a different segmentation.
    """

    def _use(class_map: np.ndarray) -> None:
        monkeypatch.setattr(
            tryon_engine.face_parser, "parse_face", lambda *a, **k: _Parsed(class_map)
        )

    _use(_class_map())
    return _use


# --- the lip mask -----------------------------------------------------------


def test_lip_mask_excludes_the_mouth_interior():
    """Teeth must never be painted.

    This is the single most visible way a try-on gives itself away, and it is
    exactly what a landmark lip *contour* cannot avoid — the contour of an open
    smile contains the teeth.
    """
    mask = tryon_engine._lip_mask(_class_map(with_teeth=True))
    teeth = _class_map(with_teeth=True) == tryon_engine.CLASS_MOUTH_INTERIOR
    assert np.count_nonzero(mask[teeth]) == 0


def test_lip_mask_covers_both_lips():
    class_map = _class_map(with_teeth=False)
    mask = tryon_engine._lip_mask(class_map)
    assert np.count_nonzero(mask[class_map == tryon_engine.CLASS_UPPER_LIP]) > 0
    assert np.count_nonzero(mask[class_map == tryon_engine.CLASS_LOWER_LIP]) > 0


def test_lip_mask_does_not_leak_onto_skin():
    class_map = _class_map()
    mask = tryon_engine._lip_mask(class_map)
    assert np.count_nonzero(mask[class_map == tryon_engine.CLASS_SKIN]) == 0


# --- the blush mask ---------------------------------------------------------


def test_blush_mask_is_confined_to_parsed_skin():
    """Landmarks say where the cheek is; the parser says what is actually skin.

    Without the intersection, blush lands on a lock of hair crossing the
    cheekbone or on the rim of a pair of glasses.
    """
    class_map = _class_map()
    class_map[:, :] = tryon_engine.CLASS_SKIN
    class_map[80:120, 40:80] = 17  # hair falling across the left cheek

    mask = tryon_engine._blush_mask(class_map, _face(), (SIZE, SIZE))
    assert np.count_nonzero(mask[class_map == 17]) == 0


# --- colour application -----------------------------------------------------


def test_lightness_is_never_modified_by_colouring():
    """The core rendering constraint.

    L* carries the skin's shading and texture. Replacing it is what makes a
    try-on look like a flat sticker, so recolouring must leave it alone.
    """
    image = _image()
    alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    alpha[120:175, 60:140] = 1.0
    target = hex_to_lab(LIPSTICK_HEX)
    assert target is not None

    before = bgr_to_lab_true(image)[..., 0]
    painted = tryon_engine._apply_colour(image, alpha, target, 0.9)
    after = bgr_to_lab_true(painted)[..., 0]

    region = alpha > 0.5
    drift = (after - before)[region]

    # Two separate claims.
    #
    # The per-pixel bound is residual 8-bit quantisation, plus whatever the
    # gamut-fitting loop could not quite reconcile within its iteration budget.
    #
    # The mean bound is the one that actually matters, and it is why the
    # gamut fitting exists at all. Blending straight to a vivid red and letting
    # the conversion clamp produced a *systematic* -1.8 L* darkening here — no
    # individual pixel looked wrong, but every lip rendered darker than the
    # face around it. A bias shows up in the mean where it hides in the max.
    assert np.max(np.abs(drift)) <= 4.0
    assert abs(float(drift.mean())) < 0.25


def test_colour_actually_changes_the_chroma_channels():
    """The mirror of the test above: preserving L* must not mean doing nothing."""
    image = _image()
    alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    alpha[120:175, 60:140] = 1.0
    target = hex_to_lab(LIPSTICK_HEX)
    assert target is not None

    painted = tryon_engine._apply_colour(image, alpha, target, 0.9)
    region = alpha > 0.5
    before_a = bgr_to_lab_true(image)[..., 1][region].mean()
    after_a = bgr_to_lab_true(painted)[..., 1][region].mean()
    assert abs(after_a - before_a) > 5.0


def test_pixels_outside_the_mask_are_untouched():
    image = _image()
    alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    alpha[120:175, 60:140] = 1.0
    target = hex_to_lab(LIPSTICK_HEX)
    assert target is not None

    painted = tryon_engine._apply_colour(image, alpha, target, 0.9)
    outside = alpha == 0.0
    assert np.array_equal(painted[outside], image[outside])


def test_zero_intensity_is_a_no_op():
    image = _image()
    alpha = np.ones((SIZE, SIZE), dtype=np.float32)
    target = hex_to_lab(LIPSTICK_HEX)
    assert target is not None

    painted = tryon_engine._apply_colour(image, alpha, target, 0.0)
    assert np.max(np.abs(painted.astype(int) - image.astype(int))) <= 2


# --- feathering -------------------------------------------------------------


def test_feathering_produces_a_soft_edge():
    """A hard mask boundary reads as fake regardless of how good the colour is."""
    mask = np.zeros((SIZE, SIZE), dtype=np.uint8)
    mask[80:120, 80:120] = 255

    alpha = tryon_engine._feather(mask, sigma=4.0)
    intermediate = np.count_nonzero((alpha > 0.05) & (alpha < 0.95))
    assert intermediate > 0, "feathering must create partially-transparent edge pixels"
    assert alpha.max() <= 1.0 and alpha.min() >= 0.0


def test_feathering_keeps_the_interior_opaque():
    mask = np.zeros((SIZE, SIZE), dtype=np.uint8)
    mask[60:140, 60:140] = 255
    alpha = tryon_engine._feather(mask, sigma=3.0)
    assert alpha[100, 100] > 0.95


# --- finishes ---------------------------------------------------------------


def test_gloss_is_a_local_highlight_not_a_global_lift():
    """Gloss must brighten a few specular pixels, not the whole mouth."""
    image = _image()
    alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    alpha[120:175, 60:140] = 1.0

    glossed = tryon_engine._apply_finish(image, alpha, Finish.GLOSS)
    region = alpha > 0.5
    before = bgr_to_lab_true(image)[..., 0]
    after = bgr_to_lab_true(glossed)[..., 0]

    lifted = (after - before) > 1.0
    lifted_fraction = np.count_nonzero(lifted & region) / np.count_nonzero(region)
    assert 0.0 < lifted_fraction < 0.5, "gloss must be localised, not a wash"


def test_satin_finish_leaves_lightness_alone():
    image = _image()
    alpha = np.ones((SIZE, SIZE), dtype=np.float32)
    assert np.array_equal(tryon_engine._apply_finish(image, alpha, Finish.SATIN), image)


def test_matte_does_not_brighten():
    image = _image()
    alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    alpha[120:175, 60:140] = 1.0

    matted = tryon_engine._apply_finish(image, alpha, Finish.MATTE)
    region = alpha > 0.5
    before = bgr_to_lab_true(image)[..., 0][region].mean()
    after = bgr_to_lab_true(matted)[..., 0][region].mean()
    assert after <= before + 0.5


# --- layer orchestration ----------------------------------------------------


def _request(*layers: MakeupLayer, **kwargs) -> TryOnRequest:
    return TryOnRequest(layers=list(layers), **kwargs)


def test_lipstick_and_blush_both_render(parsed_face):
    response = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
            MakeupLayer(type=MakeupLayerType.BLUSH, color_hex="#e08a8a"),
        ),
        _face(),
        _loaded_registry(),
    )
    applied = {layer.type for layer in response.applied_layers}
    assert applied == {MakeupLayerType.LIPSTICK, MakeupLayerType.BLUSH}
    assert response.image_base64


def test_out_of_scope_layers_are_rejected_by_name_not_dropped(parsed_face):
    """Silently ignoring a requested layer is indistinguishable from applying
    one that had no visible effect."""
    with pytest.raises(AIServiceError) as exc:
        tryon_engine.apply_makeup(
            _image(),
            _request(
                MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
                MakeupLayer(type=MakeupLayerType.EYESHADOW, color_hex="#553377"),
            ),
            _face(),
            _loaded_registry(),
        )
    assert exc.value.code is ErrorCode.NOT_IMPLEMENTED
    assert "eyeshadow" in exc.value.extra["unsupported_layers"]


def test_a_layer_with_no_visible_region_is_reported_not_hidden(parsed_face):
    """A lipstick layer on a face with no visible lips must say so."""
    parsed_face(np.full((SIZE, SIZE), tryon_engine.CLASS_SKIN, dtype=np.uint8))

    response = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
            MakeupLayer(type=MakeupLayerType.BLUSH, color_hex="#e08a8a"),
        ),
        _face(),
        _loaded_registry(),
    )

    assert {layer.type for layer in response.applied_layers} == {MakeupLayerType.BLUSH}
    assert any("lipstick" in note for note in response.notes)


def test_nothing_renderable_fails_rather_than_returning_the_original(parsed_face):
    """An unmodified photo returned as a 200 is a lie dressed up as success."""
    parsed_face(np.zeros((SIZE, SIZE), dtype=np.uint8))  # all background

    with pytest.raises(AIServiceError) as exc:
        tryon_engine.apply_makeup(
            _image(),
            _request(MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX)),
            _face(),
            _loaded_registry(),
        )
    assert exc.value.code is ErrorCode.TRYON_FAILED


def test_paint_order_is_fixed_not_caller_supplied(parsed_face):
    """Blush must be painted before lipstick whichever order they arrive in."""
    assert LAYER_ORDER.index(MakeupLayerType.BLUSH) < LAYER_ORDER.index(MakeupLayerType.LIPSTICK)

    reversed_request = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
            MakeupLayer(type=MakeupLayerType.BLUSH, color_hex="#e08a8a"),
        ),
        _face(),
        _loaded_registry(),
    )
    natural_request = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(type=MakeupLayerType.BLUSH, color_hex="#e08a8a"),
            MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
        ),
        _face(),
        _loaded_registry(),
    )
    assert reversed_request.image_base64 == natural_request.image_base64


def test_missing_parser_refuses_rather_than_using_a_landmark_polygon():
    # Deliberately *not* using the parsed_face fixture: the real parse_face is
    # what raises here, and that is the behaviour under test.
    registry = ModelRegistry()  # nothing loaded
    with pytest.raises(AIServiceError) as exc:
        tryon_engine.apply_makeup(
            _image(),
            _request(MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX)),
            _face(),
            registry,
        )
    assert exc.value.code is ErrorCode.MODEL_NOT_CONFIGURED


def test_original_is_returned_only_when_asked(parsed_face):
    without = tryon_engine.apply_makeup(
        _image(),
        _request(MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX)),
        _face(),
        _loaded_registry(),
    )
    assert without.original_base64 is None

    with_original = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX),
            return_original=True,
        ),
        _face(),
        _loaded_registry(),
    )
    assert with_original.original_base64
    assert with_original.original_base64 != with_original.image_base64


def test_rendered_output_is_decodable_jpeg(parsed_face):
    response = tryon_engine.apply_makeup(
        _image(),
        _request(MakeupLayer(type=MakeupLayerType.LIPSTICK, color_hex=LIPSTICK_HEX)),
        _face(),
        _loaded_registry(),
    )
    raw = base64.b64decode(response.image_base64)
    assert raw.startswith(b"\xff\xd8\xff"), "must be a real JPEG, not arbitrary bytes"
    assert response.mime_type == "image/jpeg"


def test_applied_layers_carry_the_catalog_ids_through(parsed_face):
    response = tryon_engine.apply_makeup(
        _image(),
        _request(
            MakeupLayer(
                type=MakeupLayerType.LIPSTICK,
                color_hex=LIPSTICK_HEX,
                product_id="prod-1",
                variant_id="shade-1",
            )
        ),
        _face(),
        _loaded_registry(),
    )
    layer = response.applied_layers[0]
    assert layer.product_id == "prod-1"
    assert layer.variant_id == "shade-1"
    assert layer.pixels > 0


# --- colour helpers ---------------------------------------------------------


def test_lab_round_trip_is_stable():
    image = _image()
    restored = lab_true_to_bgr(bgr_to_lab_true(image))
    assert np.max(np.abs(restored.astype(int) - image.astype(int))) <= 3


def test_shorthand_hex_is_accepted():
    assert hex_to_lab("#abc") == hex_to_lab("#aabbcc")


def test_invalid_hex_returns_none():
    assert hex_to_lab("not-a-colour") is None
    assert hex_to_lab("#12345") is None


# --- endpoint ---------------------------------------------------------------


def test_tryon_disabled_by_default(client, auth_headers, flat_image):
    response = client.post(
        "/v1/tryon",
        files=upload(encode_png(flat_image)),
        data={"layers": json.dumps([{"type": "lipstick", "color_hex": LIPSTICK_HEX}])},
        headers=auth_headers,
    )
    assert response.status_code == 501
    body = response.json()
    assert body["error"]["code"] == "NOT_IMPLEMENTED"
    # Must not return an unmodified image dressed up as a try-on.
    assert "image_base64" not in body


def test_tryon_rejects_malformed_layers_json(client, auth_headers, flat_image, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_tryon", True)
    response = client.post(
        "/v1/tryon",
        files=upload(encode_png(flat_image)),
        data={"layers": "{not json"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_tryon_rejects_too_many_layers(client, auth_headers, flat_image, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_tryon", True)
    too_many = [{"type": "lipstick", "color_hex": LIPSTICK_HEX}] * (MAX_LAYERS + 1)
    response = client.post(
        "/v1/tryon",
        files=upload(encode_png(flat_image)),
        data={"layers": json.dumps(too_many)},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_tryon_reports_missing_models_when_enabled(client, auth_headers, flat_image, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_tryon", True)
    if client.app.state.ai.models.face_parser.available:
        pytest.skip("face parser present; this covers the unconfigured path")

    response = client.post(
        "/v1/tryon",
        files=upload(encode_png(flat_image)),
        data={"layers": json.dumps([{"type": "lipstick", "color_hex": LIPSTICK_HEX}])},
        headers=auth_headers,
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_NOT_CONFIGURED"


def test_tryon_requires_auth_when_enabled(client, monkeypatch):
    monkeypatch.setattr(client.app.state.ai.settings, "enable_tryon", True)
    assert client.post("/v1/tryon").status_code == 401


def test_phase_3_scope_is_only_lipstick_and_blush():
    assert set(PHASE_3_SCOPE) == {MakeupLayerType.LIPSTICK, MakeupLayerType.BLUSH}
