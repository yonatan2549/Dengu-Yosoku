#!/usr/bin/env python3
"""Safely bridge upstream history to the newest TanRabad province-week panel.

Only observed aggregate actual_cases from a review-only model snapshot are used.
Predictions, residuals, and the forecast week are never used as case features.
Raw patient-level data are not read by this script.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

EXPECTED_PROVINCES = 77
SNAPSHOT_REPOSITORY = "https://github.com/johnlovepizza/DenguYosoku"
OUTPUT_FIELDS = ["province", "year", "week", "cases"]


class HistoryBridgeError(ValueError):
    """Raised when historical, snapshot, or incoming aggregate data disagree."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _mmwr_first_sunday(year: int) -> dt.date:
    jan1 = dt.date(year, 1, 1)
    return jan1 + dt.timedelta(days=(6 - jan1.weekday()) % 7)


def mmwr_sunday_start(year: int, week: int) -> dt.date:
    first_sunday = _mmwr_first_sunday(year)
    next_year_first_sunday = _mmwr_first_sunday(year + 1)
    max_week = (next_year_first_sunday - first_sunday).days // 7
    if not 1 <= week <= max_week:
        raise HistoryBridgeError(f"Invalid MMWR week {year}-W{week}; {year} has {max_week} MMWR weeks.")
    return first_sunday + dt.timedelta(weeks=week - 1)


