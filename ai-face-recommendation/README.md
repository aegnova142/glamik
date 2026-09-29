# Glamrik AI Service

Internal Python microservice for skin analysis. It measures skin tone and
undertone from a face photo and returns a structured, versioned result.

**All three phases are implemented.** Phase 2 (product recommendation) and
Phase 3 (virtual try-on, lipstick and blush) are both **disabled by default** —
`ENABLE_RECOMMENDATION=false`, `ENABLE_TRYON=false` — until a deployment
explicitly turns them on. See [§19](#19-phase-2-and-phase-3).

---

## Contents

1. [What this is and is not](#1-what-this-is-and-is-not)
2. [Architecture](#2-architecture)
3. [Requirements](#3-requirements)
4. [Setup](#4-setup)
5. [Models](#5-models)
6. [Configuration](#6-configuration)
7. [Running](#7-running)
8. [API](#8-api)
9. [Error codes](#9-error-codes)
10. [Honest failure — the design rule](#10-honest-failure--the-design-rule)
11. [Privacy](#11-privacy)
12. [Security](#12-security)
13. [Observability](#13-observability)
14. [Caching](#14-caching)
15. [Performance](#15-performance)
16. [Testing](#16-testing)
17. [Docker](#17-docker)
18. [Integrating from the Node backend](#18-integrating-from-the-node-backend)
19. [Phase 2 and Phase 3](#19-phase-2-and-phase-3)

---

## 1. What this is and is not

**It is** a stateless, internal-only analysis service. Give it a face photo; it
returns skin tone (ITA°, band, approximate Monk step), undertone, a quality
assessment, and the model versions that produced them.

**It is not:**

- **A replacement for the Node backend.** Node remains the single source of
  truth for users, auth, sessions, products, variants, shades, inventory,
  prices, orders, wishlist, reviews and admin configuration. This service holds
  none of that and has no database.
- **A product catalog.** It never invents a product and never recommends one
  outside what Node supplies.
- **A medical device.** Every result is a cosmetic estimate. No output is a
  diagnosis, and none should be presented as one.
- **A store of images.** See [Privacy](#11-privacy).

---

## 2. Architecture

```
Browser ──▶ Node backend (auth, catalog, orders) ──▶ AI service (this)
                    ▲                                     │
                    └────────── analysis result ──────────┘
```

The browser never talks to this service. Node authenticates the user, forwards
the image with an internal key, and owns everything that happens to the result
afterwards.

```
app/
├── main.py              app assembly, error handlers, middleware
├── config.py            settings + model version constants
├── api/                 /v1 routes: health, analysis, recommendation, tryon
├── core/                errors, logging/metrics, security, lifespan
├── models/              model registry and loader (ONNX + MediaPipe)
├── schemas/             pydantic request/response contracts
├── services/            the pipeline and its stages
└── utils/               colour maths, image helpers, validation
```

The analysis pipeline, in order:

```
upload → validate → decode → resize → quality gate → face landmarks
       → face quality → face parsing → skin mask → tone → undertone
       → concerns → response
```

Each stage is timed into a Prometheus histogram. Any stage may stop the
pipeline with a specific error rather than passing degraded data forward.

---

## 3. Requirements

- Python **3.12**
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- Redis (optional — caching and rate limiting)
- The model files in [§5](#5-models)

The runtime deliberately contains **no PyTorch, no timm, no scikit-image** and
**no database driver**. Training lives in `offline-models/` and never ships;
`scripts/check_runtime_deps.py` enforces this in pre-commit and CI.

---

## 4. Setup

```bash
cd ai-face-recommendation

uv sync                                  # installs from uv.lock, exactly
cp .env.example .env                     # then edit INTERNAL_API_KEY
uv run python scripts/download_models.py
uv run uvicorn app.main:app --reload --port 8001
```

Check it came up:

```bash
curl localhost:8001/v1/health
curl localhost:8001/v1/ready     # 503 until every required model is loaded
```

---

## 5. Models

| Slot | File | Required | Ships? |
|---|---|:--:|---|
| Face landmarker | `models/face_landmarker/face_landmarker.task` | yes | downloadable |
| Face parser | `models/face_parser/face_parser.onnx` | yes | **you supply** |
| Skin concerns | `models/skin/skin_concerns.onnx` | yes | **you supply** |

`scripts/download_models.py` fetches the first. The other two have no
suitably-licensed public checkpoint, so they are not bundled — see
`offline-models/README.md` for the exact input/output contract each must
satisfy.

**Face parsing is mandatory and has no fallback.** A landmark convex hull was
considered and rejected: it cannot exclude a fringe across the forehead,
spectacle frames, a stray hair strand or the shadow under a chin. Every one of
those is darker than skin, so including them biases the measured tone
systematically darker — silently, and worse for some hairstyles and face shapes
than others. Without a parser the service returns `MODEL_NOT_CONFIGURED`.

Model versions are constants in `app/config.py`. They appear in every response
**and** in the cache key, so bumping one invalidates results computed by the
previous version. Upgrading a model without bumping its version will serve
stale answers indistinguishable from fresh ones.

---

## 6. Configuration

Everything is environment-driven; see `.env.example` for the annotated list.
Nothing is hardcoded to a machine, a traffic level or a deployment, and no
secret has a usable default.

The settings worth understanding before changing:

| Variable | Default | Why it matters |
|---|---|---|
| `INTERNAL_API_KEY` | placeholder | The only authentication. `/v1/ready` warns while it is still the default. |
| `MIN_CONFIDENCE` | `0.45` | Below this the service returns `RETAKE_PHOTO` instead of a tone. |
| `MAX_IMAGE_DIMENSION` | `640` | Larger is slower with little accuracy gain; the measurement is a colour median. |
| `MAX_DECODED_PIXELS` | `40000000` | Decompression-bomb ceiling, independent of file size. |
| `WEB_CONCURRENCY` | `2` | Each worker loads its own copy of the models — size by memory, not only cores. |
| `ENABLE_RECOMMENDATION` / `ENABLE_TRYON` | `false` | Phase gates. Leave off until those phases exist. |

---

## 7. Running

Development:

```bash
uv run uvicorn app.main:app --reload --port 8001
```

Production (as in the Dockerfile):

```bash
gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8001 --timeout 60 --max-requests 2000
```

Gunicorn supervises the workers: one that dies is replaced, and `--timeout`
kills one wedged inside a native library — something uvicorn alone cannot do.

---

## 8. API

Every endpoint is under `/v1`. All except `/v1/health`, `/v1/ready` and
`/v1/metrics` require the `X-Internal-AI-Key` header.

### `GET /v1/health`

Liveness. `200` whenever the process is serving.

### `GET /v1/ready`

Readiness. `200` only when every required model is loaded; `503` otherwise,
with the missing ones named. An instance that cannot analyse must not receive
traffic.

### `POST /v1/analyze`

`multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `image` | file | JPEG, PNG, WebP or HEIC. Max 5 MB by default. |
| `mirrored` | bool | `true` for a selfie-camera frame; it is un-mirrored before analysis. |

```json
{
  "success": true,
  "model_version": {
    "face_landmarker": "mediapipe-facelandmarker-v1.0.0",
    "face_parser": "bisenet-v1.0.0",
    "skin_model": "skin-v1.0.0"
  },
  "analysis": {
    "skin_tone": {
      "category": "intermediate",
      "label": "medium",
      "monk_scale": 4,
      "ita": 33.6,
      "confidence": 0.82,
      "lab": { "l": 62.4, "a": 11.8, "b": 18.2, "l_std": 5.1 }
    },
    "undertone": { "value": "warm", "confidence": 0.71, "notes": [] },
    "concerns": { "available": false, "scores": null, "reason": "MODEL_NOT_CONFIGURED", "notes": ["..."] }
  },
  "quality": { "score": 0.94, "issues": [], "warnings": [], "metrics": { "blur": 180.3 } },
  "pipeline": {
    "skin_mask_source": "bisenet_face_parsing",
    "skin_pixels": 24180,
    "face_coverage": 0.42,
    "image_sha256": "…",
    "cached": false,
    "duration_ms": 96.4
  },
  "disclaimer": "This is an AI-based cosmetic estimate and is not a medical diagnosis.",
  "advice": "If you have persistent or worsening skin concerns…"
}
```

`monk_scale` is an **approximation**. The Monk Skin Tone scale is perceptual
and has no published exact ITA mapping; the conversion here aligns the two
orderings and is reported as an approximation, never as a measurement.

### `POST /v1/recommend`

Phase 2. Returns `501 NOT_IMPLEMENTED` (with the planned contract in the error
payload) unless `ENABLE_RECOMMENDATION=true`. When enabled:

```json
{
  "analysis": {
    "undertone": "Warm",
    "undertone_confidence": 0.82,
    "lab": { "l": 62.4, "a": 11.8, "b": 18.2 },
    "skin_type": "Oily",
    "concerns": { "acne": 0.7 }
  },
  "preferences": { "budget_max": 1500, "limit": 10 },
  "catalog": [ /* the caller's own product list — never fetched by this service */ ]
}
```

`analysis` is deliberately shaped to accept the `analysis` block of a prior
`/v1/analyze` response almost as-is — `lab` in particular is what lets shade
matching compare a real measured colour instead of reconstructing one from a
category label. See [§19](#19-phase-2-and-phase-3) for the full filtering and
ranking design.

```json
{
  "success": true,
  "status": "OK",
  "recommendations": [
    { "product_id": "prod-foundation-1", "variant_id": "shade-warm-30", "match_score": 0.91, "reason": "Warm undertone match; close colour match to your skin" }
  ],
  "notes": []
}
```

Every `product_id`/`variant_id` is copied verbatim from an entry in the
request's own `catalog` — this service holds no product store of its own and
cannot invent one.

### `POST /v1/tryon`

Phase 3. Returns `501 NOT_IMPLEMENTED` unless `ENABLE_TRYON=true`. When
enabled, `multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `image` | file | JPEG, PNG, WebP or HEIC. |
| `layers` | string | JSON array of layers. Max 6. |
| `return_original` | bool | Include the un-made-up image for a before/after. |
| `mirrored` | bool | `true` for a selfie-camera frame. |

```json
[{ "type": "lipstick", "color_hex": "#b4004e", "intensity": 0.8, "finish": "gloss",
   "product_id": "prod-1", "variant_id": "shade-1" }]
```

**Lipstick and blush only.** A request naming any other layer type is rejected
by name with `NOT_IMPLEMENTED` — never silently dropped, because a response
that quietly ignored a layer is indistinguishable from one where the layer
applied and didn't show.

```json
{
  "success": true,
  "image_base64": "…",
  "mime_type": "image/jpeg",
  "applied_layers": [
    { "type": "lipstick", "color_hex": "#b4004e", "intensity": 0.8, "finish": "gloss",
      "pixels": 4820, "mask_source": "face_parsing_lips_excluding_mouth_interior" }
  ],
  "notes": [],
  "duration_ms": 214.6
}
```

`pixels` and `mask_source` are there so a caller can tell a layer that actually
rendered from one that found no region to render into; the latter appears in
`notes` rather than being hidden. If *no* layer could be applied the request
fails with `TRYON_FAILED` rather than returning the unmodified photo.

---

## 9. Error codes

Every failure uses one envelope. Stack traces never appear in a response.

```json
{ "success": false, "error": { "code": "RETAKE_PHOTO", "message": "…" }, "quality_issues": ["LOW_LIGHT"] }
```

| Code | HTTP | Meaning |
|---|:--:|---|
| `IMAGE_INVALID` | 400 | Not a decodable image, or an unsupported type. |
| `IMAGE_TOO_LARGE` | 413 | Over the file-size or pixel ceiling. |
| `RETAKE_PHOTO` | 422 | Usable photo required; `quality_issues` says what to fix. |
| `NO_FACE` | 422 | No face found. |
| `MULTIPLE_FACES` | 422 | More than one face; ambiguous which to analyse. |
| `LOW_CONFIDENCE` | 422 | Measured, but not confidently enough to report. |
| `MODEL_NOT_CONFIGURED` | 503 | A required model is absent on this deployment. |
| `MODEL_UNAVAILABLE` | 503 | A model is present but failed. |
| `INVALID_REQUEST` | 400 | The image was fine; an accompanying parameter was not. |
| `TRYON_FAILED` | 500 | Nothing could be rendered onto this photo. |
| `NOT_IMPLEMENTED` | 501 | A phase-gated endpoint whose flag is off, or an unimplemented try-on layer type. |
| `UNAUTHORIZED` | 401 | Missing or wrong internal key. |
| `RATE_LIMITED` | 429 | Too many requests. |
| `INTERNAL_ERROR` | 500 | Unexpected. Details go to the log, never the response. |

---

## 10. Honest failure — the design rule

One rule runs through this service: **it never returns a number it cannot
stand behind.**

| Situation | What it does | What it refuses to do |
|---|---|---|
| A required model is missing | `MODEL_NOT_CONFIGURED`, naming it | Approximate with a simpler method |
| No face parser | `MODEL_NOT_CONFIGURED` | Fall back to a landmark polygon |
| The photo is dark, blurry or filtered | `RETAKE_PHOTO` with what to fix | Analyse it anyway at lower confidence |
| Confidence below the floor | `RETAKE_PHOTO` | Report the same figure with a lower confidence |
| The concern model is absent | `available: false, scores: null` | Emit zeros, midpoints, or plausible values |
| Undertone signal is weak | `neutral`, with a note explaining why | Assert warm or cool |
| An undertone reading has low confidence | Treated as unknown for ranking purposes | Let a coin-flip reading decide which shade ranks first |
| No product satisfies a hard filter | `status: "NO_MATCH"` | Loosen a filter silently to produce a result |
| Pregnancy-safety is unconfirmed on a product | Excluded when that filter is requested | Assume safe because no data says otherwise |
| A try-on layer type isn't built yet | `NOT_IMPLEMENTED`, naming it | Drop it from the request and render the rest |
| A try-on layer has no visible region | Reported in `notes`, `pixels` on the rest | Claim it was applied |
| No try-on layer can be rendered at all | `TRYON_FAILED` | Return the unmodified image as a success |

The reason is specific to this product. A customer sees an output and buys a
foundation shade from it. A fabricated `0.71 pigmentation` is indistinguishable
from a measured one, and a confidence printed beside a number does not stop the
number reading as a fact. Refusing is recoverable; a wrong shade bought on a
made-up measurement is not.

---

## 11. Privacy

- **Images are never written to disk.** The upload exists as a local variable
  for the duration of the request and is garbage-collected after it.
- **No face embeddings are computed or stored.** Landmarks exist only inside
  one request.
- **Nothing is logged that could reconstruct a face** — logs carry shapes,
  timings and outcomes only.
- **Sentry runs with `send_default_pii=False` and `max_request_body_size="never"`**,
  so no error report can carry the uploaded photo.
- **The cache is keyed by image content hash**, never by user identity, so it
  cannot become a record of who submitted what. TTL is finite and configurable.
- The Redis container in `docker-compose.yml` runs with persistence disabled,
  so a restart cannot leave analysis results on disk.

---

## 12. Security

- **Authentication.** Shared key in `X-Internal-AI-Key`, compared with
  `secrets.compare_digest` — a plain `==` returns early on the first differing
  byte and leaks the key to anyone who can measure latency. Keep the key in the
  environment; never hardcode it. mTLS is a supported deployment option at the
  proxy.
- **Upload validation is not based on the Content-Type header.** The header is
  attacker-controlled. Format is decided by magic bytes; the file must then
  actually decode, within the pixel ceiling.
- **Decompression bombs** are rejected on declared dimensions, before
  allocation. A few-KB PNG can declare a gigapixel canvas.
- **Truncated uploads fail** rather than being padded — padding would silently
  corrupt every colour measurement taken from them.
- **Not public.** Do not expose this service, or Node's internal AI endpoints,
  to the internet. Rate limiting here is a blunt safety net; real per-user
  limits belong at the Node layer, which knows who the user is.
- **No production stack traces**, and `/docs` and `/openapi.json` are disabled
  when `ENVIRONMENT=production`.

---

## 13. Observability

**Logs** — structlog, JSON by default, one line per event with a `request_id`
bound for the whole request.

**Metrics** — Prometheus at `/v1/metrics`:

| Metric | Labels |
|---|---|
| `glamirk_ai_requests_total` | `endpoint`, `status` |
| `glamirk_ai_errors_total` | `endpoint`, `code` |
| `glamirk_ai_cache_total` | `result` |
| `glamirk_ai_stage_seconds` | `stage` |
| `glamirk_ai_inference_seconds` | `model` |

Buckets are skewed low — the target is sub-100 ms analysis, so the interesting
resolution is below a second.

**Errors** — Sentry, if `SENTRY_DSN` is set, with PII disabled.

---

## 14. Caching

Redis, optional. Key shape:

```
ai:v1:analysis:<image_sha256>:<model_version_hash>:<params_hash>
```

Model versions are in the key so an upgrade cannot serve a result computed by
the previous version. A cache hit is flagged as `pipeline.cached: true` so a
caller can tell a fresh measurement from a replay.

Redis being down is never fatal: reads degrade to a miss, writes are dropped,
and **rate limiting fails open**. A cache outage taking analysis down entirely
would be a worse failure than briefly losing rate limiting.

---

## 15. Performance

- Images are downscaled to `MAX_IMAGE_DIMENSION` before anything else runs,
  with `INTER_AREA` — it averages source pixels rather than sampling them,
  preserving the mean colour the whole measurement depends on.
- The cheap whole-image quality gate runs **before** any model, so an unusable
  photo costs almost nothing.
- Models load once per worker at startup, never per request.
- `cv2.setNumThreads(1)` and `intra_op_num_threads=1`: with several workers
  each spawning a thread per core, the box is oversubscribed several times over
  and tail latency gets worse, not better. Parallelism belongs at the request
  level.
- ONNX Runtime negotiates execution providers in order — TensorRT, CUDA,
  OpenVINO, CPU — so the same image runs unchanged on a laptop or an
  accelerated host.
- `/v1/analyze` is `async`, but the CPU-bound pipeline runs in a threadpool;
  running it inline would block the event loop for every other request in the
  worker.

---

## 16. Testing

```bash
uv run pytest                 # full suite
uv run ruff check . && uv run ruff format --check .
uv run mypy app
uv run pre-commit run --all-files
```

Tests that need the vision models **skip** rather than fail when they are
absent — a missing model is a configuration state this service is designed to
report, not a code defect. The tests that assert on *that reporting* always
run.

No face photograph is committed to this repository. To exercise the success
path, drop one at `tests/assets/face.jpg` (gitignored) and re-run.

---

## 17. Docker

```bash
docker compose up --build
docker compose run --rm ai python scripts/download_models.py
```

Multi-stage build: dependencies resolve from `uv.lock` in the builder, and the
runtime image carries no compiler toolchain, no training stack and no secrets.
It runs as a non-root user. The healthcheck probes `/v1/ready`, not `/v1/health`,
so an orchestrator will not route traffic to an instance whose models failed to
load.

Model weights are mounted, not baked in — they are large, licensed separately,
and version independently of the code.

---

## 18. Integrating from the Node backend

```ts
const form = new FormData();
form.append("image", imageBuffer, { filename: "face.jpg", contentType: "image/jpeg" });
form.append("mirrored", String(fromSelfieCamera));

const res = await fetch(`${AI_SERVICE_URL}/v1/analyze`, {
  method: "POST",
  headers: { "X-Internal-AI-Key": process.env.INTERNAL_API_KEY! },
  body: form,
});

const body = await res.json();
if (!res.ok) {
  // body.error.code is stable and safe to branch on.
  // RETAKE_PHOTO carries body.quality_issues — show those to the user.
  // MODEL_NOT_CONFIGURED is an operations problem, not a user problem.
}
```

**No change to the Node backend is required for Phase 1.** Node calls this
service; this service calls nothing in Node. Phase 2 will need one new internal
endpoint on Node to supply the catalog — `GET /api/internal/ai/catalog`, the
path `app/services/catalog_client.py` already expects. That endpoint does not
exist yet and must not be exposed publicly when it does.

---

## 19. Phase 2 and Phase 3

Both are **implemented and disabled by default**. Turning either on is a
deployment decision:

```bash
ENABLE_RECOMMENDATION=true
ENABLE_TRYON=true
```

### Phase 2 — recommendation

Hard filters first — stock, active, skin type, excluded ingredients,
pregnancy-safe (when requested), budget, category. A product failing any of
them is **removed**, not down-ranked: an allergy exclusion that merely lowered
a score would still put the product in front of the customer.

Then ranking, over what survives:

- **Undertone compatibility.** Exact match scores highest, Universal/Neutral
  takes partial credit, a true opposite is down-ranked but never eliminated —
  which is why undertone is deliberately *not* in the hard-filter list. Below
  0.4 confidence the undertone is treated as unknown rather than allowed to
  decide the top pick.
- **Colour match** in CIELAB via CIEDE2000, **only for complexion products**
  (foundation, concealer, powder). A lipstick is not a better match for being
  closer in colour to the wearer's skin.
- **Concern relevance**, read from keywords in the product's own `benefits`
  and attribute text. There is no per-product "concern weight" field on a real
  Glamrik product, and inventing one would be exactly the fabricated signal
  this service exists to avoid.

The catalog arrives in the request body on every call. This service holds no
product store, so every returned `product_id`/`variant_id` is necessarily
copied from what the caller supplied — fabrication is structurally impossible,
not merely discouraged. No match returns `NO_MATCH`, or `BROADER_MATCH`
explicitly labelled as such — never a silently-loosened one.

### Phase 3 — virtual try-on

Lipstick and blush. Any other layer type is rejected by name.

- **Colour is applied by modifying `a*`/`b*` and leaving `L*` alone.** L*
  carries the skin's own shading and texture; replacing it is what produces the
  flat painted-sticker look. Because a vivid lipstick red is outside the sRGB
  gamut at skin lightness, a naive blend clamps and darkens the lips by ~2 L*
  — so chroma is pulled back, per-pixel, only where needed, until the colour is
  representable at the lightness it started with. Slightly less saturation on
  those pixels is the honest trade against a lip that renders darker than the
  face around it.
- **The lip mask comes from segmentation, with the mouth-interior class
  subtracted.** A landmark lip *contour* contains the teeth of an open smile,
  and painting them is the most visible way a try-on gives itself away.
- **Blush is cheek landmarks intersected with parsed skin** — landmarks say
  where the cheek is, the parser says what is actually skin there, which keeps
  colour off a stray lock of hair or a spectacle rim crossing the cheekbone.
- **Every mask edge is feathered** by a radius proportional to face width, so
  it looks right at any resolution.
- **Gloss lifts `L*` only where `L*` is already in the top decile** inside the
  lip region — a highlight where light genuinely falls, not a global wash.
- **Paint order is fixed** by `LAYER_ORDER`, not by the order the caller listed
  layers in. The caller's ordering is not a rendering instruction.

Try-on runs at `TRYON_MAX_DIMENSION` (1024 by default) rather than analysis's
640: it produces an image a customer looks at, not a measurement, and makeup
rendered at 640px reads as visibly soft.

Face parsing is as required here as it is for analysis. Without it, try-on
returns `MODEL_NOT_CONFIGURED` rather than falling back to a landmark polygon.
