#!/usr/bin/env python3
"""Build leakage-safe Phase 13 inputs from the TanRabad panel and Open-Meteo weather.

Raw source files and the joined model input panels remain in ephemeral runner storage.
Only the aggregate build report should be uploaded as an artifact.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

EXPECTED_PROVINCES = 77
WEATHER_MODEL = "best_match"
OUTPUT_FIELDS = [
    "province", "week_start", "week", "cases",
    "w_apparent_temperature_mean",
]


class BuildInputError(ValueError):
    """Raised when the incoming data cannot safely extend the Phase 13 panel."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_number(value: Any, field: str, *, allow_blank: bool = False) -> float | None:
    raw = "" if value is None else str(value).strip()
    if not raw and allow_blank:
        return None
    try:
        number = float(raw)
    except (TypeError, ValueError) as exc:
        raise BuildInputError(f"{field} is not numeric.") from exc
    if not math.isfinite(number):
        raise BuildInputError(f"{field} must be finite.")
    return number


def mmwr_sunday_start(year: int, week: int) -> dt.date:
    if not 1 <= week <= 53:
        raise BuildInputError(f"Invalid MMWR week: {year}-W{week}.")
    jan1 = dt.date(year, 1, 1)
    first_sunday = jan1 + dt.timedelta(days=(6 - jan1.weekday()) % 7)
    return first_sunday + dt.timedelta(weeks=week - 1)


def mmwr_year_week(week_start: dt.date) -> tuple[int, int]:
    if week_start.weekday() != 6:
        raise BuildInputError(f"Week start {week_start} is not Sunday.")
    for year in (week_start.year - 1, week_start.year, week_start.year + 1):
        for week in range(1, 54):
            if mmwr_sunday_start(year, week) == week_start:
                return year, week
    raise BuildInputError(f"Could not resolve MMWR year/week for {week_start}.")


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        if not fields:
            raise BuildInputError(f"{path.name} has no CSV header.")
        return fields, list(reader)


def _validate_historical(rows: list[dict[str, str]], fields: list[str]) -> tuple[set[str], list[dt.date]]:
    required = {"province", "week_start", "cases", "w_apparent_temperature_mean"}
    missing = required - set(fields)
    if missing:
        raise BuildInputError(f"Historical source is missing columns: {sorted(missing)}.")

    provinces: set[str] = set()
    weeks: set[dt.date] = set()
    province_week_keys: set[tuple[str, dt.date]] = set()
    by_week: dict[dt.date, set[str]] = defaultdict(set)
    for index, row in enumerate(rows, start=2):
        province = (row.get("province") or "").strip()
        if not province:
            raise BuildInputError(f"Historical source line {index} has a blank province.")
        try:
            week_start = dt.date.fromisoformat((row.get("week_start") or "").strip()[:10])
        except ValueError as exc:
            raise BuildInputError(f"Historical source line {index} has invalid week_start.") from exc
        if week_start.weekday() != 6:
            raise BuildInputError(f"Historical source week_start {week_start} is not Sunday.")
        key = (province, week_start)
        if key in province_week_keys:
            raise BuildInputError(f"Duplicate historical province-week key for {province}/{week_start}.")
        province_week_keys.add(key)
        provinces.add(province)
        weeks.add(week_start)
        by_week[week_start].add(province)

        cases = parse_number(row.get("cases"), "historical cases")
        if cases is None or cases < 0:
            raise BuildInputError(f"Historical cases are missing or negative for {province}/{week_start}.")
        parse_number(row.get("w_apparent_temperature_mean"), "historical apparent temperature", allow_blank=True)

    if len(provinces) != EXPECTED_PROVINCES:
        raise BuildInputError(f"Historical source must contain 77 provinces; found {len(provinces)}.")
    ordered_weeks = sorted(weeks)
    for week in ordered_weeks:
        if by_week[week] != provinces:
            raise BuildInputError(f"Historical week {week} does not cover all 77 provinces.")
    for previous, current in zip(ordered_weeks, ordered_weeks[1:]):
        if current - previous != dt.timedelta(days=7):
            raise BuildInputError(f"Historical weekly grid gap between {previous} and {current}.")
    if not ordered_weeks:
        raise BuildInputError("Historical source contains no weekly observations.")
    return provinces, ordered_weeks


