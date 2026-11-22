#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate and convert the new 77-province DenguYosoku model outputs.

Expected input files (copied from the model repository):
  source-data/model/holdout_predictions.csv
  source-data/model/predictions.csv
  source-data/model/metrics.json

Outputs:
  public/data/model_predictions.json
  public/data/model_metrics.json

The new model schema is deliberately separate from the legacy ForecastRow
schema. In particular, this adapter does NOT invent watch/alert thresholds,
risk levels, or a four-week rolling baseline.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    from .model_artifact_transaction import publish_file_bundle
    from .model_release_contract import validate_operational_release
except ImportError:  # direct execution: python scripts/convert_model_outputs.py
    from model_artifact_transaction import publish_file_bundle
    from model_release_contract import validate_operational_release

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-data" / "model"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

HISTORY_FILE = SOURCE_DIR / "holdout_predictions.csv"
FORECAST_FILE = SOURCE_DIR / "predictions.csv"
METRICS_FILE = SOURCE_DIR / "metrics.json"

EXPECTED_PROVINCES = 77
HISTORY_COLUMNS = {
    "province", "week_start", "year", "cases", "pred", "persist",
    "seasonal_naive", "climatology", "residual",
}
FORECAST_COLUMNS = {"province", "week_start", "pred"}


class DataValidationError(ValueError):
    """Raised when source model artifacts do not satisfy the data contract."""


def read_csv(path: Path, required_columns: set[str]) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Missing {path.name}: expected it at {path.relative_to(ROOT)}"
        )

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = set(reader.fieldnames or [])
        missing = sorted(required_columns - headers)
        if missing:
            raise DataValidationError(
                f"{path.name} is missing required columns: {', '.join(missing)}"
            )
        rows = list(reader)

    if not rows:
        raise DataValidationError(f"{path.name} contains no data rows")
    return rows


def parse_week(value: str, *, source: str) -> date:
    try:
        parsed = date.fromisoformat(value.strip())
    except (TypeError, ValueError) as exc:
        raise DataValidationError(
            f"{source}: invalid week_start value {value!r}; expected YYYY-MM-DD"
        ) from exc

    # The model defines epidemiological weeks as Sunday-start weeks.
    if parsed.weekday() != 6:
        raise DataValidationError(
            f"{source}: {parsed.isoformat()} is not a Sunday week start"
        )
    return parsed


