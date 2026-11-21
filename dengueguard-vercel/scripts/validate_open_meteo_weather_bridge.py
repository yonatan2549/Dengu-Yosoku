#!/usr/bin/env python3
"""Validate Open-Meteo apparent-temperature history against model-source values.

The script only writes derived weekly weather and aggregate compatibility metrics.
No dengue case records are written to its output files.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import statistics
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path


API_URL = "https://archive-api.open-meteo.com/v1/archive"
MODELS = ("era5_land", "ecmwf_ifs", "best_match")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--historical-csv", required=True, type=Path)
    parser.add_argument("--incoming-panel-csv", required=True, type=Path)
    parser.add_argument("--source-commit", default="unknown")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--validation-weeks", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=10)
    return parser.parse_args()


def as_float(value, field):
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid numeric value for {field}.")
    if not math.isfinite(number):
        raise ValueError(f"Non-finite numeric value for {field}.")
    return number


def fetch_json(url, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "DengueYosoku-Weather-Bridge/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.load(response)
            if isinstance(payload, dict) and payload.get("error"):
                raise RuntimeError(payload.get("reason", "Open-Meteo API returned an error."))
            return payload
        except Exception as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Open-Meteo request failed after {retries} attempts: {last_error}")


def pearson(x, y):
    if len(x) < 2:
        return None
    mx, my = statistics.mean(x), statistics.mean(y)
    dx = [v - mx for v in x]
    dy = [v - my for v in y]
    denom = math.sqrt(sum(v * v for v in dx) * sum(v * v for v in dy))
    return sum(a * b for a, b in zip(dx, dy)) / denom if denom else None


def weekly_mean(daily):
    times = daily.get("time") or []
    values = daily.get("apparent_temperature_mean") or []
    by_week = defaultdict(list)
    for date_text, value in zip(times, values):
        if value is None:
            continue
        date = dt.date.fromisoformat(date_text)
        # CDC MMWR weeks and the model panel are Sunday-start.
        week_start = date - dt.timedelta(days=(date.weekday() + 1) % 7)
        by_week[week_start].append(float(value))
    result = {}
    for week_start, day_values in by_week.items():
        if len(day_values) == 7:
            result[week_start] = statistics.mean(day_values)
    return result


def main():
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    with args.historical_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {
            "province", "week_start", "w_apparent_temperature_mean",
            "prov_lat", "prov_lon",
        }
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"Historical source missing bridge fields: {sorted(missing)}")

        coords = {}
        history_weather = {}
        week_coverage = defaultdict(set)
        for row in reader:
            province = (row.get("province") or "").strip()
            if not province:
                continue
            lat = as_float(row.get("prov_lat"), "prov_lat")
            lon = as_float(row.get("prov_lon"), "prov_lon")
            old = coords.get(province)
            if old and (abs(old[0] - lat) > 1e-5 or abs(old[1] - lon) > 1e-5):
                raise SystemExit(f"Province coordinate is not stable in source: {province}")
            coords[province] = (lat, lon)

            raw_date = (row.get("week_start") or "").strip()[:10]
            date = dt.date.fromisoformat(raw_date)
            raw_weather = (row.get("w_apparent_temperature_mean") or "").strip()
            if raw_weather:
                value = as_float(raw_weather, "w_apparent_temperature_mean")
                history_weather[(province, date)] = value
                week_coverage[date].add(province)

    if len(coords) != 77:
        raise SystemExit(f"Expected 77 province coordinates, found {len(coords)}.")

    valid_weeks = sorted(
        date for date, provinces in week_coverage.items()
        if len(provinces) == 77
    )
    validation_weeks = valid_weeks[-args.validation_weeks:]
    if len(validation_weeks) != args.validation_weeks:
        raise SystemExit("Not enough complete historical weather weeks for source comparison.")

    with args.incoming_panel_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        incoming = list(csv.DictReader(handle))
    def mmwr_sunday_start(year, week):
        jan1 = dt.date(year, 1, 1)
        first_sunday = jan1 + dt.timedelta(days=(6 - jan1.weekday()) % 7)
        return first_sunday + dt.timedelta(weeks=week - 1)

    target_weeks = sorted({
        mmwr_sunday_start(int(row["year"]), int(row["week"]))
        for row in incoming
    })
    # Ensure the weekly date assignment matches the audited MMWR calendar.
    expected_target_weeks = [dt.date(2026, 11, 1), dt.date(2026, 11, 8)]
    if target_weeks != expected_target_weeks:
        raise SystemExit(f"Unexpected incoming week starts: {target_weeks}")

    fetch_weeks = sorted(set(validation_weeks + target_weeks))
    start_date = min(fetch_weeks)
    end_date = max(fetch_weeks) + dt.timedelta(days=6)
    provinces = sorted(coords.items())
    output_rows = []
    comparisons = {}

    for model_name in MODELS:
        model_weather = {}
        for offset in range(0, len(provinces), args.batch_size):
            batch = provinces[offset:offset + args.batch_size]
            latitudes = ",".join(f"{coords_[0]:.5f}" for _, coords_ in batch)
            longitudes = ",".join(f"{coords_[1]:.5f}" for _, coords_ in batch)
            params = {
                "latitude": latitudes,
                "longitude": longitudes,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "daily": "apparent_temperature_mean",
                "timezone": "Asia/Bangkok",
                "temperature_unit": "celsius",
                "cell_selection": "land",
            }
            if model_name != "best_match":
                params["models"] = model_name
            url = API_URL + "?" + urllib.parse.urlencode(params)
            payload = fetch_json(url)
            if isinstance(payload, dict):
                responses = [payload]
            elif isinstance(payload, list):
                responses = payload
            else:
                raise RuntimeError("Unexpected Open-Meteo multi-location response type.")
            if len(responses) != len(batch):
                raise RuntimeError(
                    f"Open-Meteo returned {len(responses)} locations for {len(batch)} requests."
                )
            for (province, _), response in zip(batch, responses):
                if not isinstance(response, dict) or not isinstance(response.get("daily"), dict):
                    raise RuntimeError(f"Open-Meteo response missing daily values for a location.")
                for week_start, value in weekly_mean(response["daily"]).items():
                    model_weather[(province, week_start)] = value

        actuals, predicted = [], []
        per_week = []
        for week_start in validation_weeks:
            errors = []
            for province, _ in provinces:
                key = (province, week_start)
                source_value = history_weather.get(key)
                api_value = model_weather.get(key)
                if source_value is None or api_value is None:
                    continue
                actuals.append(source_value)
                predicted.append(api_value)
                errors.append(api_value - source_value)
            per_week.append({
                "week_start": week_start.isoformat(),
                "matched_province_count": len(errors),
                "mae_c": statistics.mean(abs(x) for x in errors) if errors else None,
                "mean_bias_c": statistics.mean(errors) if errors else None,
            })

        if not actuals:
            raise RuntimeError(f"No overlapping weather values were returned for model {model_name}.")

        differences = [p - a for p, a in zip(predicted, actuals)]
        metrics = {
            "model": model_name,
            "matched_province_weeks": len(actuals),
            "mae_c": statistics.mean(abs(x) for x in differences),
            "rmse_c": math.sqrt(statistics.mean(x * x for x in differences)),
            "mean_bias_c": statistics.mean(differences),
            "pearson_correlation": pearson(actuals, predicted),
            "per_week": per_week,
        }
        comparisons[model_name] = metrics

        for province, _ in provinces:
            for week_start in fetch_weeks:
                value = model_weather.get((province, week_start))
                output_rows.append({
                    "model": model_name,
                    "province": province,
                    "week_start": week_start.isoformat(),
                    "w_apparent_temperature_mean_api": (
                        round(value, 4) if value is not None else ""
                    ),
                    "source_weather_value_available": (
                        "true" if (province, week_start) in history_weather else "false"
                    ),
                })

    best_model = min(comparisons, key=lambda name: comparisons[name]["mae_c"])
    recent_coverage = {}
    for model_name in MODELS:
        rows = [r for r in output_rows if r["model"] == model_name]
        for week_start in target_weeks:
            recent_coverage[f"{model_name}:{week_start.isoformat()}"] = sum(
                1 for row in rows
                if row["week_start"] == week_start.isoformat()
                and row["w_apparent_temperature_mean_api"] != ""
            )

    report = {
        "provider": "Open-Meteo Historical Weather API",
        "endpoint": API_URL,
        "attribution": "Open-Meteo; ERA5-Land/ECMWF reanalysis; CC BY 4.0",
        "source_commit": args.source_commit,
        "weather_variable": "daily apparent_temperature_mean, aggregated as arithmetic mean across 7 daily means per Sunday-start week",
        "timezone": "Asia/Bangkok",
        "temperature_unit": "celsius",
        "coordinate_basis": "prov_lat/prov_lon from the historical training source (77 province points)",
        "validation_weeks": [d.isoformat() for d in validation_weeks],
        "target_weeks": [d.isoformat() for d in target_weeks],
        "api_comparison": comparisons,
        "best_historical_match_by_mae": best_model,
        "recent_week_coverage": recent_coverage,
        "compatible_with_original_feature_contract": False,
        "compatibility_decision": "comparison_only_requires_model_owner_review",
        "notes": [
            "An API variable with the same name does not prove source-equivalence to the training weather series.",
            "Historical cross-check metrics must be reviewed before using any candidate weather source in the original model.",
            "No model weights, historical weather source values, dengue case records, or public website data are changed by this script.",
            "Only newly fetched weekly weather values and aggregate comparison metrics are emitted.",
        ],
    }

    csv_path = args.output_dir / "openmeteo_weekly_weather_candidates.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "model", "province", "week_start",
                "w_apparent_temperature_mean_api",
                "source_weather_value_available",
            ],
        )
        writer.writeheader()
        writer.writerows(output_rows)

    (args.output_dir / "openmeteo_weather_compatibility.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(
        "Open-Meteo weather bridge: "
        + "; ".join(
            f"{name} MAE={stats['mae_c']:.3f}°C, r={stats['pearson_correlation']:.3f}"
            for name, stats in comparisons.items()
        )
    )
    print(f"Historical closest match by MAE: {best_model}.")
    for week_start in target_weeks:
        print(
            f"Target weather coverage {week_start}: "
            + ", ".join(
                f"{model}={recent_coverage[f'{model}:{week_start.isoformat()}']}/77"
                for model in MODELS
            )
        )
    print("Weather API comparison completed; no forecast model was automatically changed.")


if __name__ == "__main__":
    main()
