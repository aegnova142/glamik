"""Health, readiness, authentication and the error envelope."""

from __future__ import annotations

from app.config import SERVICE_NAME, SERVICE_VERSION
from tests.conftest import encode_png, upload


def test_health_is_ok(client):
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
    }


def test_health_needs_no_auth(client):
    # An orchestrator probing liveness holds no credentials.
    assert client.get("/v1/health").status_code == 200


def test_ready_reports_every_model(client):
    response = client.get("/v1/ready")
    assert response.status_code in (200, 503)
    body = response.json()
    names = {m["name"] for m in body["checks"]["models"]}
    assert names == {"face_landmarker", "face_parser", "skin_model"}


def test_ready_is_503_while_a_required_model_is_missing(client):
    """The core readiness contract.

    An instance that cannot analyse must not be told it is ready, or a load
    balancer will keep sending it work it can only fail.
    """
    response = client.get("/v1/ready")
    body = response.json()
    if body["checks"]["missing_required_models"]:
        assert response.status_code == 503
        assert body["ready"] is False
    else:
        assert response.status_code == 200
        assert body["ready"] is True


def test_ready_reports_model_versions(client):
    versions = client.get("/v1/ready").json()["model_version"]
    assert set(versions) == {"face_landmarker", "face_parser", "skin_model"}
    assert all(isinstance(v, str) and v for v in versions.values())


def test_ready_does_not_leak_the_key(client):
    body = client.get("/v1/ready").text
    assert "test-internal-key" not in body
    assert "INTERNAL_API_KEY" not in body


def test_metrics_exposed_in_prometheus_format(client):
    response = client.get("/v1/metrics")
    assert response.status_code == 200
    assert "glamirk_ai_requests_total" in response.text


def test_analyze_requires_the_internal_key(client, flat_image):
    response = client.post("/v1/analyze", files=upload(encode_png(flat_image)))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_analyze_rejects_a_wrong_key(client, flat_image):
    response = client.post(
        "/v1/analyze",
        files=upload(encode_png(flat_image)),
        headers={"X-Internal-AI-Key": "definitely-not-the-key"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_recommend_is_phase_2_and_disabled(client, auth_headers):
    response = client.post(
        "/v1/recommend",
        json={"analysis": {"skin_tone_category": "intermediate"}},
        headers=auth_headers,
    )
    # Not 200-with-empty-results: an empty list would read as "nothing suits you".
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"


def test_tryon_is_phase_3_and_disabled(client, auth_headers, flat_image):
    response = client.post(
        "/v1/tryon",
        files=upload(encode_png(flat_image)),
        data={"layers": "[]"},
        headers=auth_headers,
    )
    assert response.status_code == 501
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"


def test_phase_2_and_3_require_auth_too(client):
    assert client.post("/v1/recommend", json={}).status_code == 401
    assert client.post("/v1/tryon").status_code == 401


def test_unknown_route_uses_the_error_envelope(client):
    response = client.get("/v1/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert "code" in body["error"]


def test_responses_carry_a_request_id(client):
    assert client.get("/v1/health").headers.get("X-Request-Id")