def mmwr_year_week(week_start: dt.date) -> tuple[int, int]:
    if week_start.weekday() != 6:
        raise HistoryBridgeError(f"Week start {week_start} is not Sunday.")
    for year in (week_start.year - 1, week_start.year, week_start.year + 1):
        first_sunday = _mmwr_first_sunday(year)
        next_year_first_sunday = _mmwr_first_sunday(year + 1)
        if first_sunday <= week_start < next_year_first_sunday:
            week = ((week_start - first_sunday).days // 7) + 1
            if mmwr_sunday_start(year, week) == week_start:
                return year, week
    raise HistoryBridgeError(f"Could not resolve MMWR year/week for {week_start}.")

def parse_case_count(value: Any, label: str) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise HistoryBridgeError(f"{label} is not numeric.") from exc
    if not math.isfinite(number) or number < 0 or not number.is_integer():
        raise HistoryBridgeError(f"{label} must be a finite non-negative integer.")
    return int(number)


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fields = list(reader.fieldnames or [])
            if not fields:
                raise HistoryBridgeError(f"{path.name} has no CSV header.")
            return fields, list(reader)
    except OSError as exc:
        raise HistoryBridgeError(f"Unable to read {path}: {exc}") from exc


def validate_weekly_panel(
    cases: dict[tuple[str, dt.date], int],
    provinces: set[str],
    label: str,
    *,
    require_consecutive: bool = True,
) -> list[dt.date]:
    if len(provinces) != EXPECTED_PROVINCES:
        raise HistoryBridgeError(f"{label} must cover exactly 77 provinces; found {len(provinces)}.")
    weeks = sorted({week for _, week in cases})
    if not weeks:
        raise HistoryBridgeError(f"{label} contains no weekly rows.")
    for week in weeks:
        covered = {province for province, observed_week in cases if observed_week == week}
        if covered != provinces:
            raise HistoryBridgeError(f"{label} week {week} does not contain exactly 77 canonical provinces.")
    if require_consecutive:
        for previous, current in zip(weeks, weeks[1:]):
            if current - previous != dt.timedelta(days=7):
                raise HistoryBridgeError(f"{label} has a weekly gap between {previous} and {current}.")
    return weeks


def load_historical(path: Path) -> tuple[set[str], dict[tuple[str, dt.date], int], list[dt.date]]:
    fields, rows = read_csv(path)
    required = {"province", "week_start", "cases"}
    missing = required - set(fields)
    if missing:
        raise HistoryBridgeError(f"Historical source is missing columns: {sorted(missing)}.")
    cases: dict[tuple[str, dt.date], int] = {}
    provinces: set[str] = set()
    for index, row in enumerate(rows, start=2):
        province = (row.get("province") or "").strip()
        if not province:
            raise HistoryBridgeError(f"Historical source line {index} has a blank province.")
        try:
            week = dt.date.fromisoformat((row.get("week_start") or "").strip()[:10])
        except ValueError as exc:
            raise HistoryBridgeError(f"Historical source line {index} has an invalid week_start.") from exc
        if week.weekday() != 6:
            raise HistoryBridgeError(f"Historical source line {index} is not a Sunday-start week.")
        key = (province, week)
        if key in cases:
            raise HistoryBridgeError(f"Duplicate historical province-week row: {province}/{week}.")
        cases[key] = parse_case_count(row.get("cases"), f"Historical cases {province}/{week}")
        provinces.add(province)
    weeks = validate_weekly_panel(cases, provinces, "Historical source")
    return provinces, cases, weeks


def load_incoming(path: Path, canonical_provinces: set[str]) -> tuple[dict[tuple[str, dt.date], int], list[dt.date]]:
    fields, rows = read_csv(path)
    required = {"province", "year", "week", "cases"}
    missing = required - set(fields)
    if missing:
        raise HistoryBridgeError(f"Incoming TanRabad panel is missing columns: {sorted(missing)}.")
    cases: dict[tuple[str, dt.date], int] = {}
    for index, row in enumerate(rows, start=2):
        province = (row.get("province") or "").strip()
        if province not in canonical_provinces:
            raise HistoryBridgeError(f"Incoming panel has a blank or unknown province on line {index}.")
        try:
            year_number = float(row.get("year") or "")
            week_number = float(row.get("week") or "")
        except (TypeError, ValueError) as exc:
            raise HistoryBridgeError(f"Incoming panel line {index} has invalid MMWR year/week.") from exc
        if not year_number.is_integer() or not week_number.is_integer():
            raise HistoryBridgeError(f"Incoming panel line {index} has non-integer MMWR year/week.")
        year, week = int(year_number), int(week_number)
        week_start = mmwr_sunday_start(year, week)
        key = (province, week_start)
        if key in cases:
            raise HistoryBridgeError(f"Duplicate incoming province-week row: {province}/{week_start}.")
        cases[key] = parse_case_count(row.get("cases"), f"Incoming cases {province}/{week_start}")
    observed_provinces = {province for province, _ in cases}
    if observed_provinces != canonical_provinces:
        missing_provinces = sorted(canonical_provinces - observed_provinces)
        extra_provinces = sorted(observed_provinces - canonical_provinces)
        raise HistoryBridgeError(
            f"Incoming province set differs from canonical list; missing={missing_provinces}, extra={extra_provinces}."
        )
    weeks = validate_weekly_panel(cases, canonical_provinces, "Incoming TanRabad panel")
    return cases, weeks


def load_snapshot_actuals(
    path: Path,
    canonical_provinces: set[str],
) -> tuple[dict[tuple[str, dt.date], int], dict[str, Any]]:
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HistoryBridgeError(f"Unable to read model snapshot: {exc}") from exc
    if not isinstance(snapshot, dict) or snapshot.get("release_status") != "review_only":
        raise HistoryBridgeError("History bridge accepts only a review_only Model Snapshot.")
    if snapshot.get("source_repository") != SNAPSHOT_REPOSITORY:
        raise HistoryBridgeError("Model Snapshot source repository does not match the Phase 13 source.")
    provinces = snapshot.get("provinces")
    if not isinstance(provinces, list) or len(provinces) != EXPECTED_PROVINCES:
        raise HistoryBridgeError("Model Snapshot must list exactly 77 provinces.")
    if len(set(provinces)) != EXPECTED_PROVINCES or set(provinces) != canonical_provinces:
        raise HistoryBridgeError("Model Snapshot provinces do not exactly match the canonical 77-province set.")
    history = snapshot.get("history")
    if not isinstance(history, list) or not history:
        raise HistoryBridgeError("Model Snapshot has no historical observed-case rows.")
    coverage = snapshot.get("coverage") or {}
    if coverage.get("history_rows") != len(history):
        raise HistoryBridgeError("Model Snapshot history row count does not match its coverage metadata.")

    cases: dict[tuple[str, dt.date], int] = {}
    for index, row in enumerate(history, start=1):
        if not isinstance(row, dict):
            raise HistoryBridgeError(f"Model Snapshot history row {index} is malformed.")
        province = row.get("province")
        if province not in canonical_provinces:
            raise HistoryBridgeError(f"Model Snapshot history row {index} contains an unknown province.")
        try:
            week = dt.date.fromisoformat(str(row.get("week_start") or "")[:10])
        except ValueError as exc:
            raise HistoryBridgeError(f"Model Snapshot history row {index} has an invalid week_start.") from exc
        if week.weekday() != 6:
            raise HistoryBridgeError(f"Model Snapshot history row {index} is not a Sunday-start week.")
        key = (province, week)
        if key in cases:
            raise HistoryBridgeError(f"Duplicate Model Snapshot actual row: {province}/{week}.")
        if "actual_cases" not in row:
            raise HistoryBridgeError("Model Snapshot history is missing actual_cases.")
        cases[key] = parse_case_count(row.get("actual_cases"), f"Snapshot actual_cases {province}/{week}")

    weeks = validate_weekly_panel(cases, canonical_provinces, "Model Snapshot actual history")
    if coverage.get("history_end_week") != weeks[-1].isoformat():
        raise HistoryBridgeError("Model Snapshot history_end_week does not match observed history rows.")
    if snapshot.get("forecast", []) and any(
        row.get("week_start") <= weeks[-1].isoformat() for row in snapshot.get("forecast", [])
    ):
        raise HistoryBridgeError("Model Snapshot forecast overlaps its historical actual-case panel.")
    metadata = {
        "model_revision": snapshot.get("model_revision"),
        "source_data_revision": snapshot.get("source_data_revision"),
        "forecast_week": coverage.get("forecast_week"),
        "history_end_week": weeks[-1].isoformat(),
        "history_rows": len(history),
    }
    return cases, metadata


def merge_history_bridge(
    historical_csv: Path,
    snapshot_json: Path,
    incoming_panel_csv: Path,
    output_panel_csv: Path,
    output_report_json: Path,
) -> dict[str, Any]:
    canonical_provinces, historical_cases, historical_weeks = load_historical(historical_csv)
    snapshot_cases, snapshot_metadata = load_snapshot_actuals(snapshot_json, canonical_provinces)
    incoming_cases, incoming_weeks = load_incoming(incoming_panel_csv, canonical_provinces)

    historical_end = historical_weeks[-1]
    incoming_end = incoming_weeks[-1]
    if incoming_end <= historical_end:
        raise HistoryBridgeError(
            f"Incoming latest week {incoming_end} is not later than historical end {historical_end}."
        )

    # Verify any overlap with the original full source before using incoming data.
    incoming_by_key = incoming_cases
    overlapping_historical = sorted(set(incoming_cases) & set(historical_cases))
    for key in overlapping_historical:
        if incoming_cases[key] != historical_cases[key]:
            raise HistoryBridgeError(
                f"Incoming case count conflicts with historical source for {key[0]}/{key[1]}."
            )

    # Verify overlapping Model Snapshot actuals against incoming and historical rows.
    for key, snapshot_value in snapshot_cases.items():
        if key in incoming_cases and incoming_cases[key] != snapshot_value:
            raise HistoryBridgeError(
                f"TanRabad and Model Snapshot actual_cases disagree for {key[0]}/{key[1]}."
            )
        if key in historical_cases and historical_cases[key] != snapshot_value:
            raise HistoryBridgeError(
                f"Historical source and Model Snapshot actual_cases disagree for {key[0]}/{key[1]}."
            )

    required_weeks: list[dt.date] = []
    current = historical_end + dt.timedelta(days=7)
    while current <= incoming_end:
        required_weeks.append(current)
        current += dt.timedelta(days=7)
    if not required_weeks or required_weeks[-1] != incoming_end:
        raise HistoryBridgeError("Incoming data do not connect to the historical weekly grid.")

    extension: dict[tuple[str, dt.date], int] = {}
    bridged_weeks: list[dt.date] = []
    incoming_used_weeks: list[dt.date] = []
    for week in required_weeks:
        incoming_week = {
            province: value for (province, observed_week), value in incoming_cases.items()
            if observed_week == week
        }
        snapshot_week = {
            province: value for (province, observed_week), value in snapshot_cases.items()
            if observed_week == week
        }
        if incoming_week:
            if set(incoming_week) != canonical_provinces:
                raise HistoryBridgeError(f"Incoming week {week} does not contain all 77 provinces.")
            if snapshot_week and snapshot_week != incoming_week:
                raise HistoryBridgeError(f"Snapshot overlap differs from incoming TanRabad values for {week}.")
            chosen = incoming_week
            incoming_used_weeks.append(week)
        elif snapshot_week:
            if set(snapshot_week) != canonical_provinces:
                raise HistoryBridgeError(f"Snapshot bridge week {week} does not contain all 77 provinces.")
            chosen = snapshot_week
            bridged_weeks.append(week)
        else:
            raise HistoryBridgeError(
                f"Missing a complete 77-province source week for {week}; neither TanRabad nor snapshot actuals cover it."
            )
        for province, value in chosen.items():
            extension[(province, week)] = value

    extension_weeks = sorted({week for _, week in extension})
    if extension_weeks != required_weeks:
        raise HistoryBridgeError("Merged extension does not form a contiguous weekly grid.")
    if len(extension) != EXPECTED_PROVINCES * len(required_weeks):
        raise HistoryBridgeError("Merged extension row count does not match 77 provinces per week.")

    output_panel_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_panel_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for province, week in sorted(extension, key=lambda item: (item[1], item[0])):
            year, week_number = mmwr_year_week(week)
            writer.writerow({
                "province": province,
                "year": year,
                "week": week_number,
                "cases": extension[(province, week)],
            })

    report = {
        "status": "passed",
        "expected_provinces": EXPECTED_PROVINCES,
        "historical_source": {
            "end_week": historical_end.isoformat(),
            "week_count": len(historical_weeks),
            "sha256": sha256_file(historical_csv),
        },
        "snapshot_bridge": {
            **snapshot_metadata,
            "sha256": sha256_file(snapshot_json),
            "bridged_weeks": [week.isoformat() for week in bridged_weeks],
            "bridged_rows": len(bridged_weeks) * EXPECTED_PROVINCES,
        },
        "incoming_tanrabad": {
            "weeks": [week.isoformat() for week in incoming_weeks],
            "rows": len(incoming_cases),
            "sha256": sha256_file(incoming_panel_csv),
        },
        "merged_extension": {
            "weeks": [week.isoformat() for week in extension_weeks],
            "week_count": len(extension_weeks),
            "rows": len(extension),
            "province_count": EXPECTED_PROVINCES,
            "rows_per_week": EXPECTED_PROVINCES,
            "incoming_weeks_used": [week.isoformat() for week in incoming_used_weeks],
            "target_week": (incoming_end + dt.timedelta(days=7)).isoformat(),
            "output_sha256": sha256_file(output_panel_csv),
        },
        "case_features_used": ["actual_cases"],
        "prediction_values_used": False,
        "forecast_week_actuals_used": False,
        "raw_patient_records_included": False,
    }
    output_report_json.parent.mkdir(parents=True, exist_ok=True)
    output_report_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bridge observed model-snapshot history to a current TanRabad panel.")
    parser.add_argument("--historical-csv", required=True, type=Path)
    parser.add_argument("--snapshot-json", required=True, type=Path)
    parser.add_argument("--incoming-panel-csv", required=True, type=Path)
    parser.add_argument("--output-panel-csv", required=True, type=Path)
    parser.add_argument("--output-report-json", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = merge_history_bridge(
        args.historical_csv,
        args.snapshot_json,
        args.incoming_panel_csv,
        args.output_panel_csv,
        args.output_report_json,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Only aggregate observed cases were joined; predictions and forecast-week actuals were not used.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HistoryBridgeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
