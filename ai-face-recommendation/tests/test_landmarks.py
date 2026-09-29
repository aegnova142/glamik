"""Face detection, landmark geometry and head pose."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.core.errors import AIServiceError, ErrorCode
from app.models.registry import ModelRegistry
from app.services import face_landmarks
from app.services.face_landmarks import (
    CHIN,
    FACE_OVAL,
    FOREHEAD,
    LEFT_CHEEK,
    LEFT_EYE,
    OUTER_LIPS,
    RIGHT_CHEEK,
    RIGHT_EYE,
    FaceResult,
    HeadPose,
)


def test_no_landmarker_is_reported_not_approximated(noise_image):
    """Without the model there is no geometric stand-in — it raises."""
    with pytest.raises(AIServiceError) as exc:
        face_landmarks.detect_face(noise_image, ModelRegistry())
    assert exc.value.code is ErrorCode.MODEL_UNAVAILABLE


def test_no_face_in_noise(noise_image, client, registry, landmarker_available):
    if not landmarker_available:
        pytest.skip("face landmarker model not downloaded")

    with pytest.raises(AIServiceError) as exc:
        face_landmarks.detect_face(noise_image, registry)
    assert exc.value.code is ErrorCode.NO_FACE


def test_sampling_regions_do_not_overlap_features():
    """Cheeks, forehead and chin must share no index with eyes or lips.

    An eye or lip landmark inside a "skin" region would pull every colour
    measurement toward iris or lipstick colour.
    """
    skin = set(LEFT_CHEEK) | set(RIGHT_CHEEK) | set(FOREHEAD) | set(CHIN)
    features = set(LEFT_EYE) | set(RIGHT_EYE) | set(OUTER_LIPS)
    assert not (skin & features)


def test_region_indices_are_within_the_mesh():
    """478 points in the MediaPipe mesh; an index past that would silently drop."""
    for region in (LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN, FACE_OVAL, LEFT_EYE, RIGHT_EYE):
        assert all(0 <= i < 478 for i in region)


def _face(pose: HeadPose, bbox=(100, 100, 200, 240)) -> FaceResult:
    return FaceResult(
        landmarks=np.zeros((478, 2), dtype=np.float32),
        bbox=bbox,
        pose=pose,
        face_count=1,
        image_shape=(480, 480),
    )


def test_face_area_ratio_is_relative_to_the_frame():
    face = _face(HeadPose(0, 0, 0), bbox=(0, 0, 240, 240))
    assert math.isclose(face.face_area_ratio, 0.25, rel_tol=1e-6)


def test_points_drops_out_of_range_indices():
    face = _face(HeadPose(0, 0, 0))
    assert len(face.points([0, 1, 9999])) == 2


def test_pose_from_identity_matrix_is_level():
    pose = face_landmarks._pose_from_matrix(np.eye(4, dtype=np.float32))
    assert abs(pose.yaw) < 1e-3
    assert abs(pose.pitch) < 1e-3
    assert abs(pose.roll) < 1e-3


def test_pose_from_matrix_detects_a_turned_head():
    angle = math.radians(30.0)
    matrix = np.eye(4, dtype=np.float32)
    # Rotation about the vertical axis — a head turned to one side.
    matrix[:3, :3] = np.array(
        [
            [math.cos(angle), 0.0, math.sin(angle)],
            [0.0, 1.0, 0.0],
            [-math.sin(angle), 0.0, math.cos(angle)],
        ]
    )
    pose = face_landmarks._pose_from_matrix(matrix)
    assert abs(abs(pose.yaw) - 30.0) < 1.0


def test_pose_falls_back_to_geometry_without_a_matrix():
    """The fallback must produce usable angles, not zeros.

    Silently returning 0,0,0 would mean a profile shot passed the pose gate.
    """
    points = np.zeros((478, 2), dtype=np.float32)
    points[33] = (180.0, 200.0)  # left eye
    points[263] = (300.0, 200.0)  # right eye
    points[1] = (275.0, 250.0)  # nose, pulled toward the right eye
    points[152] = (240.0, 360.0)  # chin
    points[10] = (240.0, 120.0)  # brow

    pose = face_landmarks._pose_from_landmarks(points)
    assert abs(pose.yaw) > 5.0, "an off-centre nose must register as yaw"
    assert abs(pose.roll) < 1.0, "a level eye-line must register as no roll"
