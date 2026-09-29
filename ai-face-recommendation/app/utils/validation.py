"""Request-level validation helpers."""

from __future__ import annotations

from app.core.errors import AIServiceError, ErrorCode


def require_feature(enabled: bool, feature: str) -> None:
    if not enabled:
        raise AIServiceError(
            ErrorCode.FEATURE_DISABLED,
            f"The {feature} feature is disabled on this deployment.",
        )


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalise_confidence(value: float) -> float:
    """Round to 2dp and clamp to 0..1.

    Confidences are estimates, and reporting them to 15 decimal places implies
    a precision the underlying heuristics do not have.
    """
    return round(clamp(float(value), 0.0, 1.0), 2)
