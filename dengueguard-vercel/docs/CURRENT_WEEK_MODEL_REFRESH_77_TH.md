# Current-week 77-province model refresh pipeline

**Scope:** technical data intake, model-input reconstruction, weekly nowcast training and review-only Dashboard snapshot preparation  
**Branch:** `review/national-alerts-independent-audit-2026-11-21`  
**Workflow:** `.github/workflows/dengueyosoku-latest-weekly-ingest.yml`

## 1. Input sources

The refresh flow uses three distinct sources:

1. The upstream Phase 13 historical aggregate panel from `johnlovepizza/DenguYosoku`, pinned to the Git commit resolved by the workflow.
2. The latest TanRabad regional export, inspected as 13 regional CSV files and normalized to `province, year, week, cases` on the ephemeral GitHub runner.
3. The existing website Model Snapshot's historical `history[].actual_cases` values, used only to bridge an otherwise missing contiguous period between the upstream historical panel and the incoming TanRabad weeks.

The TanRabad ZIP, raw regional files and intermediate aggregate panel are kept in runner temporary storage. They are not committed to Git or uploaded as an artifact.

## 2. Snapshot-to-TanRabad history bridge

`scripts/merge_model_snapshot_history.py` validates:

- Exactly 77 canonical provinces, with no duplicate province-week keys.
- Sunday-start MMWR weeks and a gap-free weekly timeline.
- Non-negative integer observed case counts.
- Agreement between the upstream source, snapshot actuals and every overlapping incoming TanRabad province-week.
- Complete 77-province coverage for every week required to extend the upstream source.

Only `history[].actual_cases` may bridge a missing observed week. Forecast values, fitted predictions, residuals and the forecast target week are excluded. The helper refuses to guess a missing week or repair conflicting actual counts. Its report records the bridge dates, row counts and SHA-256 hashes, and explicitly records that prediction values and forecast-week actuals were not used.

## 3. Weather and Phase 13 input construction

The weather bridge obtains candidate weekly apparent-temperature data from Open-Meteo and compares it with the existing source weather series over 52 historical weeks (4,004 province-week comparisons). The original 12-feature pipeline only continues when its existing weather-equivalence gate passes. The provider/model, units, timezone, overlap window and comparison metrics are recorded.

`scripts/build_tanrabad_current_model_inputs.py` now accepts any consecutive extension period rather than hard-coding MMWR weeks 44 and 45. It verifies 77 provinces per week, complete weather coverage for every appended week, and the 52-week weather-equivalence report. It then creates a training panel and one blank target week after the final observed week. Target-week cases and target-week weather remain blank.

The MMWR year/week is derived from the Sunday week-start date, including year-boundary validation. It is not calculated by blindly adding one to a week number.

## 4. Model tracks

The workflow keeps two models separate:

- **Original Phase 13 LightGBM:** the 12-feature model, including the documented lagged apparent-temperature feature. It is trained only if the source-pair audit, weather bridge, input panel and current-week release checks pass.
- **Experimental case-only LightGBM:** a separate research variant using case-history and calendar features. It does not consume weather variables and is not a replacement for the Phase 13 model. It is a review-only comparator and does not update production model artifacts.

Both paths validate all 77 provinces and a continuous weekly panel. Holdout metrics remain retrospective rolling-origin results on previously observed data, not prospective or sealed blind-test results.

## 5. Current-week and publication behavior

The original model converter's `--require-current` check is preserved. A one-week nowcast must target the epidemiological week currently in progress in `Asia/Bangkok`. A future target is not silently relabelled as current. For example, a forecast for the week beginning 22 November 2026 must not be described as the current-week forecast before that epidemiological week begins.

When preparation succeeds, only the review-only `model_predictions.json` and `model_metrics.json` are committed to the workflow's triggering branch. The branch check uses the actual GitHub ref, so a run on this PR branch cannot write model files to `main` or the integration branch. The web CI is then dispatched for that same branch.

No database migrations are applied. The workflow does not approve a nationwide Alert Rule Profile, enable risk classification or send LINE, Email, SMS or other external notifications.

## 6. Validation commands

From `dengueguard-vercel`:

```bash
python -m unittest scripts.test_merge_model_snapshot_history -v
python -m unittest scripts.test_build_tanrabad_current_model_inputs -v
python -m unittest scripts.test_experimental_case_only_nowcast -v
python scripts/build_alert_threshold_draft.py --check
python -m unittest scripts.test_alert_threshold_draft -v
```

The weekly GitHub Actions workflow additionally checks the source schemas, MMWR coverage, 77-province model panel, weather equivalence, Phase 13 source-pair audit, rolling-origin model validation, model release contract and Dashboard snapshot contract.

## 7. Safety and provenance invariants

- Raw patient-level records are not exported, committed or uploaded.
- Every output is traceable to upstream source revisions, generated run IDs and file hashes.
- Snapshot bridge rows originate only from observed `actual_cases`, never predictions.
- Forecast target-week labels and weather inputs are blank when constructing the next-week feature row.
- Experimental case-only outputs remain separate from the original 12-feature model.
- Model snapshots remain `review_only` and the Alert profile remains Draft with notifications disabled until the appropriate operational evidence and controls exist.