def parse_number(value: str, *, column: str, source: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise DataValidationError(
            f"{source}: {column} contains a non-numeric value {value!r}"
        ) from exc

    if not math.isfinite(parsed):
        raise DataValidationError(
            f"{source}: {column} contains a non-finite value {value!r}"
        )
    return parsed


def parse_non_negative(value: str, *, column: str, source: str) -> float:
    parsed = parse_number(value, column=column, source=source)
    if parsed < 0:
        raise DataValidationError(
            f"{source}: {column} must be non-negative; got {parsed}"
        )
    return parsed


def load_history() -> tuple[list[dict[str, Any]], list[str], list[date]]:
    source_name = HISTORY_FILE.name
    source_rows = read_csv(HISTORY_FILE, HISTORY_COLUMNS)
    records: list[dict[str, Any]] = []
    provinces: set[str] = set()
    weeks: set[date] = set()
    seen: set[tuple[str, date]] = set()

    for line_number, row in enumerate(source_rows, start=2):
        province = (row.get("province") or "").strip()
        if not province:
            raise DataValidationError(
                f"{source_name}:{line_number}: province is blank"
            )

        week = parse_week(row.get("week_start", ""), source=f"{source_name}:{line_number}")
        key = (province, week)
        if key in seen:
            raise DataValidationError(
                f"{source_name}:{line_number}: duplicate province/week {province}, {week}"
            )
        seen.add(key)
        provinces.add(province)
        weeks.add(week)

        year_value = parse_number(
            row.get("year", ""), column="year", source=f"{source_name}:{line_number}"
        )
        if not year_value.is_integer():
            raise DataValidationError(
                f"{source_name}:{line_number}: year must be an integer; got {year_value}"
            )
        year = int(year_value)
        if year != week.year:
            raise DataValidationError(
                f"{source_name}:{line_number}: year {year} does not match {week.isoformat()}"
            )

        actual = parse_non_negative(
            row.get("cases", ""), column="cases", source=f"{source_name}:{line_number}"
        )
        prediction = parse_non_negative(
            row.get("pred", ""), column="pred", source=f"{source_name}:{line_number}"
        )
        persistence = parse_non_negative(
            row.get("persist", ""), column="persist", source=f"{source_name}:{line_number}"
        )
        seasonal = parse_non_negative(
            row.get("seasonal_naive", ""),
            column="seasonal_naive",
            source=f"{source_name}:{line_number}",
        )
        climatology = parse_non_negative(
            row.get("climatology", ""),
            column="climatology",
            source=f"{source_name}:{line_number}",
        )
        residual = parse_number(
            row.get("residual", ""), column="residual", source=f"{source_name}:{line_number}"
        )

        if not math.isclose(actual - prediction, residual, rel_tol=1e-5, abs_tol=1e-5):
            raise DataValidationError(
                f"{source_name}:{line_number}: residual is inconsistent with cases - pred"
            )

        records.append({
            "province": province,
            "week_start": week.isoformat(),
            "year": year,
            "actual_cases": actual,
            "prediction": prediction,
            "persistence": persistence,
            "seasonal_naive": seasonal,
            "climatology": climatology,
            "residual": residual,
        })

    province_list = sorted(provinces)
    if len(province_list) != EXPECTED_PROVINCES:
        raise DataValidationError(
            f"{source_name}: expected {EXPECTED_PROVINCES} provinces, found {len(province_list)}"
        )

    ordered_weeks = sorted(weeks)
    for week in ordered_weeks:
        week_provinces = {
            province for province, row_week in seen if row_week == week
        }
        if week_provinces != provinces:
            missing = sorted(provinces - week_provinces)
            extra = sorted(week_provinces - provinces)
            raise DataValidationError(
                f"{source_name}: {week} does not contain the same 77 provinces "
                f"(missing={missing}, unexpected={extra})"
            )

    for previous, current in zip(ordered_weeks, ordered_weeks[1:]):
        if (current - previous).days != 7:
            raise DataValidationError(
                f"{source_name}: weekly history has a gap between {previous} and {current}"
            )

    records.sort(key=lambda item: (item["week_start"], item["province"]))
    return records, province_list, ordered_weeks


def load_forecast(expected_provinces: set[str]) -> tuple[list[dict[str, Any]], date]:
    source_name = FORECAST_FILE.name
    source_rows = read_csv(FORECAST_FILE, FORECAST_COLUMNS)
    records: list[dict[str, Any]] = []
    seen_provinces: set[str] = set()
    weeks: set[date] = set()

    for line_number, row in enumerate(source_rows, start=2):
        province = (row.get("province") or "").strip()
        if not province:
            raise DataValidationError(
                f"{source_name}:{line_number}: province is blank"
            )
        if province in seen_provinces:
            raise DataValidationError(
                f"{source_name}:{line_number}: duplicate forecast for {province}"
            )
        seen_provinces.add(province)

        week = parse_week(row.get("week_start", ""), source=f"{source_name}:{line_number}")
        weeks.add(week)
        prediction = parse_non_negative(
            row.get("pred", ""), column="pred", source=f"{source_name}:{line_number}"
        )
        records.append({
            "province": province,
            "week_start": week.isoformat(),
            "year": week.year,
            "prediction": prediction,
        })

    if len(weeks) != 1:
        raise DataValidationError(
            f"{source_name}: expected exactly one forecast week, found "
            f"{', '.join(sorted(w.isoformat() for w in weeks))}"
        )

    missing = sorted(expected_provinces - seen_provinces)
    unexpected = sorted(seen_provinces - expected_provinces)
    if missing or unexpected or len(records) != EXPECTED_PROVINCES:
        raise DataValidationError(
            f"{source_name}: forecast must cover exactly the same 77 provinces "
            f"(missing={missing}, unexpected={unexpected}, rows={len(records)})"
        )

    records.sort(key=lambda item: item["province"])
    return records, next(iter(weeks))


def load_metrics() -> dict[str, Any]:
    if not METRICS_FILE.is_file():
        raise FileNotFoundError(
            f"Missing {METRICS_FILE.name}: expected it at {METRICS_FILE.relative_to(ROOT)}"
        )

    try:
        metrics = json.loads(METRICS_FILE.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise DataValidationError(f"{METRICS_FILE.name} is not valid JSON: {exc}") from exc

    if not isinstance(metrics, dict):
        raise DataValidationError(f"{METRICS_FILE.name} must contain a JSON object")
    for key in ("mae", "rmse", "eval_cutoff", "features"):
        if key not in metrics:
            raise DataValidationError(
                f"{METRICS_FILE.name} is missing required metric field {key!r}"
            )
    return metrics


def validate_metrics(metrics: dict[str, Any], *, history_rows: int, history_end: date) -> None:
    for key in ("mae", "rmse"):
        value = metrics.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise DataValidationError(f"metrics.json: {key} must be numeric")
        if not math.isfinite(float(value)) or float(value) < 0:
            raise DataValidationError(f"metrics.json: {key} must be finite and non-negative")

    features = metrics.get("features")
    if not isinstance(features, list) or not features or not all(
        isinstance(item, str) and item.strip() for item in features
    ):
        raise DataValidationError("metrics.json: features must be a non-empty list of names")

    try:
        eval_cutoff = date.fromisoformat(str(metrics.get("eval_cutoff", "")))
    except ValueError as exc:
        raise DataValidationError("metrics.json: eval_cutoff must be an ISO date") from exc
    if eval_cutoff < history_end:
        raise DataValidationError(
            f"metrics.json: eval_cutoff {eval_cutoff} is earlier than holdout end {history_end}"
        )

    n_test = metrics.get("n_test")
    if n_test is not None:
        if isinstance(n_test, bool) or not isinstance(n_test, int) or n_test != history_rows:
            raise DataValidationError(
                f"metrics.json: n_test ({n_test!r}) does not match holdout row count ({history_rows})"
            )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
        encoding="utf-8",
    )
    temporary.replace(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and convert the 77-province model outputs.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate all source artifacts and print the publication plan without writing output files",
    )
    parser.add_argument(
        "--require-current",
        action="store_true",
        help="refuse publication when the forecast week is older than the current epidemiological week",
    )
    args = parser.parse_args(argv)

    try:
        history, province_list, history_weeks = load_history()
        forecast, forecast_week = load_forecast(set(province_list))
        metrics = load_metrics()

        if forecast_week <= history_weeks[-1]:
            raise DataValidationError(
                f"forecast week {forecast_week} must be later than the final holdout week {history_weeks[-1]}"
            )
        validate_metrics(
            metrics,
            history_rows=len(history),
            history_end=history_weeks[-1],
        )

        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        bangkok_today = (datetime.now(timezone.utc) + timedelta(hours=7)).date()
        current_week_start = bangkok_today - timedelta(days=(bangkok_today.weekday() + 1) % 7)
        forecast_is_current_or_future = forecast_week >= current_week_start
        forecast_lag_weeks = (
            max(0, (current_week_start - forecast_week).days // 7)
            if forecast_week < current_week_start else 0
        )
        if args.require_current and not forecast_is_current_or_future:
            raise DataValidationError(
                f"forecast week {forecast_week} is {forecast_lag_weeks} epidemiological week(s) behind "
                f"current week {current_week_start}; --require-current prevents publication"
            )
        if args.require_current:
            if forecast_week != current_week_start:
                raise DataValidationError(
                    f"forecast week {forecast_week} must equal current week {current_week_start} "
                    "for a one-week nowcast; --require-current prevents publication"
                )
            provenance_issues = validate_operational_release(
                metrics,
                forecast_week=forecast_week,
                current_week=current_week_start,
                now=datetime.now(timezone.utc),
            )
            if provenance_issues:
                raise DataValidationError(
                    "operational release acceptance failed; --require-current prevents publication: "
                    + "; ".join(provenance_issues)
                )

        manifest_path = SOURCE_DIR / "source_manifest.json"
        if not manifest_path.is_file():
            raise DataValidationError(
                f"{manifest_path.name} is required; run scripts/fetch_model_outputs.py first"
            )
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exc:
            raise DataValidationError(f"{manifest_path.name} is not valid JSON: {exc}") from exc
        if not isinstance(manifest, dict):
            raise DataValidationError(f"{manifest_path.name} must contain a JSON object")

        expected_repository = "https://github.com/johnlovepizza/DenguYosoku"
        if manifest.get("repository") != expected_repository:
            raise DataValidationError(
                f"{manifest_path.name} repository must be {expected_repository}"
            )

        model_revision = manifest.get("commit_sha")
        if not isinstance(model_revision, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", model_revision):
            raise DataValidationError(f"{manifest_path.name} contains an invalid hexadecimal commit_sha")
        model_revision = model_revision.lower()

        source_ref = manifest.get("ref")
        if not isinstance(source_ref, str) or not source_ref.strip():
            raise DataValidationError(f"{manifest_path.name} is missing a non-empty source ref")

        source_retrieved_at = manifest.get("retrieved_at_utc")
        if not isinstance(source_retrieved_at, str):
            raise DataValidationError(f"{manifest_path.name} is missing retrieved_at_utc")
        try:
            retrieved_datetime = datetime.fromisoformat(source_retrieved_at.replace("Z", "+00:00"))
            if retrieved_datetime.tzinfo is None or retrieved_datetime.utcoffset() is None:
                raise ValueError("timezone is required")
        except ValueError as exc:
            raise DataValidationError(
                f"{manifest_path.name} retrieved_at_utc must be an ISO timestamp with an explicit timezone"
            ) from exc

        artifact_manifest = manifest.get("artifacts", {})
        if not isinstance(artifact_manifest, dict):
            raise DataValidationError(f"{manifest_path.name} artifacts must be an object")
        expected_source_paths = {
            HISTORY_FILE.name: "DenguYosoku/holdout_predictions.csv",
            FORECAST_FILE.name: "predict_week/predictions.csv",
            METRICS_FILE.name: "DenguYosoku/metrics.json",
        }
        for artifact_path in (HISTORY_FILE, FORECAST_FILE, METRICS_FILE):
            artifact_info = artifact_manifest.get(artifact_path.name)
            if not isinstance(artifact_info, dict):
                raise DataValidationError(
                    f"{manifest_path.name} is missing artifact metadata for {artifact_path.name}"
                )
            expected_hash = artifact_info.get("sha256")
            expected_size = artifact_info.get("size_bytes")
            expected_source = artifact_info.get("source_path")
            if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash):
                raise DataValidationError(
                    f"{manifest_path.name} is missing a valid SHA-256 for {artifact_path.name}"
                )
            if isinstance(expected_size, bool) or not isinstance(expected_size, int) or expected_size != artifact_path.stat().st_size:
                raise DataValidationError(
                    f"{manifest_path.name} size_bytes does not match {artifact_path.name}"
                )
            if expected_source != expected_source_paths[artifact_path.name]:
                raise DataValidationError(
                    f"{manifest_path.name} source_path does not match the expected artifact for {artifact_path.name}"
                )
            actual_hash = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
            if actual_hash != expected_hash.lower():
                raise DataValidationError(
                    f"{artifact_path.name} does not match the downloaded source_manifest.json hash"
                )

        prediction_payload = {
            "schema_version": 2,
            "model_name": "DenguYosoku LightGBM",
            "source_repository": "https://github.com/johnlovepizza/DenguYosoku",
            "model_revision": model_revision,
            "generated_at_utc": generated_at,
            "province_count": len(province_list),
            "provinces": province_list,
            "history": history,
            "forecast": forecast,
            "coverage": {
                "history_rows": len(history),
                "history_week_count": len(history_weeks),
                "history_start_week": history_weeks[0].isoformat(),
                "history_end_week": history_weeks[-1].isoformat(),
                "forecast_rows": len(forecast),
                "forecast_week": forecast_week.isoformat(),
                "forecast_is_after_history": True,
            },
            "freshness": {
                "timezone": "Asia/Bangkok",
                "source_retrieved_at_utc": source_retrieved_at,
                "converted_at_utc": generated_at,
                "current_week_start_at_conversion": current_week_start.isoformat(),
                "forecast_is_current_or_future_at_conversion": forecast_is_current_or_future,
                "forecast_lag_weeks_at_conversion": forecast_lag_weeks,
            },
            "semantic_notes": {
                "prediction": "Model prediction of weekly reported cases",
                "actual_cases": "Observed target values in the sealed holdout only",
                "persistence": "Previous-week persistence baseline; not a four-week rolling average",
                "risk_levels": "Not supplied by this model export; no watch/alert thresholds or risk levels are inferred",
            },
        }
        metrics_payload = {
            "schema_version": 2,
            "model_name": prediction_payload["model_name"],
            "source_repository": prediction_payload["source_repository"],
            "model_revision": model_revision,
            "generated_at_utc": generated_at,
            "metrics": metrics,
        }

        predictions_path = PUBLIC_DATA_DIR / "model_predictions.json"
        metrics_path = PUBLIC_DATA_DIR / "model_metrics.json"
        predictions_bytes = json.dumps(
            prediction_payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
        metrics_bytes = json.dumps(
            metrics_payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")

        if args.check:
            print("Model artifact preflight passed (--check): no output files were written.")
            print(f"  Forecast week      : {forecast_week}")
            print(f"  Holdout end        : {history_weeks[-1]}")
            print(f"  Source revision    : {model_revision[:12]}")
            print(f"  Predictions SHA256 : {hashlib.sha256(predictions_bytes).hexdigest()}")
            print(f"  Metrics SHA256     : {hashlib.sha256(metrics_bytes).hexdigest()}")
        else:
            publish_file_bundle({predictions_path: predictions_bytes, metrics_path: metrics_bytes})
            print("Model data conversion completed.")
        print(f"  Province coverage : {len(province_list)}")
        print(
            f"  Holdout history   : {len(history):,} rows, "
            f"{history_weeks[0]} to {history_weeks[-1]}"
        )
        print(f"  Forecast           : {len(forecast)} provinces, week {forecast_week}")
        print(f"  Output             : {predictions_path.relative_to(ROOT)}")
        print(f"  Metrics            : {metrics_path.relative_to(ROOT)}")
        if args.check:
            print("  Publication        : CHECK ONLY · existing output files unchanged")
        else:
            print("  Publication        : staged bundle with rollback on replacement errors")
        print(
            f"  Current epi week   : {current_week_start} (Asia/Bangkok)"
        )
        if not forecast_is_current_or_future:
            print(
                f"  WARNING            : forecast is {forecast_lag_weeks} epidemiological "
                "week(s) behind the current week; refresh the source data before using it as current."
            )
        return 0

    except (DataValidationError, FileNotFoundError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