def _read_incoming(
    path: Path,
    canonical_provinces: set[str],
    historical_latest: dt.date,
) -> tuple[dict[tuple[str, dt.date], int], dict[str, int], list[dt.date]]:
    fields, rows = _read_csv(path)
    required = {"province", "year", "week", "cases"}
    missing = required - set(fields)
    if missing:
        raise BuildInputError(f"TanRabad extension panel is missing columns: {sorted(missing)}.")

    cases_by_key: dict[tuple[str, dt.date], int] = {}
    incoming_coverage: dict[str, set[str]] = defaultdict(set)
    incoming_provinces: set[str] = set()
    for index, row in enumerate(rows, start=2):
        province = (row.get("province") or "").strip()
        if not province:
            raise BuildInputError(f"Incoming weekly panel line {index} has a blank province.")
        year_number = parse_number(row.get("year"), "Incoming MMWR year")
        week_number = parse_number(row.get("week"), "Incoming MMWR week")
        case_number = parse_number(row.get("cases"), "Incoming cases")
        if year_number is None or week_number is None or case_number is None:
            raise BuildInputError("Incoming weekly panel contains a missing value.")
        if not year_number.is_integer() or not week_number.is_integer() or not case_number.is_integer():
            raise BuildInputError("Incoming MMWR year/week and case counts must be integers.")
        year, week, cases = int(year_number), int(week_number), int(case_number)
        if cases < 0:
            raise BuildInputError("Incoming weekly panel contains a negative case count.")
        week_start = mmwr_sunday_start(year, week)
        if week_start <= historical_latest:
            raise BuildInputError(
                f"Incoming extension week {week_start} does not follow historical end {historical_latest}."
            )
        key = (province, week_start)
        if key in cases_by_key:
            raise BuildInputError(f"Duplicate incoming province-week key for {province}/{week_start}.")
        cases_by_key[key] = cases
        incoming_provinces.add(province)
        incoming_coverage[week_start.isoformat()].add(province)

    if incoming_provinces != canonical_provinces:
        missing = sorted(canonical_provinces - incoming_provinces)
        extra = sorted(incoming_provinces - canonical_provinces)
        raise BuildInputError(
            f"Incoming province set differs from historical source; missing={missing}, extra={extra}."
        )
    if not cases_by_key:
        raise BuildInputError("Incoming weekly panel is empty.")

    weeks = sorted({week for _, week in cases_by_key})
    if weeks[0] != historical_latest + dt.timedelta(days=7):
        raise BuildInputError(
            f"Incoming extension starts at {weeks[0]}, expected immediately after historical end "
            f"{historical_latest + dt.timedelta(days=7)}."
        )
    for previous, current in zip(weeks, weeks[1:]):
        if current - previous != dt.timedelta(days=7):
            raise BuildInputError(f"Incoming weekly panel has a gap between {previous} and {current}.")
    for week in weeks:
        if incoming_coverage[week.isoformat()] != canonical_provinces:
            raise BuildInputError(f"Incoming week {week} does not contain exactly 77 provinces.")
    if len(cases_by_key) != EXPECTED_PROVINCES * len(weeks):
        raise BuildInputError("Incoming weekly panel row count does not match 77 provinces per week.")

    return (
        cases_by_key,
        {week: len(provinces) for week, provinces in incoming_coverage.items()},
        weeks,
    )

