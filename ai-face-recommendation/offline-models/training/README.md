# training/

Put training code here. It is excluded from the Docker build context, so
nothing added under this directory can reach the production image.

Whatever you train must satisfy the input/output contracts in
`../README.md` exactly — the service does no shape negotiation, and a model
with a different label order or class indexing will produce confidently wrong
output rather than an error.

Two things to record alongside any checkpoint you keep:

- **the dataset and its licence** — `models/` is gitignored precisely because
  weights carry licence obligations that source code does not;
- **the evaluation slice-by-slice**, not just the aggregate. For both models
  here the failure that matters is uneven performance across skin tones, and an
  average metric hides exactly that.
