#!/usr/bin/env python3
"""Convert source CSV/GeoJSON files into browser-readable JSON for DengueYosoku.

Expected source files are stored under source-data/data and source-data/questionnaire.
Run from the project root: python scripts/convert_data.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_SOURCE = ROOT / "source-data" / "data"
QUESTION_SOURCE = ROOT / "source-data" / "questionnaire"
PUBLIC_DATA = ROOT / "public" / "data"

NUMERIC_COLUMNS = {
    "year", "target", "cases_now", "cases_roll4", "pred", "thr_watch", "thr_alert",
    "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "precipitation_hours", "humidity_mean", "humidity_min",
    "priority", "display_order", "section_order", "question_order",
}
INTEGER_COLUMNS = {"year", "priority", "display_order", "section_order", "question_order"}


def cast_value(key: str, raw: str) -> Any:
    value = raw.strip() if isinstance(raw, str) else raw
    if key == "province" and isinstance(value, str):
        return value.strip()
    if value == "" or value is None:
        return None
    if key in INTEGER_COLUMNS:
        try:
            return int(float(value))
        except ValueError:
            return value
    if key in NUMERIC_COLUMNS:
        try:
            return float(value)
        except ValueError:
            return value
    return value


def csv_to_json(source: Path, target: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(f"Missing source CSV: {source}")
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        records = [
            {key: cast_value(key, value) for key, value in row.items()}
            for row in reader
        ]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Converted {source.name}: {len(records):,} rows -> {target.relative_to(ROOT)}")


def copy_json(source: Path, target: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(f"Missing source JSON: {source}")
    payload = json.loads(source.read_text(encoding="utf-8-sig"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Copied {source.name} -> {target.relative_to(ROOT)}")


def main() -> None:
    csv_map = {
        DATA_SOURCE / "predictions_h2.csv": PUBLIC_DATA / "predictions.json",
        DATA_SOURCE / "weather_daily.csv": PUBLIC_DATA / "weather_daily.json",
        DATA_SOURCE / "prevention_actions.csv": PUBLIC_DATA / "prevention_actions.json",
        QUESTION_SOURCE / "questions.csv": PUBLIC_DATA / "questions.json",
        QUESTION_SOURCE / "options.csv": PUBLIC_DATA / "options.json",
        QUESTION_SOURCE / "assessment_rules.csv": PUBLIC_DATA / "assessment_rules.json",
        QUESTION_SOURCE / "recommendations.csv": PUBLIC_DATA / "recommendations.json",
    }
    for source, target in csv_map.items():
        csv_to_json(source, target)

    copy_json(DATA_SOURCE / "meta.json", PUBLIC_DATA / "meta.json")
    copy_json(DATA_SOURCE / "thailand_provinces.geojson", PUBLIC_DATA / "thailand_provinces.geojson")
    copy_json(DATA_SOURCE / "provinces_odpc4.geojson", PUBLIC_DATA / "provinces_odpc4.geojson")
    print("\nData conversion completed.")


if __name__ == "__main__":
    main()
