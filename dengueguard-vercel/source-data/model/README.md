# New model export handoff

This folder is the handoff point between the model repository and the website.
Copy only these three generated artifacts from
https://github.com/johnlovepizza/DenguYosoku:

| Model repository file | Copy to this folder |
|---|---|
| \`DenguYosoku/holdout_predictions.csv\` | \`holdout_predictions.csv\` |
| \`predict_week/predictions.csv\` | \`predictions.csv\` |
| \`DenguYosoku/metrics.json\` | \`metrics.json\` |

Do **not** copy \`answer_key.csv\`, the raw patient-level/source dataset, or
\`model.txt\` into the website's \`public/\` directory.

From the \`dengueguard-vercel\` project root, run:

\`\`\`bash
python scripts/convert_model_outputs.py
\`\`\`

The script validates the 77-province coverage, one forecast week, duplicate
province/week rows, Sunday week starts, weekly continuity in the holdout, finite
non-negative predictions, and consistency of residual = actual - prediction.
It then generates:

- \`public/data/model_predictions.json\`
- \`public/data/model_metrics.json\`

The schema intentionally keeps holdout history and the latest forecast
separate. It does not invent \`thr_watch\`, \`thr_alert\`, \`level\`, or a
four-week rolling average. Those require a separately reviewed methodology.

The model repository's current sample forecast targets 2026-10-25. As of
2026-11-16 this is a past week, so it must be regenerated from refreshed
source data before it is described as a current forecast.
