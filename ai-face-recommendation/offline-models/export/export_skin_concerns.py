"""Export a trained skin-concern classifier to ONNX.

This service does not train models. This script exists so that whoever trains
the concern classifier produces a file whose input/output contract matches
what `app/services/skin_concerns.py` expects:

    input   float32 (1, 3, 224, 224), ImageNet-normalised RGB
    output  float32 (1, 5) raw logits, ordered
            [acne, pigmentation, oiliness, dryness, wrinkles]

Logits, not probabilities: the service applies a sigmoid per label, because
the concerns are independent rather than mutually exclusive.

    python scripts/export_onnx.py --checkpoint path/to/model.pt \
        --output models/skin/skin_concerns.onnx

Requires torch and timm, which are intentionally NOT in requirements.txt —
the runtime image has no reason to carry a training stack.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

CONCERN_ORDER = ["acne", "pigmentation", "oiliness", "dryness", "wrinkles"]
INPUT_SIZE = 224


def main() -> int:
    parser = argparse.ArgumentParser(description="Export a skin-concern model to ONNX.")
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--arch", default="mobilenetv3_large_100")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    try:
        import timm
        import torch
    except ImportError:
        print(
            "torch and timm are required for export but are not runtime "
            "dependencies.\n  pip install torch timm",
            file=sys.stderr,
        )
        return 1

    if not args.checkpoint.exists():
        print(f"Checkpoint not found: {args.checkpoint}", file=sys.stderr)
        return 1

    model = timm.create_model(args.arch, pretrained=False, num_classes=len(CONCERN_ORDER))
    state = torch.load(args.checkpoint, map_location="cpu")
    model.load_state_dict(state.get("state_dict", state))
    model.eval()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    torch.onnx.export(
        model,
        dummy,
        str(args.output),
        input_names=["input"],
        output_names=["logits"],
        # Batch stays dynamic so the same file works if batching is added later.
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=args.opset,
        do_constant_folding=True,
    )

    print(f"Exported {args.output}")
    print(f"Output order: {CONCERN_ORDER}")
    print("Remember: the service applies sigmoid, so export raw logits.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
