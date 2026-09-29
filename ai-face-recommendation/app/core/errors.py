"""Error codes and the single failure envelope.

Every failure looks the same:

    {"success": false, "error": {"code": "...", "message": "..."}}

Stack traces never reach a response.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from fastapi import status


class ErrorCode(StrEnum):
    # request shape (distinct from IMAGE_INVALID: the image was fine, the
    # accompanying parameters were not)
    INVALID_REQUEST = "INVALID_REQUEST"

    # upload / decode
    IMAGE_INVALID = "IMAGE_INVALID"
    IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE"

    # quality gate — the user can fix these by taking another photo
    RETAKE_PHOTO = "RETAKE_PHOTO"

    # face
    NO_FACE = "NO_FACE"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    FACE_TOO_SMALL = "FACE_TOO_SMALL"
    FACE_ANGLE_INVALID = "FACE_ANGLE_INVALID"

    # models
    MODEL_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"

    # analysis
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    ANALYSIS_FAILED = "ANALYSIS_FAILED"

    # later phases
    CATALOG_UNAVAILABLE = "CATALOG_UNAVAILABLE"
    RECOMMENDATION_UNAVAILABLE = "RECOMMENDATION_UNAVAILABLE"
    TRYON_FAILED = "TRYON_FAILED"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"

    # transport
    UNAUTHORIZED = "UNAUTHORIZED"
    RATE_LIMITED = "RATE_LIMITED"
    FEATURE_DISABLED = "FEATURE_DISABLED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# 422 means "we received it fine but cannot work with it", distinct from a
# malformed request (400).
_STATUS: dict[ErrorCode, int] = {
    ErrorCode.INVALID_REQUEST: status.HTTP_400_BAD_REQUEST,
    ErrorCode.IMAGE_INVALID: status.HTTP_400_BAD_REQUEST,
    ErrorCode.IMAGE_TOO_LARGE: status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    ErrorCode.RETAKE_PHOTO: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.NO_FACE: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.MULTIPLE_FACES: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.FACE_TOO_SMALL: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.FACE_ANGLE_INVALID: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.LOW_CONFIDENCE: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ErrorCode.MODEL_NOT_CONFIGURED: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.MODEL_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.ANALYSIS_FAILED: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.CATALOG_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.RECOMMENDATION_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.TRYON_FAILED: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.NOT_IMPLEMENTED: status.HTTP_501_NOT_IMPLEMENTED,
    ErrorCode.UNAUTHORIZED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.RATE_LIMITED: status.HTTP_429_TOO_MANY_REQUESTS,
    ErrorCode.FEATURE_DISABLED: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.INTERNAL_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
}


class AIServiceError(Exception):
    """A failure the caller is allowed to see.

    Anything not raised as one of these is treated as unexpected and reported
    as a generic INTERNAL_ERROR, so a bug can never leak internals.
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        http_status: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status or _STATUS.get(code, status.HTTP_400_BAD_REQUEST)
        self.extra = extra or {}

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "success": False,
            "error": {"code": str(self.code), "message": self.message},
        }
        # Quality failures carry the diagnostic block alongside the error, so
        # the caller can tell the user what to fix rather than just "failed".
        payload.update(self.extra)
        return payload


def error_payload(code: ErrorCode, message: str, **extra: Any) -> dict[str, Any]:
    return AIServiceError(code, message, extra=extra).to_payload()


def retake_photo(message: str, quality_issues: list[str]) -> AIServiceError:
    """The canonical 'we will not guess' response.

    Used wherever the input is too poor to measure. Returning a number here
    instead would be worse than useless: the caller cannot tell a confident
    reading from a fabricated one.
    """
    return AIServiceError(ErrorCode.RETAKE_PHOTO, message, extra={"quality_issues": quality_issues})
