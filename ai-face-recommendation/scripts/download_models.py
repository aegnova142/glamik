"""Fetch the model files this service needs.

Only the MediaPipe Face Landmarker has a stable, suitably-licensed public URL.
The face-parsing and skin-concern models are NOT downloaded, because no
suitably-licensed public checkpoint ships with this project.

That is a deliberate outcome, not a gap left to be filled by something
approximate: without those models the service reports MODEL_NOT_CONFIGURED and
refuses to analyse. It does not fall back to a landmark polygon for the skin
mask, and it does not estimate concern scores from image statistics.

    python scripts/download_models.py
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"

FACE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
FACE_LANDMARKER_PATH = MODEL_DIR / "face_landmarker" / "face_landmarker.task"


def download(url: str, target: Path) -> bool:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        print(
            f"  already present: {target.relative_to(ROOT)} "
            f"({target.stat().st_size / 1024:.0f} KB)"
        )
        return True

    print(f"  downloading {target.name} ...")
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
        if not data:
            print("  ERROR: empty response", file=sys.stderr)
            return False
        target.write_bytes(data)
        print(f"  saved {target.relative_to(ROOT)} ({len(data) / 1024:.0f} KB)")
        return True
    # A setup script reports every failure mode the same way and keeps going;
    # there is nothing here worth distinguishing by exception type.
    except Exception as exc:  # noqa: BLE001
        print(f"  ERROR downloading {target.name}: {exc}", file=sys.stderr)
        return False


def main() -> int:
    print("Glamrik AI - model download\n")
    print("Downloadable:")
    ok = download(FACE_LANDMARKER_URL, FACE_LANDMARKER_PATH)

    print("\nREQUIRED but not downloadable - supply these yourself:")
    print()
    print("  models/face_parser/face_parser.onnx")
    print("     BiSeNet-style face parsing, CelebAMask-HQ class indices,")
    print("     (1,3,512,512) float32 NCHW input, (1,19,512,512) logits output.")
    print("     Without it the service returns MODEL_NOT_CONFIGURED. There is")
    print("     no geometric fallback: a landmark polygon cannot exclude hair,")
    print("     glasses or stray strands, and every one of those biases the")
    print("     measured skin tone darker.")
    print()
    print("  models/skin/skin_concerns.onnx")
    print("     Multi-label classifier over")
    print("     [acne, pigmentation, oiliness, dryness, wrinkles],")
    print("     (1,3,224,224) float32 input, 5 logits out (sigmoid applied here).")
    print("     Without it, concern scores are reported as unavailable. They")
    print("     are never estimated - a fabricated 0.71 'pigmentation' reads to")
    print("     a customer exactly like a measured one.")
    print()
    print("  See offline-models/README.md for how to train and export both.")

    print("\nDone." if ok else "\nFinished with errors.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
