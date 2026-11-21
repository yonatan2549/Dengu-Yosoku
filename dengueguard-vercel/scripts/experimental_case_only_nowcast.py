#!/usr/bin/env python3
"""Experimental case-only dengue nowcast. Preview only; never auto-publish."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import lightgbm as lgb
import numpy as np
import pandas as pd

CASE_LAGS = (1, 2, 3, 4, 8, 12)
FEATURES = [
    *(f"cases_L{k}" for k in CASE_LAGS),
    "outbreak_momentum",
    "cases_L1_relative",
    "cases_L2_relative",
    "sin_week",
    "cos_week",
]
BASE_PARAMS = {
    "objective": "quantile",
    "alpha": 0.5,
    "metric": "None",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 30,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "lambda_l1": 0.1,
    "lambda_l2": 1.0,
    "max_depth": 6,
    "verbosity": -1,
    "seed": 42,
    "num_threads": 1,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--historical-csv", required=True, type=Path)
    parser.add_argument("--incoming-panel-csv", required=True, type=Path)
    parser.add_argument("--source-commit", default="unknown")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--holdout-weeks", type=int, default=26)
    parser.add_argument("--cv-folds", type=int, default=4)
    parser.add_argument("--cv-weeks", type=int, default=8)
    parser.add_argument("--gap-weeks", type=int, default=4)
    parser.add_argument("--round-grid", default="400,600,800")
    return parser.parse_args()


def build_features(frame: pd.DataFrame, province_baseline: pd.Series, baseline_fill: float) -> pd.DataFrame:
    out = frame.copy()
    grouped = out.groupby("province", sort=False)
    for lag in CASE_LAGS:
        out[f"cases_L{lag}"] = grouped["cases"].shift(lag)

    out["prov_baseline"] = out["province"].map(province_baseline).fillna(baseline_fill)
    out["cases_L1_relative"] = out["cases_L1"] / (out["prov_baseline"] + 1.0)
    out["cases_L2_relative"] = out["cases_L2"] / (out["prov_baseline"] + 1.0)
    out["outbreak_momentum"] = out["cases_L1_relative"] / (out["cases_L2_relative"] + 0.1)

    week_angle = 2 * np.pi * pd.to_numeric(out["week"], errors="coerce").astype(float) / 52.0
    out["sin_week"] = np.sin(week_angle)
    out["cos_week"] = np.cos(week_angle)
    return out


def train_baseline(frame: pd.DataFrame, train_mask: pd.Series) -> tuple[pd.Series, float]:
    train = frame.loc[train_mask]
    province_baseline = train.groupby("province")["cases"].mean()
    baseline_fill = float(train["cases"].mean())
    return province_baseline, baseline_fill


def make_lgb_dataset(frame: pd.DataFrame, positions: np.ndarray) -> lgb.Dataset:
    return lgb.Dataset(
        frame.iloc[positions][FEATURES].to_numpy(dtype=np.float32),
        label=frame.iloc[positions]["cases"].to_numpy(dtype=np.float32),
        free_raw_data=False,
    )


def mae(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.mean(np.abs(actual - predicted)))


def mmwr_week_start(year: int, week: int) -> pd.Timestamp:
    jan4 = pd.Timestamp(year=year, month=1, day=4)
    week1_sunday = jan4 - pd.Timedelta(days=(jan4.weekday() + 1) % 7)
    return week1_sunday + pd.Timedelta(weeks=week - 1)


def mmwr_year_week(week_start: pd.Timestamp) -> tuple[int, int]:
    value = pd.Timestamp(week_start).normalize()
    if value.weekday() != 6:
        raise ValueError(f"MMWR week start must be Sunday; received {value.date()}.")
    for year in (value.year - 1, value.year, value.year + 1):
        for week in range(1, 54):
            if mmwr_week_start(year, week) == value:
                return year, week
    raise ValueError(f"Could not resolve MMWR year/week for {value.date()}.")


def load_and_combine(historical_path: Path, panel_path: Path) -> pd.DataFrame:
    historical = pd.read_csv(historical_path, encoding="utf-8-sig", low_memory=False)
    incoming = pd.read_csv(panel_path, encoding="utf-8-sig")

    required_historical = {"province", "week_start", "week", "cases"}
    missing = required_historical - set(historical.columns)
    if missing:
        raise ValueError(f"Historical source is missing required fields: {sorted(missing)}")

    required_incoming = {"province", "year", "week", "cases"}
    missing = required_incoming - set(incoming.columns)
    if missing:
        raise ValueError(f"TanRabad panel is missing required fields: {sorted(missing)}")

    historical["province"] = historical["province"].astype(str).str.strip()
    historical["week_start"] = pd.to_datetime(historical["week_start"], errors="raise").dt.normalize()
    historical["week"] = pd.to_numeric(historical["week"], errors="raise").astype(int)
    historical["year"] = historical["week_start"].dt.year
    historical["cases"] = pd.to_numeric(historical["cases"], errors="raise")

    incoming["province"] = incoming["province"].astype(str).str.strip()
    incoming["year"] = pd.to_numeric(incoming["year"], errors="raise").astype(int)
    incoming["week"] = pd.to_numeric(incoming["week"], errors="raise").astype(int)
    incoming["cases"] = pd.to_numeric(incoming["cases"], errors="raise")

    historical_provinces = set(historical["province"])
    incoming_provinces = set(incoming["province"])
    if len(historical_provinces) != 77 or len(incoming_provinces) != 77:
        raise ValueError(
            f"Expected 77 provinces in both sources; historical={len(historical_provinces)}, "
            f"TanRabad={len(incoming_provinces)}"
        )
    if historical_provinces != incoming_provinces:
        raise ValueError("TanRabad province names do not exactly match the historical canonical province set.")

    if incoming.duplicated(["province", "year", "week"]).any():
        raise ValueError("Incoming panel must contain unique province-week rows.")

    incoming["week_start"] = [
        mmwr_week_start(int(y), int(w)) for y, w in zip(incoming["year"], incoming["week"])
    ]
    if incoming.duplicated(["province", "week_start"]).any():
        raise ValueError("Duplicate province-week rows found in the incoming panel.")

    incoming_weeks = sorted(pd.to_datetime(incoming["week_start"]).unique())
    if not incoming_weeks:
        raise ValueError("Incoming 77-province panel is empty.")
    for previous, current in zip(incoming_weeks, incoming_weeks[1:]):
        if pd.Timestamp(current) - pd.Timestamp(previous) != pd.Timedelta(weeks=1):
            raise ValueError(f"Incoming panel has a weekly gap between {previous} and {current}.")
    for week_start, group in incoming.groupby("week_start"):
        if len(group) != 77 or group["province"].nunique() != 77:
            raise ValueError(f"MMWR week {pd.Timestamp(week_start).date()} does not contain exactly 77 unique provinces.")
    if len(incoming) != len(incoming_weeks) * 77:
        raise ValueError("Incoming panel row count does not match 77 provinces per consecutive week.")

    historical_latest = historical["week_start"].max()
    incoming_latest = incoming["week_start"].max()
    incoming_earliest = incoming["week_start"].min()
    if incoming_earliest != historical_latest + pd.Timedelta(weeks=1):
        raise ValueError(
            f"Incoming series does not immediately follow historical source: "
            f"historical latest={historical_latest.date()}, incoming first={incoming_earliest.date()}."
        )

    rows_to_append = pd.DataFrame(index=range(len(incoming)), columns=historical.columns)
    for column in ("province", "week_start", "week", "year", "cases"):
        rows_to_append[column] = incoming[column].to_numpy()

    combined = pd.concat([historical, rows_to_append], ignore_index=True, sort=False)
    combined["week_start"] = pd.to_datetime(combined["week_start"], errors="raise").dt.normalize()
    combined["province"] = combined["province"].astype(str).str.strip()
    combined["cases"] = pd.to_numeric(combined["cases"], errors="raise")
    combined["week"] = pd.to_numeric(combined["week"], errors="raise").astype(int)
    combined = combined.sort_values(["province", "week_start"]).reset_index(drop=True)

    if combined.duplicated(["province", "week_start"]).any():
        raise ValueError("Combined panel has duplicate province-week keys.")
    if (combined["cases"] < 0).any() or not np.isfinite(combined["cases"]).all():
        raise ValueError("Combined panel contains negative or non-finite case labels.")

    all_dates = sorted(combined["week_start"].unique())
    if any(pd.Timestamp(b) - pd.Timestamp(a) != pd.Timedelta(weeks=1) for a, b in zip(all_dates, all_dates[1:])):
        raise ValueError("Combined weekly grid contains a missing epidemiological week.")

    weekly_counts = combined.groupby("week_start")["province"].nunique()
    if not (weekly_counts == 77).all():
        raise ValueError("Combined panel does not contain all 77 provinces in every week.")

    return combined


def select_rounds(
    frame: pd.DataFrame,
    dates: list[pd.Timestamp],
    holdout_start: pd.Timestamp,
    folds_count: int,
    cv_weeks: int,
    gap_weeks: int,
    round_grid: Iterable[int],
) -> tuple[int, float, list[dict]]:
    train_dates = [d for d in dates if d < holdout_start]
    tail_needed = folds_count * (cv_weeks + gap_weeks)
    if len(train_dates) <= tail_needed + 80:
        raise ValueError("Not enough training weeks to create expanding temporal CV folds.")

    tail_start = len(train_dates) - tail_needed
    folds = []
    for fold_index in range(folds_count):
        val_start_idx = tail_start + fold_index * (cv_weeks + gap_weeks)
        val_dates = train_dates[val_start_idx:val_start_idx + cv_weeks]
        train_dates_fold = train_dates[:max(0, val_start_idx - gap_weeks)]
        if len(val_dates) != cv_weeks or len(train_dates_fold) < 80:
            raise ValueError("Could not construct the requested temporal CV folds.")
        folds.append((train_dates_fold, val_dates))

    scores = []
    for rounds in round_grid:
        fold_maes = []
        for train_dates_fold, val_dates in folds:
            train_mask = frame["week_start"].isin(train_dates_fold)
            province_baseline, baseline_fill = train_baseline(frame, train_mask)
            engineered = build_features(frame, province_baseline, baseline_fill)

            train_mask = engineered["week_start"].isin(train_dates_fold) & engineered[FEATURES].notna().all(axis=1)
            val_mask = engineered["week_start"].isin(val_dates) & engineered[FEATURES].notna().all(axis=1)
            train_pos = np.flatnonzero(train_mask.to_numpy())
            val_pos = np.flatnonzero(val_mask.to_numpy())
            if len(train_pos) < 1000 or len(val_pos) != cv_weeks * 77:
                raise ValueError("CV fold row counts do not match complete 77-province weeks.")

            model = lgb.train(
                BASE_PARAMS,
                make_lgb_dataset(engineered, train_pos),
                num_boost_round=rounds,
            )
            pred = np.clip(model.predict(
                engineered.iloc[val_pos][FEATURES].to_numpy(dtype=np.float32)
            ), 0, None)
            actual = engineered.iloc[val_pos]["cases"].to_numpy(dtype=float)
            fold_maes.append(mae(actual, pred))
        scores.append({
            "rounds": int(rounds),
            "cv_mae": float(np.mean(fold_maes)),
            "fold_mae": [float(x) for x in fold_maes],
        })

    best = min(scores, key=lambda row: row["cv_mae"])
    return int(best["rounds"]), float(best["cv_mae"]), scores


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    round_grid = [int(x.strip()) for x in args.round_grid.split(",") if x.strip()]
    if not round_grid or any(x < 100 for x in round_grid):
        raise ValueError("round-grid must contain integers >= 100.")

    frame = load_and_combine(args.historical_csv, args.incoming_panel_csv)
    dates = [pd.Timestamp(x) for x in sorted(frame["week_start"].unique())]
    holdout_dates = dates[-args.holdout_weeks:]
    if len(holdout_dates) != args.holdout_weeks:
        raise ValueError("Insufficient weeks for the requested retrospective holdout.")
    holdout_start = holdout_dates[0]

    baseline_train_mask = frame["week_start"] < holdout_start
    province_baseline, baseline_fill = train_baseline(frame, baseline_train_mask)
    engineered = build_features(frame, province_baseline, baseline_fill)

    train_mask = (engineered["week_start"] < holdout_start) & engineered[FEATURES].notna().all(axis=1)
    holdout_mask = (engineered["week_start"].isin(holdout_dates)) & engineered[FEATURES].notna().all(axis=1)
    train_pos = np.flatnonzero(train_mask.to_numpy())
    holdout_pos = np.flatnonzero(holdout_mask.to_numpy())
    if len(holdout_pos) != args.holdout_weeks * 77:
        raise ValueError("Holdout rows do not match complete 77-province weekly panel.")

    best_rounds, cv_mae, cv_scores = select_rounds(
        frame, dates, holdout_start, args.cv_folds,
        args.cv_weeks, args.gap_weeks, round_grid
    )

    holdout_model = lgb.train(
        BASE_PARAMS,
        make_lgb_dataset(engineered, train_pos),
        num_boost_round=best_rounds,
    )
    holdout_pred = np.clip(holdout_model.predict(
        engineered.iloc[holdout_pos][FEATURES].to_numpy(dtype=np.float32)
    ), 0, None)
    holdout_actual = engineered.iloc[holdout_pos]["cases"].to_numpy(dtype=float)
    persistence = engineered.iloc[holdout_pos]["cases_L1"].to_numpy(dtype=float)

    holdout_mae = mae(holdout_actual, holdout_pred)
    persistence_mae = mae(holdout_actual, persistence)
    holdout_rmse = float(np.sqrt(np.mean((holdout_actual - holdout_pred) ** 2)))
    holdout_wape = float(np.sum(np.abs(holdout_actual - holdout_pred)) / np.sum(np.abs(holdout_actual)))
    skill = float((persistence_mae - holdout_mae) / persistence_mae * 100.0)

    holdout_output = engineered.iloc[holdout_pos][["province", "week_start", "cases"]].copy()
    holdout_output["pred_case_only"] = holdout_pred
    holdout_output["persistence"] = persistence
    holdout_output["residual"] = holdout_actual - holdout_pred
    holdout_output["week_start"] = holdout_output["week_start"].dt.strftime("%Y-%m-%d")
    holdout_output.to_csv(
        args.output_dir / "experimental_case_only_holdout_predictions.csv",
        index=False, encoding="utf-8-sig"
    )

    # Refit on every labelled week through MMWR week 45.
    all_baseline, all_baseline_fill = train_baseline(frame, pd.Series(True, index=frame.index))
    full_engineered = build_features(frame, all_baseline, all_baseline_fill)
    full_train_mask = full_engineered["cases"].notna() & full_engineered[FEATURES].notna().all(axis=1)
    full_train_pos = np.flatnonzero(full_train_mask.to_numpy())
    final_model = lgb.train(
        BASE_PARAMS,
        make_lgb_dataset(full_engineered, full_train_pos),
        num_boost_round=best_rounds,
    )

    latest_observed = max(dates)
    target_week_start = latest_observed + pd.Timedelta(weeks=1)
    target_year, target_week = mmwr_year_week(target_week_start)
    provinces = sorted(frame["province"].unique())
    future_rows = pd.DataFrame({
        "province": provinces,
        "week_start": target_week_start,
        "week": target_week,
        "year": target_year,
        "cases": np.nan,
    })
    combined_future = pd.concat([frame, future_rows], ignore_index=True, sort=False)
    combined_future = combined_future.sort_values(["province", "week_start"]).reset_index(drop=True)
    future_engineered = build_features(combined_future, all_baseline, all_baseline_fill)
    future_mask = future_engineered["week_start"] == target_week_start
    future = future_engineered.loc[future_mask].copy()
    if len(future) != 77 or future[FEATURES].isna().any().any():
        raise ValueError("Forecast feature panel is incomplete; refusing to emit a partial 77-province preview.")

    forecast = np.clip(
        final_model.predict(future[FEATURES].to_numpy(dtype=np.float32)), 0, None
    )
    forecast_output = future[["province", "week_start", "cases_L1"]].copy()
    forecast_output = forecast_output.rename(columns={"cases_L1": "persistence_cases"})
    forecast_output["predicted_cases_case_only"] = forecast
    forecast_output["week_start"] = forecast_output["week_start"].dt.strftime("%Y-%m-%d")
    forecast_output = forecast_output.sort_values("province").reset_index(drop=True)
    forecast_output.to_csv(
        args.output_dir / "experimental_case_only_forecast_preview.csv",
        index=False, encoding="utf-8-sig"
    )

    latest_week_total = float(forecast_output["persistence_cases"].sum())
    predicted_total = float(forecast_output["predicted_cases_case_only"].sum())
    status = "candidate_ready_for_review" if skill > 0 else "not_recommended_vs_persistence"

    metrics = {
        "status": status,
        "release_status": "preview_only_not_for_public_health_release",
        "model_variant": "case_only_lightgbm_quantile50_experimental",
        "model_change": "This separate experimental variant uses case-history and calendar features only; it does not consume apparent-temperature inputs.",
        "features": FEATURES,
        "feature_count": len(FEATURES),
        "source_upstream_commit": args.source_commit,
        "historical_source_latest_week_start": str(pd.to_datetime(pd.read_csv(args.historical_csv, usecols=["week_start"])["week_start"]).max().date()),
        "latest_observed_week_start": latest_observed.date().isoformat(),
        "target_week_start": target_week_start.date().isoformat(),
        "target_week": target_week,
        "target_year": target_year,
        "province_count": len(provinces),
        "training_rows_after_lag_warmup": int(len(full_train_pos)),
        "cv": {
            "fold_count": args.cv_folds,
            "validation_weeks_per_fold": args.cv_weeks,
            "gap_weeks": args.gap_weeks,
            "round_grid": round_grid,
            "selected_rounds": best_rounds,
            "mean_cv_mae": cv_mae,
            "candidates": cv_scores,
        },
        "retrospective_rolling_origin_holdout": {
            "holdout_weeks": args.holdout_weeks,
            "holdout_start": holdout_dates[0].date().isoformat(),
            "holdout_end": holdout_dates[-1].date().isoformat(),
            "rows": int(len(holdout_pos)),
            "mae": holdout_mae,
            "rmse": holdout_rmse,
            "wape": holdout_wape,
            "persistence_mae": persistence_mae,
            "skill_vs_persistence_pct": skill,
        },
        "preview_aggregate": {
            "predicted_national_total": predicted_total,
            "persistence_national_total": latest_week_total,
        },
        "methodological_notes": [
            "This is a separate experimental case-only model, not the original 12-feature Phase 13 model.",
            "Holdout is retrospective rolling-origin: each holdout week uses the previous actual week as its lag input.",
            "No future or same-week case values are included in model features.",
            "Predictions are a research preview only and are not written to public/data or deployed.",
        ],
    }

    final_model.save_model(str(args.output_dir / "experimental_case_only_model.txt"))
    (args.output_dir / "experimental_case_only_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(
        f"Case-only experiment: target={target_week_start.date()}, provinces={len(provinces)}, "
        f"holdout_MAE={holdout_mae:.4f}, persistence_MAE={persistence_mae:.4f}, "
        f"skill={skill:.2f}%, status={status}."
    )
    print(
        f"Preview aggregate totals: model={predicted_total:.0f}, "
        f"persistence={latest_week_total:.0f}."
    )
    print("No raw source file or incoming aggregate panel was uploaded.")
    print("Preview outputs are research artifacts only; no website data was changed.")


if __name__ == "__main__":
    main()