def _read_weather(
    path: Path,
    canonical_provinces: set[str],
    expected_weeks: list[dt.date],
) -> tuple[dict[tuple[str, dt.date], float], dict[str, int]]:
    fields, rows = _read_csv(path)
    required = {"model", "province", "week_start", "w_apparent_temperature_mean_api"}
    missing = required - set(fields)
    if missing:
        raise BuildInputError(f"Weather candidate CSV is missing columns: {sorted(missing)}.")

    expected_set = set(expected_weeks)
    weather_by_key: dict[tuple[str, dt.date], float] = {}
    coverage: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if (row.get("model") or "").strip() != WEATHER_MODEL:
            continue
        province = (row.get("province") or "").strip()
        try:
            week_start = dt.date.fromisoformat((row.get("week_start") or "").strip()[:10])
        except ValueError as exc:
            raise BuildInputError("Weather candidate has an invalid week_start.") from exc
        if week_start not in expected_set:
            continue
        if province not in canonical_provinces:
            raise BuildInputError(f"Weather candidate has an unknown province: {province}.")
        key = (province, week_start)
        if key in weather_by_key:
            raise BuildInputError(f"Duplicate Open-Meteo {WEATHER_MODEL} value for {province}/{week_start}.")
        value = parse_number(row.get("w_apparent_temperature_mean_api"), "Open-Meteo apparent temperature")
        if value is None:
            raise BuildInputError(f"Missing Open-Meteo temperature for {province}/{week_start}.")
        weather_by_key[key] = value
        coverage[week_start.isoformat()].add(province)

    counts = {week.isoformat(): len(coverage[week.isoformat()]) for week in expected_weeks}
    expected_keys = EXPECTED_PROVINCES * len(expected_weeks)
    if len(weather_by_key) != expected_keys:
        raise BuildInputError(
            f"Open-Meteo best_match needs {expected_keys} values for extension weeks "
            f"{[week.isoformat() for week in expected_weeks]}; found {len(weather_by_key)}."
        )
    if any(counts[week.isoformat()] != EXPECTED_PROVINCES for week in expected_weeks):
        raise BuildInputError(f"Open-Meteo best_match weather coverage incomplete: {counts}.")
    return weather_by_key, counts

