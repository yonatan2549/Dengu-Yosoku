# New model export handoff

This folder is the handoff point between the model repository and the website.
The artifacts are fetched from
https://github.com/johnlovepizza/DenguYosoku at a pinned commit.

From the `dengueguard-vercel` project root, run:

```bash
python scripts/fetch_model_outputs.py
python scripts/convert_model_outputs.py
```

The downloader retrieves only these derived artifacts:

| Model repository file | Saved locally as |
|---|---|
| `DenguYosoku/holdout_predictions.csv` | `source-data/model/holdout_predictions.csv` |
| `predict_week/predictions.csv` | `source-data/model/predictions.csv` |
| `DenguYosoku/metrics.json` | `source-data/model/metrics.json` |

It also records the source commit and SHA-256 file hashes in
`source-data/model/source_manifest.json`. This makes each converted output
traceable to the precise model repository commit.

Do **not** copy `answer_key.csv`, the raw source case dataset, or
`model.txt` into the website's `public/` directory.

The converter validates the 77-province coverage, one forecast week, duplicate
province/week rows, Sunday week starts, weekly continuity in the holdout, finite
non-negative predictions, and consistency of residual = actual - prediction.
It then generates:

- `public/data/model_predictions.json`
- `public/data/model_metrics.json`

The schema (version 2) keeps holdout history and the latest forecast
separate. The converter requires the source manifest, verifies the model
commit and SHA-256 hashes, checks that the forecast week follows the final
holdout week, and checks that the metrics row count and evaluation cutoff
agree with the holdout data.

Freshness is measured using Sunday-start epidemiological weeks in
`Asia/Bangkok`, not by comparing a week-start date to the file-conversion
timestamp. The output records the source retrieval time, JSON conversion time,
current epidemiological week at conversion, and forecast lag in weeks. The
website also validates the 77-province coverage and verifies that prediction
and metrics files refer to the same model commit before displaying them.

The adapter intentionally does not invent `thr_watch`, `thr_alert`, `level`,
or a four-week rolling average. Those require a separately reviewed
methodology. Map shading represents relative predicted case counts only; it
must not be described as an outbreak risk category.

The forecast artifact currently published by the model repository targets
2026-10-25, one week after the final Holdout week (2026-10-18). Treat it as a
one-week-ahead forecast snapshot from that model run, not as a continuously
updated forecast for the present week. The forecast export contains predictions
only; it does not contain observed actual cases for its target week. Keep this
forecast separate from the sealed Holdout and never add target-week outcomes to
features or model inputs when producing the prediction.

As of the current epidemiological week beginning 2026-11-15, this snapshot is
three weeks behind. It may be used to inspect the model output and the handoff
pipeline, but it must not be presented as the current dengue situation. A
current operational forecast requires the model owner to run a new forecast
with the latest eligible inputs, while preserving the train/holdout boundary
and the no-target-week-feature rule.
