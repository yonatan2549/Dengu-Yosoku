from __future__ import annotations

import contextlib
import csv
import hashlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from scripts.prepare_current_model_snapshot import (
    EXPECTED_FEATURES,
    SnapshotPreparationError,
    prepare_current_snapshot,
)


SOURCE_SHA = "f" * 40
MODEL_REVISION = "a" * 40
PROVINCES = [f"จังหวัด{index:02d}" for index in range(1, 78)]


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


class CurrentModelSnapshotPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.artifact_dir = self.root / "artifacts"
        self.output_dir = self.root / "prepared"
        self.artifact_dir.mkdir(parents=True)
        self.holdout_path = self.artifact_dir / "holdout_predictions.csv"
        self.forecast_path = self.artifact_dir / "predictions.csv"
        self.metrics_path = self.artifact_dir / "metrics.json"

        history = []
        for week_start in ("2026-11-01", "2026-11-08"):
            for index, province in enumerate(PROVINCES):
                prediction = float(index + 1)
                actual = float(index + 2)
                history.append({
                    "province": province,
                    "week_start": week_start,
                    "year": 2026,
                    "cases": actual,
                    "pred": prediction,
                    "persist": actual + 1,
                    "seasonal_naive": actual + 2,
                    "climatology": actual + 3,
                    "residual": actual - prediction,
                })
        write_csv(
            self.holdout_path,
            ["province", "week_start", "year", "cases", "pred", "persist",
             "seasonal_naive", "climatology", "residual"],
            history,
        )
        forecast = [
            {"province": province, "week_start": "2026-11-15", "pred": index + 0.5}
            for index, province in enumerate(PROVINCES)
        ]
        write_csv(self.forecast_path, ["province", "week_start", "pred"], forecast)

        metrics = {
            "schema_version": 1,
            "model_name": "DenguYosoku 77-province LightGBM weekly nowcast",
            "model_revision": SOURCE_SHA,
            "source_repository": "https://github.com/johnlovepizza/DenguYosoku",
            "source_commit_sha": SOURCE_SHA,
            "dataset_source": "TanRabad plus historical source",
            "dataset_source_url": "https://trb.ddc.moph.go.th/",
            "generated_at_utc": "2026-11-21T01:51:50Z",
            "forecast_week": "2026-11-15",
            "input_data_through_week": "2026-11-08",
            "forecast_status": "current_candidate",
            "province_count": 77,
            "features": sorted(EXPECTED_FEATURES),
            "eval_cutoff": "2026-11-08",
            "n_test": 154,
            "mae": 3.94,
            "rmse": 6.34,
            "wape": 0.27,
            "baseline_metrics": {"persistence": {"mae": 4.3, "rmse": 6.8}},
            "operational_release": {
                "release_type": "nowcast",
                "forecast_week": "2026-11-15",
                "input_data_through_week": "2026-11-08",
                "input_data_ref": "tanrabad-source-export-week-45-2026",
                "input_data_sha256": "b" * 64,
                "generated_at_utc": "2026-11-21T01:51:50Z",
            },
        }
        write_json(self.metrics_path, metrics)

        outputs = {}
        for path in (self.holdout_path, self.forecast_path, self.metrics_path):
            outputs[path.name] = {
                "size_bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        write_json(self.artifact_dir / "training_manifest.json", {
            "manifest_type": "training_run_manifest_not_publication_manifest",
            "source_repository": "https://github.com/johnlovepizza/DenguYosoku",
            "source_ref": "main",
            "source_commit_sha": SOURCE_SHA,
            "generated_at_utc": "2026-11-21T01:51:50Z",
            "outputs": outputs,
        })
        write_json(self.artifact_dir / "data_audit.json", {
            "status": "passed",
            "training_end_week": "2026-11-08",
            "forecast_target_week": "2026-11-15",
            "target_week_rows": 77,
            "target_week_actuals_present_in_raw_full": False,
            "target_week_actuals_used_as_features": False,
            "full_source": {
                "blank_target_rows": 77,
                "blank_weather_rows": 77,
            },
        })
        self.now = datetime(2026, 11, 21, 1, 58, tzinfo=timezone.utc)

    def tearDown(self):
        self.temporary.cleanup()

    def run_prepare(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            report = prepare_current_snapshot(
                self.artifact_dir,
                self.output_dir,
                model_revision=MODEL_REVISION,
                training_run_id="44852227543",
                now=self.now,
            )
        return report, output.getvalue()

    def test_prepares_matching_review_only_dashboard_artifacts(self):
        report, output = self.run_prepare()
        public_dir = self.output_dir / "public" / "data"
        predictions = json.loads((public_dir / "model_predictions.json").read_text(encoding="utf-8"))
        metrics = json.loads((public_dir / "model_metrics.json").read_text(encoding="utf-8"))

        self.assertEqual(report["status"], "prepared_review_only")
        self.assertEqual(report["forecast_week"], "2026-11-15")
        self.assertEqual(report["province_count"], 77)
        self.assertEqual(predictions["schema_version"], 3)
        self.assertEqual(predictions["release_status"], "review_only")
        self.assertEqual(metrics["release_status"], "review_only")
        self.assertEqual(predictions["model_revision"], MODEL_REVISION)
        self.assertEqual(predictions["source_data_revision"], SOURCE_SHA)
        self.assertEqual(predictions["training_run_id"], "44852227543")
        self.assertEqual(len(predictions["forecast"]), 77)
        self.assertEqual(predictions["coverage"]["history_rows"], 154)
        self.assertEqual(predictions["coverage"]["forecast_week"], "2026-11-15")
        self.assertEqual(metrics["model_revision"], predictions["model_revision"])
        self.assertIn("CHECK ONLY", output)
        self.assertIn("Model data conversion completed.", output)

    def test_blocks_when_a_derived_model_artifact_hash_does_not_match_manifest(self):
        self.holdout_path.write_text("tampered", encoding="utf-8")
        with self.assertRaisesRegex(SnapshotPreparationError, "SHA-256 mismatch"):
            self.run_prepare()

    def test_blocks_when_weather_feature_is_missing_from_model_contract(self):
        metrics = json.loads(self.metrics_path.read_text(encoding="utf-8"))
        metrics["features"] = [feature for feature in metrics["features"]
                               if feature != "w_apparent_temperature_mean_L1"]
        write_json(self.metrics_path, metrics)
        outputs = json.loads((self.artifact_dir / "training_manifest.json").read_text(encoding="utf-8"))
        outputs["outputs"]["metrics.json"] = {
            "size_bytes": self.metrics_path.stat().st_size,
            "sha256": hashlib.sha256(self.metrics_path.read_bytes()).hexdigest(),
        }
        write_json(self.artifact_dir / "training_manifest.json", outputs)
        with self.assertRaisesRegex(SnapshotPreparationError, "12-feature Phase 13 contract"):
            self.run_prepare()

    def test_blocks_target_actuals_used_as_features(self):
        audit = json.loads((self.artifact_dir / "data_audit.json").read_text(encoding="utf-8"))
        audit["target_week_actuals_used_as_features"] = True
        write_json(self.artifact_dir / "data_audit.json", audit)
        with self.assertRaisesRegex(SnapshotPreparationError, "no-leakage audit"):
            self.run_prepare()

    def test_blocks_stale_week_even_if_all_input_artifacts_are_valid(self):
        metrics = json.loads(self.metrics_path.read_text(encoding="utf-8"))
        metrics["forecast_week"] = "2026-11-08"
        metrics["input_data_through_week"] = "2026-11-01"
        metrics["eval_cutoff"] = "2026-11-01"
        metrics["operational_release"]["forecast_week"] = "2026-11-08"
        metrics["operational_release"]["input_data_through_week"] = "2026-11-01"
        write_json(self.metrics_path, metrics)
        outputs = json.loads((self.artifact_dir / "training_manifest.json").read_text(encoding="utf-8"))
        outputs["outputs"]["metrics.json"] = {
            "size_bytes": self.metrics_path.stat().st_size,
            "sha256": hashlib.sha256(self.metrics_path.read_bytes()).hexdigest(),
        }
        write_json(self.artifact_dir / "training_manifest.json", outputs)
        audit = json.loads((self.artifact_dir / "data_audit.json").read_text(encoding="utf-8"))
        audit["forecast_target_week"] = "2026-11-08"
        audit["training_end_week"] = "2026-11-01"
        write_json(self.artifact_dir / "data_audit.json", audit)
        with self.assertRaisesRegex(SnapshotPreparationError, "preflight"):
            self.run_prepare()


if __name__ == "__main__":
    unittest.main()