def build_inputs(
    historical_csv: Path,
    incoming_csv: Path,
    weather_csv: Path,
    weather_report_json: Path,
    output_dir: Path,
) -> dict[str, Any]:
    try:
        weather_report = json.loads(weather_report_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BuildInputError(f"Unable to read Open-Meteo compatibility report: {exc}") from exc
    comparison = weather_report.get("api_comparison", {}).get(WEATHER_MODEL, {})
    validation_weeks = weather_report.get("validation_weeks", [])
    if (
        comparison.get("status") != "comparison_complete"
        or weather_report.get("best_historical_match_by_mae") != WEATHER_MODEL
        or comparison.get("matched_province_weeks") != 52 * EXPECTED_PROVINCES
        or len(validation_weeks) != 52
    ):
        raise BuildInputError("Open-Meteo best_match has not passed the full 52-week historical source comparison.")
    mae = float(comparison.get("mae_c"))
    rmse = float(comparison.get("rmse_c"))
    bias = abs(float(comparison.get("mean_bias_c")))
    correlation = float(comparison.get("pearson_correlation"))
    if not (mae <= 0.01 and rmse <= 0.01 and bias <= 0.01 and correlation >= 0.999):
        raise BuildInputError(
            f"Open-Meteo weather equivalence gate failed: MAE={mae}, RMSE={rmse}, "
            f"absolute bias={bias}, correlation={correlation}."
        )

    historical_fields, historical_rows = _read_csv(historical_csv)
    canonical_provinces, historical_weeks = _validate_historical(historical_rows, historical_fields)
    case_map, case_coverage, extension_weeks = _read_incoming(
        incoming_csv, canonical_provinces, historical_weeks[-1]
    )
    weather_map, weather_coverage = _read_weather(weather_csv, canonical_provinces, extension_weeks)

    appended_rows: list[dict[str, str]] = []
    week_field_exists = "week" in historical_fields
    for (province, week_start), cases in sorted(case_map.items(), key=lambda item: (item[0][1], item[0][0])):
        weather = weather_map[(province, week_start)]
        epidemiological_year, epidemiological_week = mmwr_year_week(week_start)
        appended_rows.append({
            "province": province,
            "week_start": week_start.isoformat(),
            "week": str(week_start.isocalendar().week if not week_field_exists else epidemiological_week),
            "cases": str(cases),
            "w_apparent_temperature_mean": format(weather, ".10g"),
        })

    train_rows = []
    for row in historical_rows:
        week_value = (row.get("week") or "").strip()
        if not week_value:
            week_value = str(dt.date.fromisoformat(row["week_start"][:10]).isocalendar().week)
        train_rows.append({
            "province": row["province"].strip(),
            "week_start": row["week_start"][:10],
            "week": week_value,
            "cases": (row.get("cases") or "").strip(),
            "w_apparent_temperature_mean": (row.get("w_apparent_temperature_mean") or "").strip(),
        })
    train_rows.extend(appended_rows)

    latest_observed_week = extension_weeks[-1]
    target_week_start = latest_observed_week + dt.timedelta(days=7)
    target_year, target_week = mmwr_year_week(target_week_start)
    target_rows = [
        {
            "province": province,
            "week_start": target_week_start.isoformat(),
            "week": str(target_week),
            "cases": "",
            "w_apparent_temperature_mean": "",
        }
        for province in sorted(canonical_provinces)
    ]
    full_rows = train_rows + target_rows
    train_rows.sort(key=lambda row: (row["province"], row["week_start"]))
    full_rows.sort(key=lambda row: (row["province"], row["week_start"]))

    output_dir.mkdir(parents=True, exist_ok=True)
    train_path = output_dir / "train.csv"
    full_path = output_dir / "full.csv"
    for path, rows in ((train_path, train_rows), (full_path, full_rows)):
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    summary = {
        "status": "passed",
        "historical_source": {
            "start_week": historical_weeks[0].isoformat(),
            "end_week": historical_weeks[-1].isoformat(),
            "week_count": len(historical_weeks),
            "row_count": len(historical_rows),
            "province_count": len(canonical_provinces),
            "sha256": sha256_file(historical_csv),
        },
        "incoming_tanrabad": {
            "weeks": [{"week_start": week.isoformat(), "year": mmwr_year_week(week)[0], "mmwr_week": mmwr_year_week(week)[1]}
                      for week in extension_weeks],
            "rows": len(case_map),
            "province_count": len(canonical_provinces),
            "province_coverage_by_week": case_coverage,
            "source_sha256": sha256_file(incoming_csv),
        },
        "open_meteo_weather": {
            "model": WEATHER_MODEL,
            "province_coverage_by_week": weather_coverage,
            "values_added": len(weather_map),
            "week_count": len(extension_weeks),
            "historical_comparison_window_weeks": len(validation_weeks),
            "historical_comparison_matched_province_weeks": comparison["matched_province_weeks"],
            "historical_comparison_mae_c": mae,
            "historical_comparison_rmse_c": rmse,
            "historical_comparison_mean_bias_c": comparison["mean_bias_c"],
            "historical_comparison_pearson_r": correlation,
            "compatibility_report_sha256": sha256_file(weather_report_json),
            "candidate_sha256": sha256_file(weather_csv),
        },
        "training_panel": {
            "start_week": historical_weeks[0].isoformat(),
            "end_week": latest_observed_week.isoformat(),
            "week_count": len(historical_weeks) + len(extension_weeks),
            "appended_week_starts": [week.isoformat() for week in extension_weeks],
            "appended_week_count": len(extension_weeks),
            "row_count": len(train_rows),
            "province_count": len(canonical_provinces),
            "all_cases_and_weather_present_on_appended_weeks": True,
        },
        "forecast_target": {
            "week_start": target_week_start.isoformat(),
            "epidemiological_year": target_year,
            "epidemiological_week": target_week,
            "row_count": len(target_rows),
            "province_count": len(canonical_provinces),
            "target_cases_blank": True,
            "target_week_weather_blank": True,
            "feature_weather_source_week": latest_observed_week.isoformat(),
            "leakage_control": "target-week cases and target-week weather are blank; the model's L1 weather feature comes from the final observed week",
        },
        "outputs": {
            "train_csv_sha256": sha256_file(train_path),
            "full_csv_sha256": sha256_file(full_path),
            "raw_case_rows_exported": False,
            "train_and_full_panels_uploaded": False,
        },
    }
    (output_dir / "current-input-build-report.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Phase 13 current-model input panel.")
    parser.add_argument("--historical-full-csv", required=True, type=Path)
    parser.add_argument("--incoming-panel-csv", required=True, type=Path)
    parser.add_argument("--weather-candidates-csv", required=True, type=Path)
    parser.add_argument("--weather-compatibility-json", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_inputs(
        args.historical_full_csv,
        args.incoming_panel_csv,
        args.weather_candidates_csv,
        args.weather_compatibility_json,
        args.output_dir,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Current Phase 13 model panels built in ephemeral storage only; no raw input panel was uploaded.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (BuildInputError, OSError) as exc:
        raise SystemExit(f"ERROR: {exc}")
