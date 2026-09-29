"""Internal service authentication and rate limiting.

The Node backend is the only trusted caller. It presents a shared key in
`X-Internal-AI-Key`. mTLS is a supported future deployment option, handled at
the proxy rather than here, so local development needs no certificates.
"""

from __future__ import annotations

import secrets

from fastapi import Header, Request

from app.core.errors import AIServiceError, ErrorCode


def verify_internal_key(presented: str | None, expected: str) -> None:
    """Constant-time comparison.

    A plain `==` returns early on the first differing byte, which leaks the
    key one character at a time to anyone who can measure response latency.
    """
    if not presented:
        raise AIServiceError(ErrorCode.UNAUTHORIZED, "Missing internal service credentials.")
    if not secrets.compare_digest(presented, expected):
        raise AIServiceError(ErrorCode.UNAUTHORIZED, "Invalid internal service credentials.")


async def require_internal_key(
    request: Request,
    x_internal_ai_key: str | None = Header(default=None, alias="X-Internal-AI-Key"),
) -> None:
    """FastAPI dependency guarding every protected endpoint."""
    settings = request.app.state.ai.settings
    verify_internal_key(x_internal_ai_key, settings.internal_api_key)

    limiter = getattr(request.app.state.ai, "cache", None)
    if settings.rate_limit_enabled and limiter is not None:
        # Keyed by caller IP. Node is the only caller, so in practice this is a
        # blunt safety net against a runaway loop rather than per-user limiting
        # — real per-user limits belong at the Node layer, which knows who the
        # user is.
        client = request.client.host if request.client else "unknown"
        allowed = await limiter.allow_request(f"rate:{client}", settings.rate_limit_per_minute)
        if not allowed:
            raise AIServiceError(
                ErrorCode.RATE_LIMITED,
                "Too many requests. Please retry shortly.",
            )
