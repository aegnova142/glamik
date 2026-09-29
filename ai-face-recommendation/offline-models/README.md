# offline-models/

Training, export and quantization. **None of this ships to production.**

The boundary is deliberate and enforced in three places:

| Where | What it enforces |
|---|---|
| `pyproject.toml` | PyTorch, timm and scikit-image are absent from runtime dependencies |
| `.dockerignore` | `offline-models/` never enters the build context |
| `scripts/check_runtime_deps.py` | pre-commit and CI fail if a training package appears in the runtime set |

The production service consumes **ONNX and MediaPipe only**. Everything in this
directory runs on a workstation or a training box, in a separate environment
you create yourself:

```bash
python -m venv .venv-train
.venv-train/bin/pip install torch torchvision timm onnx onnxruntime onnxsim
```

---

## Why the models are not committed

Two of the three models this service needs are not in the repository:

- `models/face_parser/face_parser.onnx`
- `models/skin/skin_concerns.onnx`

No suitably-licensed public checkpoint exists for either at the quality this
needs. Rather than shipping something approximate, the service reports
`MODEL_NOT_CONFIGURED` and refuses to analyse. See the "Honest failure" section
of the main README for why that is the right behaviour rather than a gap.

---

## 1. Face parsing (`face_parser.onnx`)

**Architecture.** BiSeNet (or BiSeNet v2) trained on CelebAMask-HQ.

**Class indices.** The service assumes the standard CelebAMask-HQ labelling —
`app/services/face_parser.py` hardcodes it, and a model trained with different
indices will silently mask the wrong regions:

```
0  background   1  skin        2  l_brow    3  r_brow    4  l_eye
5  r_eye        6  eye_g       7  l_ear     8  r_ear     9  ear_r
10 nose        11 mouth       12 u_lip     13 l_lip     14 neck
15 neck_l      16 cloth       17 hair      18 hat
```

**Contract the exported model must satisfy:**

| | |
|---|---|
| Input | `(1, 3, 512, 512)` float32, NCHW, RGB |
| Normalisation | ImageNet mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]` |
| Output | `(1, 19, 512, 512)` float32 logits |
| Opset | 17 |

No training script for this is provided — the choice of dataset, augmentation
and schedule depends on what data you have, and a stub here would be a guess
dressed as guidance. `export/export_skin_concerns.py` shows the export shape to
follow; the equivalent for the parser differs only in input size and the
`output_names`.

**Verify before deploying.** Run the exported model over a held-out set and
check the skin-class IoU, then check it against faces with a fringe, with
glasses, and across the full range of skin tones. A parser that is 2% worse on
average but systematically fails on dark skin or covered foreheads is worse
than useless here — it biases the measured tone in exactly the population
where the measurement matters most.

---

## 2. Skin concerns (`skin_concerns.onnx`)

**Architecture.** MobileNetV3-Large or EfficientNet-Lite0, multi-label head.

| | |
|---|---|
| Input | `(1, 3, 224, 224)` float32, NCHW, RGB, ImageNet-normalised |
| Output | `(1, 5)` float32 **logits** — sigmoid is applied in the service |
| Label order | `["acne", "pigmentation", "oiliness", "dryness", "wrinkles"]` |
| Opset | 17 |

Label order is positional. Reordering it in training without updating
`CONCERN_LABELS` in `app/services/skin_concerns.py` will mislabel every score
with no error anywhere.

**Multi-label, not multi-class.** These concerns co-occur; a softmax across
them would force them to compete for probability mass and make a face with
both acne and dryness read as having less of each.

**Calibrate before shipping.** A raw sigmoid output is not a probability.
Fit a calibration curve on held-out data and check the reliability diagram. An
uncalibrated 0.8 shown to a customer as "80%" is a false claim about their
skin.

**Scope.** Cosmetic signals only. Do not train, name or present any output as a
dermatological condition, and do not add a class that implies one.

---

## 3. Quantization (optional)

INT8 dynamic quantization typically gives 2-4x faster CPU inference at roughly
a quarter of the size:

```bash
python quantization/quantize.py --input face_parser.onnx --output face_parser.int8.onnx
```

**Measure accuracy after quantizing, not before.** For face parsing in
particular, check the boundary quality between skin and hair specifically — a
model whose overall IoU barely moves can still lose the fine hairline detail
that is the entire reason the parser is mandatory.

---

## Deploying a model

Models are not baked into the Docker image. They are large, licensed
separately, and version independently of the code.

```bash
# mounted at /app/models by docker-compose.yml
cp face_parser.onnx   ../models/face_parser/
cp skin_concerns.onnx ../models/skin/
```

Then bump the matching version constant in `app/config.py`:

```python
FACE_PARSER_VERSION = "bisenet-v1.1.0"
```

That constant is part of the cache key. Skipping it means the new model is
loaded but every cached result still comes from the old one, and the two are
indistinguishable in the response.
