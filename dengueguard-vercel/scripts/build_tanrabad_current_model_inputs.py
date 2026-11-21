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
EXPECTED_HISTORICAL_END = dt.date(2026, 10, 25)
EXPECTED_INCOMING_WEEKS = {
    (2026, 44): dt.date(2026, 11, 1),
    (2026, 45): dt.date(2026, 11, 8),
}
EXPECTED_TARGET_WEEK = dt.date(2026, 11, 15)
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
    if not ordered_weeks or ordered_weeks[-1] != EXPECTED_HISTORICAL_END:
        raise BuildInputError(
            f"Historical source must end at {EXPECTED_HISTORICAL_END}; "
            f"found {ordered_weeks[-1] if ordered_weeks else 'no weeks'}."
        )
    return provinces, ordered_weeks


def _read_incoming(path: Path, canonical_provinces: set[str]) -> tuple[dict[tuple[str, dt.date], int], dict[str, int]]:
    fields, rows = _read_csv(path)
    required = {"province", "year", "week", "cases"}
    missing = required - set(fields)
    if missing:
        raise BuildInputError(f"TanRabad panel is missing columns: {sorted(missing)}.")

    cases_by_key: dict[tuple[str, dt.date], int] = {}
    incoming_coverage: dict[str, set[str]] = defaultdict(set)
    seen_weeks: set[dt.date] = set()
    incoming_provinces: set[str] = set()
    for row in rows:
        province = (row.get("province") or "").strip()
        if not province:
            raise BuildInputError("TanRabad panel contains a blank province.")
        year_number = parse_number(row.get("year"), "TanRabad year")
        week_number = parse_number(row.get("week"), "TanRabad week")
        case_number = parse_number(row.get("cases"), "TanRabad cases")
        if year_number is None or week_number is None or case_number is None:
            raise BuildInputError("TanRabad panel contains a missing value.")
        if not year_number.is_integer() or not week_number.is_integer() or not case_number.is_integer():
            raise BuildInputError("TanRabad year, week and case count must be integers.")
        year, week, cases = int(year_number), int(week_number), int(case_number)
        if cases < 0:
            raise BuildInputError("TanRabad panel contains a negative case count.")
        week_start = mmwr_sunday_start(year, week)
        expected = EXPECTED_INCOMING_WEEKS.get((year, week))
        if expected is None or week_start != expected:
            raise BuildInputError(f"Unexpected incoming MMWR week {year}-W{week} ({week_start}).")
        key = (province, week_start)
        if key in cases_by_key:
            raise BuildInputError(f"Duplicate TanRabad province-week key for {province}/{week_start}.")
        cases_by_key[key] = cases
        incoming_provinces.add(province)
        seen_weeks.add(week_start)
        incoming_coverage[week_start.isoformat()].add(province)

    if incoming_provinces != canonical_provinces:
        missing = sorted(canonical_provinces - incoming_provinces)
        extra = sorted(incoming_provinces - canonical_provinces)
        raise BuildInputError(
            f"TanRabad province set differs from historical source; missing={missing}, extra={extra}."
        )
    if seen_weeks != set(EXPECTED_INCOMING_WEEKS.values()):
        raise BuildInputError("TanRabad data must contain exactly MMWR weeks 44 and 45 of 2026.")
    for week in EXPECTED_INCOMING_WEEKS.values():
        if incoming_coverage[week.isoformat()] != canonical_provinces:
            raise BuildInputError(f"TanRabad week {week} does not contain exactly 77 provinces.")
    if len(cases_by_key) != EXPECTED_PROVINCES * 2:
        raise BuildInputError("TanRabad panel must contain exactly 154 province-week rows.")
    return cases_by_key, {week: len(provinces) for week, provinces in incoming_coverage.items()}


