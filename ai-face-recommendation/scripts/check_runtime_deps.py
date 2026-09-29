#!/usr/bin/env python
"""Guard the runtime dependency boundary.

The production image must contain no training stack and no database driver.
Those constraints are easy to state and easy to violate by accident — someone
adds `import torch` to a utility, the lockfile grows a 2 GB wheel, and nobody
notices until the image is built.

Run by pre-commit on any change to pyproject.toml or uv.lock, and in CI.
Exits non-zero with an explanation when a banned package appears in the
RUNTIME dependency set. The dev extra is not checked: ruff, mypy and pytest are
supposed to be there, and they never reach the image.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# name -> why it is banned
BANNED = {
    "torch": "PyTorch belongs to offline training only; production consumes ONNX.",
    "torchvision": "Training-only. See offline-models/.",
    "torchaudio": "Training-only.",
    "timm": "Training-only model zoo; export to ONNX instead.",
    "scikit-image": "Not needed: OpenCV and NumPy cover every operation here.",
    "skimage": "Not needed: OpenCV and NumPy cover every operation here.",
    "tensorflow": "Not part of this stack.",
    "psycopg2": "This service is stateless; the Node backend owns the database.",
    "psycopg2-binary": "This service is stateless; the Node backend owns the database.",
    "psycopg": "This service is stateless; the Node backend owns the database.",
    "asyncpg": "This service is stateless; the Node backend owns the database.",
    "sqlalchemy": "This service has no database.",
    "alembic": "This service has no database.",
}


def _normalise(name: str) -> str:
    return re.split(r"[<>=!~\[; ]", name.strip(), maxsplit=1)[0].strip().lower()


def main() -> int:
    data = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    runtime = [_normalise(d) for d in data["project"].get("dependencies", [])]

    failures = [(name, BANNED[name]) for name in runtime if name in BANNED]

    if failures:
        print("Banned packages found in the RUNTIME dependency set:\n", file=sys.stderr)
        for name, reason in failures:
            print(f"  {name}: {reason}", file=sys.stderr)
        print(
            "\nIf one of these is genuinely required, say so explicitly and get it "
            "agreed — do not silence this check.",
            file=sys.stderr,
        )
        return 1

    print(f"runtime dependencies clean ({len(runtime)} packages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
