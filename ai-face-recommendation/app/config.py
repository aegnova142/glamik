"""Configuration, read once from the environment.

Nothing here is hardcoded to a machine, a traffic level or a deployment.
Worker counts, thresholds, timeouts and limits are all environment driven so
the same image runs on a laptop and on a 32-core box without code changes.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_NAME = "glamirk-ai"
SERVICE_VERSION = "1.0.0"
API_PREFIX = "/v1"

# ---------------------------------------------------------------------------
# Model versions.
#
# These are part of the cache key, so bumping a version here automatically
# invalidates every cached analysis produced by the previous one. That is the
# whole point: a model change must never be served stale results.
# ---------------------------------------------------------------------------
FACE_LANDMARKER_VERSION = "mediapipe-facelandmarker-v1.0.0"
FACE_PARSER_VERSION = "bisenet-v1.0.0"
SKIN_MODEL_VERSION = "skin-v1.0.0"
PIPELINE_VERSION = "pipeline-v1.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- service ---
    host: str = "0.0.0.0"
    port: int = 8001
    environment: str = "development"
    log_level: str = "INFO"
    log_json: bool = True
    # Gunicorn worker count. Recommended CPU/2, but never assumed — the
    # deployment sets it.
    web_concurrency: int = Field(default=2, ge=1)

    # --- auth ---
    internal_api_key: str = "change-this-internal-key"
    internal_api_key_header: str = "X-Internal-AI-Key"

    # --- Node backend ---
    # Glamirk's Node backend listens on 3000.
    node_backend_url: str = "http://localhost:3000"
    node_connect_timeout: float = 3.0
    node_read_timeout: float = 10.0
    node_write_timeout: float = 10.0
    node_total_timeout: float = 15.0
    node_max_connections: int = 32
    node_max_retries: int = 2

    # --- redis ---
    redis_url: str | None = "redis://localhost:6379"
    cache_ttl_seconds: int = 3600
    rate_limit_per_minute: int = 60
    rate_limit_enabled: bool = True

    # --- uploads ---
    max_upload_mb: int = 5
    max_image_dimension: int = 640
    # Try-on renders an image for the customer to look at, rather than taking a
    # measurement from it, so it works at a higher resolution than analysis —
    # 640px makeup looks visibly soft when displayed.
    tryon_max_dimension: int = 1024
    # Decompression-bomb ceiling on DECODED pixels, independent of file size.
    max_decoded_pixels: int = 40_000_000

    # --- analysis thresholds ---
    # Below this, the service returns a retake/uncertain response instead of
    # presenting a guess as a measurement.
    min_confidence: float = Field(default=0.45, ge=0.0, le=1.0)
    max_yaw_degrees: float = 15.0
    max_pitch_degrees: float = 15.0

    # --- observability ---
    sentry_dsn: str | None = None
    metrics_enabled: bool = True

    # --- CORS (server-to-server by default: no browser origin) ---
    cors_origins: list[str] = Field(default_factory=list)

    # --- models ---
    model_dir: Path = Path("./models")

    # --- phases ---
    # Phase 2+ endpoints exist in the codebase but stay disabled until the
    # phase is approved; they return NOT_IMPLEMENTED while false.
    enable_recommendation: bool = False
    enable_tryon: bool = False

    @field_validator("log_level")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def face_landmarker_path(self) -> Path:
        return self.model_dir / "face_landmarker" / "face_landmarker.task"

    @property
    def face_parser_path(self) -> Path:
        return self.model_dir / "face_parser" / "face_parser.onnx"

    @property
    def skin_model_path(self) -> Path:
        return self.model_dir / "skin" / "skin_concerns.onnx"

    def config_warnings(self) -> list[str]:
        issues: list[str] = []
        if self.is_production and self.internal_api_key == "change-this-internal-key":
            issues.append(
                "INTERNAL_API_KEY is still the default — this service is effectively "
                "unauthenticated."
            )
        if not self.redis_url:
            issues.append("REDIS_URL is unset — caching and rate limiting are disabled.")
        return issues


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
