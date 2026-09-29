"""Face detection and landmarks via MediaPipe Face Landmarker.

Produces the 478-point mesh plus head pose. Everything downstream — the
quality gate, the skin mask, the region sampling — is derived from this, so it
is the one model the service genuinely cannot run without.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.core.errors import AIServiceError, ErrorCode
from app.core.logging import inference_timer
from app.models.registry import ModelRegistry

# Landmark index groups from the MediaPipe canonical face mesh.
# Sampling regions are chosen to be flat, centrally-lit and free of the
# features that would contaminate a skin measurement.
LEFT_CHEEK = [50, 101, 118, 117, 111, 116, 123, 147, 187, 205, 36, 142]
RIGHT_CHEEK = [280, 330, 347, 346, 340, 345, 352, 376, 411, 425, 266, 371]
FOREHEAD = [10, 67, 69, 104, 108, 151, 337, 299, 333, 297, 338, 109]
NOSE_BRIDGE = [6, 197, 195, 5, 4]
CHIN = [152, 148, 176, 149, 150, 136, 172, 377, 400, 378, 379, 365, 397]

# Excluded from any skin measurement.
LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
# fmt: off
# These are index tables, not code. One number per line would make them
# impossible to check against the MediaPipe mesh diagram.
OUTER_LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267,
              0, 37, 39, 40, 185]
NOSTRILS = [1, 2, 98, 327, 97, 326]

# Oval bounding the face, used as the outer limit of the skin mask.
FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
]
# fmt: on


@dataclass
class HeadPose:
    yaw: float
    pitch: float
    roll: float


@dataclass
class FaceResult:
    """One detected face, in pixel coordinates for the processed image."""

    landmarks: np.ndarray  # (N, 2) float32, pixel coords
    bbox: tuple[int, int, int, int]  # x, y, w, h
    pose: HeadPose
    face_count: int
    image_shape: tuple[int, int]  # h, w

    @property
    def face_area_ratio(self) -> float:
        h, w = self.image_shape
        _, _, bw, bh = self.bbox
        return (bw * bh) / float(max(1, h * w))

    def points(self, indices: list[int]) -> np.ndarray:
        valid = [i for i in indices if 0 <= i < len(self.landmarks)]
        return self.landmarks[valid]


def _pose_from_matrix(matrix: np.ndarray) -> HeadPose:
    """Extract yaw/pitch/roll (degrees) from MediaPipe's 4x4 transform."""
    r = matrix[:3, :3]
    sy = math.sqrt(r[0, 0] ** 2 + r[1, 0] ** 2)
    if sy > 1e-6:
        pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
        yaw = math.degrees(math.atan2(-r[2, 0], sy))
        roll = math.degrees(math.atan2(r[1, 0], r[0, 0]))
    else:  # gimbal-locked
        pitch = math.degrees(math.atan2(-r[1, 2], r[1, 1]))
        yaw = math.degrees(math.atan2(-r[2, 0], sy))
        roll = 0.0
    return HeadPose(yaw=round(yaw, 2), pitch=round(pitch, 2), roll=round(roll, 2))


def _pose_from_landmarks(points: np.ndarray) -> HeadPose:
    """Geometric fallback when no transformation matrix is returned.

    Rough but adequate: roll from the eye-line angle, yaw from how far the
    nose sits from the midpoint between the eyes, pitch from the nose's
    vertical position between brow and chin.
    """
    try:
        left_eye = points[33]
        right_eye = points[263]
        nose = points[1]
        chin = points[152]
        brow = points[10]
    except IndexError:
        return HeadPose(0.0, 0.0, 0.0)

    roll = math.degrees(math.atan2(right_eye[1] - left_eye[1], right_eye[0] - left_eye[0]))

    eye_mid_x = (left_eye[0] + right_eye[0]) / 2.0
    eye_span = max(1e-3, abs(right_eye[0] - left_eye[0]))
    yaw = math.degrees(math.atan((nose[0] - eye_mid_x) / eye_span)) * 2.0

    face_height = max(1e-3, abs(chin[1] - brow[1]))
    expected = brow[1] + face_height * 0.5
    pitch = math.degrees(math.atan((nose[1] - expected) / face_height)) * 2.0

    return HeadPose(yaw=round(yaw, 2), pitch=round(pitch, 2), roll=round(roll, 2))


def detect_face(image_bgr: np.ndarray, registry: ModelRegistry) -> FaceResult:
    """Detect exactly one usable face, or raise a specific AIServiceError."""
    slot = registry.face_landmarker
    if not slot.available:
        raise AIServiceError(
            ErrorCode.MODEL_UNAVAILABLE,
            "Face analysis is unavailable: the face landmarker model is not loaded.",
            extra={"model": slot.describe()},
        )

    import mediapipe as mp

    rgb = image_bgr[..., ::-1].copy()  # BGR -> RGB, contiguous for mediapipe
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    with inference_timer("face_landmarker"):
        result = slot.handle.detect(mp_image)

    faces = getattr(result, "face_landmarks", None) or []
    if not faces:
        raise AIServiceError(
            ErrorCode.NO_FACE,
            "No face was detected. Please upload a clear, front-facing photo.",
        )
    if len(faces) > 1:
        raise AIServiceError(
            ErrorCode.MULTIPLE_FACES,
            f"{len(faces)} faces were detected. Please upload a photo of just one person.",
        )

    h, w = image_bgr.shape[:2]
    pts = np.array([[lm.x * w, lm.y * h] for lm in faces[0]], dtype=np.float32)

    # The transformation matrix is the accurate source of head pose; the
    # landmark geometry is only used when MediaPipe returns no matrix.
    matrices = getattr(result, "facial_transformation_matrixes", None) or []
    pose = _pose_from_matrix(np.array(matrices[0])) if matrices else _pose_from_landmarks(pts)

    xs, ys = pts[:, 0], pts[:, 1]
    x0, y0 = int(max(0, xs.min())), int(max(0, ys.min()))
    x1, y1 = int(min(w, xs.max())), int(min(h, ys.max()))

    return FaceResult(
        landmarks=pts,
        bbox=(x0, y0, max(1, x1 - x0), max(1, y1 - y0)),
        pose=pose,
        face_count=len(faces),
        image_shape=(h, w),
    )
