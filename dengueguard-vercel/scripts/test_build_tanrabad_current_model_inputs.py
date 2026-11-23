#!/usr/bin/env python3
"""Contract tests for the TanRabad-to-Phase-13 current input adapter."""
from __future__ import annotations

import csv
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

try:
    from . import build_tanrabad_current_model_inputs as adapter
except ImportError:
    import build_tanrabad_current_model_inputs as adapter


PROVINCES = [f"Province {index:02d}" for index in range(1, 78)]
HISTORICAL_WEEKS = [date(2026, 10, 11), date(2026, 10, 18), date(2026, 10, 25)]


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


class BuildTanRabadCurrentInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.historical = self.root / "historical.csv"
        self.incoming = self.root / "incoming.csv"
        self.weather = self.root / "weather.csv"
        self.weather_report = self.root / "weather-compatibility.json"
        self.output = self.root / "output"

        historical_rows = []
        for province_index, province in enumerate(PROVINCES):
            for week_index, week_start in enumerate(HISTORICAL_WEEKS):
                historical_rows.append({
                    "province": province,
                    "week_start": week_start.isoformat(),
                    "week": 41 + week_index,
                    "cases": 10 + province_index + week_index,
                    "w_apparent_temperature_mean": 27.0 + week_index / 10,
                })
        write_csv(
            self.historical,
            ["province", "week_start", "week", "cases", "w_apparent_temperature_mean"],
            historical_rows,
        )

        incoming_rows = []
        weather_rows = []
        for week_number, week_start in ((44, date(2026, 11, 1)), (45, date(2026, 11, 8))):
            for province_index, province in enumerate(PROVINCES):
                incoming_rows.append({
                    "province": province,
                    "year": 2026,
                    "week": week_number,
                    "cases": 100 + province_index + week_number,
                })
                weather_rows.append({
                    "model": "best_match",
                    "province": province,
                    "week_start": week_start.isoformat(),
                    "w_apparent_temperature_mean_api": 28.5 + province_index / 100,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], incoming_rows)
        write_csv(
            self.weather,
            ["model", "province", "week_start", "w_apparent_temperature_mean_api"],
            weather_rows,
        )
        self.weather_report.write_text(json.dumps({
            "best_historical_match_by_mae": "best_match",
            "validation_weeks": [
                (date(2025, 11, 2) + timedelta(days=7 * index)).isoformat()
                for index in range(52)
            ],
            "api_comparison": {
                "best_match": {
                    "model": "best_match",
                    "status": "comparison_complete",
                    "matched_province_weeks": 4004,
                    "mae_c": 0.000176,
                    "rmse_c": 0.00652,
                    "mean_bias_c": 0.000071,
                    "pearson_correlation": 0.999998,
                }
            },
        }), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_builds_contiguous_training_and_blank_target_panels(self):
        report = adapter.build_inputs(
            self.historical, self.incoming, self.weather,
            self.weather_report, self.output,
        )
        train_path = self.output / "train.csv"
        full_path = self.output / "full.csv"
        with train_path.open("r", encoding="utf-8-sig", newline="") as handle:
            train = list(csv.DictReader(handle))
        with full_path.open("r", encoding="utf-8-sig", newline="") as handle:
            full = list(csv.DictReader(handle))

        self.assertEqual(report["status"], "passed")
        self.assertEqual(len(train), 77 * 5)
        self.assertEqual(len(full), 77 * 6)
        self.assertEqual(report["forecast_target"]["week_start"], "2026-11-15")
        self.assertEqual(report["open_meteo_weather"]["values_added"], 154)
        self.assertTrue(all(row["cases"] == "" and row["w_apparent_temperature_mean"] == ""
                            for row in full if row["week_start"] == "2026-11-15"))
        self.assertEqual(
            next(row for row in train if row["province"] == PROVINCES[0]
                 and row["week_start"] == "2026-11-08")["w_apparent_temperature_mean"],
            "28.5",
        )

    def test_blocks_weather_when_historical_equivalence_is_not_passed(self):
        report = json.loads(self.weather_report.read_text(encoding="utf-8"))
        report["api_comparison"]["best_match"]["mae_c"] = 0.02
        self.weather_report.write_text(json.dumps(report), encoding="utf-8")
        with self.assertRaises(adapter.BuildInputError):
            adapter.build_inputs(
                self.historical, self.incoming, self.weather,
                self.weather_report, self.output,
            )

    def test_blocks_missing_target_week_weather(self):
        with self.weather.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        rows.pop()
        write_csv(
            self.weather,
            ["model", "province", "week_start", "w_apparent_temperature_mean_api"],
            rows,
        )
        with self.assertRaises(adapter.BuildInputError):
            adapter.build_inputs(
                self.historical, self.incoming, self.weather,
                self.weather_report, self.output,
            )


    def test_accepts_three_dynamic_weeks_and_targets_the_following_sunday(self):
        incoming_rows = []
        weather_rows = []
        extension = (
            (44, date(2026, 11, 1)),
            (45, date(2026, 11, 8)),
            (46, date(2026, 11, 15)),
        )
        for week_number, week_start in extension:
            for province_index, province in enumerate(PROVINCES):
                incoming_rows.append({
                    "province": province, "year": 2026, "week": week_number,
                    "cases": 200 + province_index + week_number,
                })
                weather_rows.append({
                    "model": "best_match", "province": province,
                    "week_start": week_start.isoformat(),
                    "w_apparent_temperature_mean_api": 29.0 + province_index / 100,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], incoming_rows)
        write_csv(
            self.weather,
            ["model", "province", "week_start", "w_apparent_temperature_mean_api"],
            weather_rows,
        )

        report = adapter.build_inputs(
            self.historical, self.incoming, self.weather,
            self.weather_report, self.output,
        )
        self.assertEqual(report["incoming_tanrabad"]["rows"], 231)
        self.assertEqual(report["training_panel"]["appended_week_count"], 3)
        self.assertEqual(report["training_panel"]["end_week"], "2026-11-15")
        self.assertEqual(report["forecast_target"]["week_start"], "2026-11-22")
        self.assertEqual(report["forecast_target"]["epidemiological_week"], 47)
        self.assertEqual(report["open_meteo_weather"]["values_added"], 231)

    def test_blocks_a_gap_in_the_incoming_weekly_extension(self):
        incoming_rows = []
        weather_rows = []
        for week_number, week_start in ((44, date(2026, 11, 1)), (46, date(2026, 11, 15))):
            for province_index, province in enumerate(PROVINCES):
                incoming_rows.append({
                    "province": province, "year": 2026, "week": week_number,
                    "cases": 200 + province_index + week_number,
                })
                weather_rows.append({
                    "model": "best_match", "province": province,
                    "week_start": week_start.isoformat(),
                    "w_apparent_temperature_mean_api": 29.0 + province_index / 100,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], incoming_rows)
        write_csv(
            self.weather,
            ["model", "province", "week_start", "w_apparent_temperature_mean_api"],
            weather_rows,
        )
        with self.assertRaises(adapter.BuildInputError):
            adapter.build_inputs(
                self.historical, self.incoming, self.weather,
                self.weather_report, self.output,
            )

    def test_mmwr_year_boundary_uses_the_new_epi_year(self):
        self.assertEqual(adapter.mmwr_sunday_start(2027, 1), date(2027, 1, 3))
        self.assertEqual(adapter.mmwr_year_week(date(2027, 1, 3)), (2027, 1))
        with self.assertRaises(adapter.BuildInputError):
            adapter.mmwr_sunday_start(2026, 53)


if __name__ == "__main__":
    unittest.main()
