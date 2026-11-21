# Phase 15 — TanRabad + Open-Meteo bridge and Phase 13 current nowcast review

**Review date:** 21 November 2026  
**Branch:** `integration/phase9-12-final-review`  
**Weekly ingest run:** [#44852227543](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44852227543)  
**Web CI run:** [#44852245215](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44852245215) — success

## 1. Latest TanRabad panel audit

The configured Drive source was downloaded only to the ephemeral GitHub Actions runner. The ZIP contained 13 regional CSVs. The intake parser produced an aggregate province-week panel with:

- 154 rows: 77 provinces × MMWR weeks 44 and 45 of 2026
- Week 44 starts 1 November 2026; national reported total 1,437 cases
- Week 45 starts 8 November 2026; national reported total 1,298 cases
- 77/77 provinces in both weeks; all incoming province labels matched the Phase 13 historical source
- Zero duplicate province-week keys, parse errors, missing/negative case counts

The raw ZIP and joined TanRabad case panel were kept in runner temporary storage and were not uploaded as workflow artifacts.

## 2. Open-Meteo weather source-equivalence check

The original Phase 13 feature contract includes `w_apparent_temperature_mean_L1`. The latest historical source ended at 25 October 2026 and therefore had no source weather rows for the new TanRabad weeks. The weekly workflow fetched daily `apparent_temperature_mean` from the Open-Meteo Historical Weather API using the `best_match` model, Asia/Bangkok timezone and Celsius units, then averaged seven daily values into Sunday-start weeks.

The candidate was compared against the historical Phase 13 weather column over 52 complete overlapping weeks:

| Measure | Result |
|---|---:|
| Matched province-week pairs | 4,004 (52 × 77) |
| MAE | 0.000176 °C |
| RMSE | 0.006520 °C |
| Mean bias (API − source) | 0.000071 °C |
| Pearson correlation | 0.9999985 |

New-weather coverage was 77/77 provinces for both 1 November and 8 November 2026. The `era5_land` candidate returned null values for the requested apparent-temperature variable in the comparison request, so it was not used. The successful bridge candidate was `best_match`.

This is strong empirical evidence of close agreement with the model-source weather series over the tested period; it does not establish the undisclosed upstream provenance of the older weather column.

## 3. Reconstructed original-model input panels

The adapter `scripts/build_tanrabad_current_model_inputs.py` now:

1. checks the 77-province historical Sunday-week grid and exact historical end date (25 October 2026);
2. verifies the incoming 77-province MMWR weeks 44 and 45 panel;
3. requires 154 `best_match` weather values and a passing 52-week compatibility report;
4. appends the new case and weather rows to the historical panel;
5. creates a full panel with a blank-label target week of 15 November 2026.

The original pipeline audit passed:

- Training panel: 95,942 rows, 77 provinces, 1,246 continuous weeks, ending 8 November 2026
- Forecast panel: 96,019 rows, 77 provinces, 1,247 continuous weeks, ending 15 November 2026
- All 95,942 shared training rows matched between the train and full panels
- Exactly 77 target-week rows; target-week cases and target-week weather were blank
- The forecast's lagged apparent-temperature feature therefore came from week 45 (8 November), not from the target week

Neither reconstructed panel was uploaded as an artifact.

## 4. Original Phase 13 12-feature model result

The unmodified model pipeline inside `scripts/phase13-model-source-bundle.zip` was expanded and executed. Its 12-feature contract was preserved, including `w_apparent_temperature_mean_L1`.

| Model/evaluation item | Result |
|---|---:|
| Selected objective / rounds | Quantile 0.50 / 400 |
| Temporal CV | 4 folds × 8 validation weeks, 4-week embargo gap |
| Retrospective holdout | 26 weeks, 2,002 province-week rows |
| Holdout MAE | 3.943 cases |
| Holdout RMSE | 6.340 cases |
| Holdout WAPE | 27.17% |
| Persistence MAE | 4.339 cases |
| Skill vs persistence | +9.12% |
| Paired weekly MAE difference, model − persistence (95% interval) | −0.396 [−0.485, −0.304] cases |

The 12-feature model was fitted on 95,018 eligible rows after lag warm-up. The holdout is a retrospective rolling-origin evaluation on public historical data, not a sealed independent blind test.

## 5. Week 46 research preview

The model generated all 77 province predictions for the target week beginning **15 November 2026**:

- Aggregate model point forecast: **1,211.85 cases** (approximately 1,212)
- Prediction rows: 77/77; no missing or negative predictions
- Province-level outputs are in the review artifact's `phase13-current-model-review/predictions.csv`

A separate 11-feature case-only comparator produced a 1,213.48-case aggregate preview and holdout MAE 3.933. The two holdout MAEs are very close; the 12-feature model did **not** demonstrate a clear accuracy improvement over the case-only comparator in this run. The weather feature is retained because its input series is now available and validated, not because this evaluation proved it adds predictive skill.

## 6. Release and privacy status

**Review-only current candidate — not published.** No production website data, risk thresholds, public alerts, or deployment were changed. The forecast must not be treated as an official Department of Disease Control figure or used alone for public-health decisions. Validate it against the subsequently reported week 46 cases before operational use.

Workflow artifacts contain model metrics, provenance/audit summaries, model weights, holdout predictions and 77-province forecast outputs. Raw TanRabad source files, raw patient records, and the reconstructed train/full panels were not uploaded.
