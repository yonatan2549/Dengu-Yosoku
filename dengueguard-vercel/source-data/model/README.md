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

The schema intentionally keeps holdout history and the latest forecast
separate. It does not invent `thr_watch`, `thr_alert`, `level`, or a
four-week rolling average. Those require a separately reviewed methodology.

The sample forecast currently published by the model repository targets
2026-10-25. As of 2026-11-16 this is a past week, so it must be regenerated
from refreshed source data before it is described as a current forecast.
