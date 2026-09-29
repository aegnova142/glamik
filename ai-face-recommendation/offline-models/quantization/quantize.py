"""Quantise an ONNX model to INT8 for faster CPU inference.

Roughly 4x smaller and meaningfully faster on the CPU-only boxes this service
is sized for, at a small accuracy cost.

    python scripts/quantize.py --input models/skin/skin_concerns.onnx \
        --output models/skin/skin_concerns.int8.onnx

Dynamic quantisation is the default because it needs no calibration dataset.
For a vision CNN, static quantisation over a few hundred representative faces
gives better accuracy — but that requires holding real face images, which this
project deliberately avoids.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="INT8-quantise an ONNX model.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError:
        print(
            "onnxruntime quantization tools are unavailable.\n" "  pip install onnxruntime onnx",
            file=sys.stderr,
        )
        return 1

    if not args.input.exists():
        print(f"Input model not found: {args.input}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=str(args.input),
        model_output=str(args.output),
        weight_type=QuantType.QUInt8,
    )

    before = args.input.stat().st_size / 1024 / 1024
    after = args.output.stat().st_size / 1024 / 1024
    print(f"Quantised {args.input.name}: {before:.1f} MB -> {after:.1f} MB")
    print("Validate accuracy on a held-out set before deploying.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