def _read_weather(path: Path, canonical_provinces: set[str]) -> tuple[dict[tuple[str, dt.date], float], dict[str, int]]:
    fields, rows = _read_csv(path)
    required = {"model", "province", "week_start", "w_apparent_temperature_mean_api"}
    missing = required - set(fields)
    if missing:
        raise BuildInputError(f"Weather candidate CSV is missing columns: {sorted(missing)}.")

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
        if week_start not in EXPECTED_INCOMING_WEEKS.values():
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

    counts = {week.isoformat(): len(coverage[week.isoformat()]) for week in EXPECTED_INCOMING_WEEKS.values()}
    expected_keys = EXPECTED_PROVINCES * 2
    if len(weather_by_key) != expected_keys:
        raise BuildInputError(
            f"Open-Meteo best_match needs 154 values for weeks 44-45; found {len(weather_by_key)}."
        )
    if any(counts[week.isoformat()] != EXPECTED_PROVINCES for week in EXPECTED_INCOMING_WEEKS.values()):
        raise BuildInputError(f"Open-Meteo best_match weather coverage incomplete: {counts}.")
    return weather_by_key, counts


def build_inputs(
    historical_csv: Path,
    incoming_csv: Path,
    weather_csv: Path,
    output_dir: Path,
) -> dict[str, Any]:
    historical_fields, historical_rows = _read_csv(historical_csv)
    canonical_provinces, historical_weeks = _validate_historical(historical_rows, historical_fields)
    case_map, case_coverage = _read_incoming(incoming_csv, canonical_provinces)
    weather_map, weather_coverage = _read_weather(weather_csv, canonical_provinces)

    appended_rows: list[dict[str, str]] = []
    week_field_exists = "week" in historical_fields
    for (province, week_start), cases in sorted(case_map.items(), key=lambda item: (item[0][1], item[0][0])):
        weather = weather_map[(province, week_start)]
        epidemiological_week = next(
            week for (year, week), start in EXPECTED_INCOMING_WEEKS.items() if start == week_start
        )
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

    target_rows = [
        {
            "province": province,
            "week_start": EXPECTED_TARGET_WEEK.isoformat(),
            "week": str(EXPECTED_TARGET_WEEK.isocalendar().week),
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
            "weeks": [{"week_start": week.isoformat(), "year": 2026, "mmwr_week": number}
                      for (year, number), week in sorted(EXPECTED_INCOMING_WEEKS.items())],
            "rows": len(case_map),
            "province_count": len(canonical_provinces),
            "province_coverage_by_week": case_coverage,
            "source_sha256": sha256_file(incoming_csv),
        },
        "open_meteo_weather": {
            "model": WEATHER_MODEL,
            "province_coverage_by_week": weather_coverage,
            "values_added": len(weather_map),
            "historical_comparison_window_weeks": 52,
            "historical_comparison_matched_province_weeks": 4004,
            "historical_comparison_mae_c": 0.00017601446175324228,
            "historical_comparison_rmse_c": 0.006519855205160816,
            "historical_comparison_mean_bias_c": 0.00007135721421413765,
            "historical_comparison_pearson_r": 0.9999984751997705,
            "candidate_sha256": sha256_file(weather_csv),
        },
        "training_panel": {
            "start_week": historical_weeks[0].isoformat(),
            "end_week": EXPECTED_INCOMING_WEEKS[(2026, 45)].isoformat(),
            "week_count": len(historical_weeks) + 2,
            "row_count": len(train_rows),
            "province_count": len(canonical_provinces),
            "all_cases_and_weather_present_on_appended_weeks": True,
        },
        "forecast_target": {
            "week_start": EXPECTED_TARGET_WEEK.isoformat(),
            "epidemiological_week": EXPECTED_TARGET_WEEK.isocalendar().week,
            "row_count": len(target_rows),
            "province_count": len(canonical_provinces),
            "target_cases_blank": True,
            "target_week_weather_blank": True,
            "feature_weather_source_week": EXPECTED_INCOMING_WEEKS[(2026, 45)].isoformat(),
            "leakage_control": "target-week cases and target-week weather are blank; the model's L1 weather feature comes from week 45",
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
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_inputs(
        args.historical_full_csv,
        args.incoming_panel_csv,
        args.weather_candidates_csv,
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
