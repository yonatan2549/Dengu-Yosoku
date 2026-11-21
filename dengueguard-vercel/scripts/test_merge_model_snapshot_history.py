import csv
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.merge_model_snapshot_history import (
    HistoryBridgeError,
    merge_history_bridge,
    mmwr_year_week,
)

PROVINCES = [f"Province {index:02d}" for index in range(1, 78)]


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


class ModelSnapshotHistoryBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.historical = self.root / "historical.csv"
        self.snapshot_path = self.root / "model_predictions.json"
        self.incoming = self.root / "incoming.csv"
        self.output_panel = self.root / "extension.csv"
        self.output_report = self.root / "bridge-report.json"

        historic_rows = []
        for province_index, province in enumerate(PROVINCES):
            historic_rows.append({
                "province": province,
                "week_start": "2026-10-25",
                "cases": 20 + province_index,
            })
        write_csv(self.historical, ["province", "week_start", "cases"], historic_rows)

        history = []
        for week_start in ("2026-11-01", "2026-11-08"):
            for province_index, province in enumerate(PROVINCES):
                history.append({
                    "province": province,
                    "week_start": week_start,
                    "year": 2026,
                    "actual_cases": 100 + province_index + (0 if week_start == "2026-11-01" else 10),
                    "prediction": 999999,  # must never be used as an observed case
                    "residual": -999999,
                })
        self.snapshot = {
            "schema_version": 3,
            "source_repository": "https://github.com/johnlovepizza/DenguYosoku",
            "model_revision": "a" * 40,
            "source_data_revision": "b" * 40,
            "release_status": "review_only",
            "province_count": 77,
            "provinces": PROVINCES,
            "history": history,
            "forecast": [{
                "province": PROVINCES[0],
                "week_start": "2026-11-15",
                "prediction": 123456,
            }],
            "coverage": {
                "history_rows": len(history),
                "history_end_week": "2026-11-08",
                "forecast_week": "2026-11-15",
            },
        }
        self.snapshot_path.write_text(json.dumps(self.snapshot), encoding="utf-8")

        incoming_rows = []
        for week_number, case_offset in ((45, 10), (46, 20)):
            for province_index, province in enumerate(PROVINCES):
                incoming_rows.append({
                    "province": province,
                    "year": 2026,
                    "week": week_number,
                    "cases": 100 + province_index + case_offset,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], incoming_rows)

    def tearDown(self):
        self.temp.cleanup()

    def test_bridges_missing_week_and_uses_only_snapshot_actual_cases(self):
        report = merge_history_bridge(
            self.historical, self.snapshot_path, self.incoming,
            self.output_panel, self.output_report,
        )
        with self.output_panel.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["snapshot_bridge"]["bridged_weeks"], ["2026-11-01"])
        self.assertEqual(report["snapshot_bridge"]["bridged_rows"], 77)
        self.assertEqual(report["merged_extension"]["weeks"], [
            "2026-11-01", "2026-11-08", "2026-11-15"
        ])
        self.assertEqual(len(rows), 77 * 3)
        bridge = next(row for row in rows if row["province"] == PROVINCES[0] and row["week"] == "44")
        self.assertEqual(int(bridge["cases"]), 100)
        self.assertEqual(report["prediction_values_used"], False)
        self.assertEqual(report["forecast_week_actuals_used"], False)
        self.assertEqual(mmwr_year_week(date(2026, 11, 22)), (2026, 47))

    def test_blocks_when_snapshot_and_incoming_actuals_disagree(self):
        self.snapshot["history"][77]["actual_cases"] += 1
        self.snapshot_path.write_text(json.dumps(self.snapshot), encoding="utf-8")
        with self.assertRaises(HistoryBridgeError):
            merge_history_bridge(
                self.historical, self.snapshot_path, self.incoming,
                self.output_panel, self.output_report,
            )

    def test_blocks_missing_bridge_week(self):
        self.snapshot["history"] = [
            row for row in self.snapshot["history"] if row["week_start"] != "2026-11-01"
        ]
        self.snapshot["coverage"]["history_rows"] = len(self.snapshot["history"])
        self.snapshot_path.write_text(json.dumps(self.snapshot), encoding="utf-8")
        with self.assertRaises(HistoryBridgeError):
            merge_history_bridge(
                self.historical, self.snapshot_path, self.incoming,
                self.output_panel, self.output_report,
            )

    def test_rejects_non_review_only_snapshot_and_noncanonical_provinces(self):
        self.snapshot["release_status"] = "approved"
        self.snapshot_path.write_text(json.dumps(self.snapshot), encoding="utf-8")
        with self.assertRaises(HistoryBridgeError):
            merge_history_bridge(
                self.historical, self.snapshot_path, self.incoming,
                self.output_panel, self.output_report,
            )


    def test_mmwr_calendar_year_boundary_is_not_mislabelled_as_week_53(self):
        self.assertEqual(mmwr_sunday_start(2027, 1), date(2027, 1, 3))
        self.assertEqual(mmwr_year_week(date(2027, 1, 3)), (2027, 1))
        with self.assertRaises(HistoryBridgeError):
            mmwr_sunday_start(2026, 53)


if __name__ == "__main__":
    unittest.main()
