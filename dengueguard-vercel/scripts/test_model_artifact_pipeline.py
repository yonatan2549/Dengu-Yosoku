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
from unittest.mock import patch

import scripts.convert_model_outputs as converter
import scripts.fetch_model_outputs as fetcher
from scripts.model_artifact_transaction import publish_file_bundle


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        value = cls(2026, 11, 19, 10, 0, 0, tzinfo=timezone.utc)
        return value if tz is None else value.astimezone(tz)


class ModelArtifactTransactionTests(unittest.TestCase):
    def test_publishes_a_bundle_of_new_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "predictions.json"
            second = root / "metrics.json"
            publish_file_bundle({first: b"predictions", second: b"metrics"})
            self.assertEqual(first.read_bytes(), b"predictions")
            self.assertEqual(second.read_bytes(), b"metrics")

    def test_rolls_back_earlier_replacements_when_a_later_replace_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "predictions.json"
            second = root / "metrics.json"
            first.write_bytes(b"old-predictions")
            second.write_bytes(b"old-metrics")

            import scripts.model_artifact_transaction as transaction
            real_replace = transaction.os.replace
            failed = False

            def fail_once(source, destination):
                nonlocal failed
                if Path(destination) == second and not failed:
                    failed = True
                    raise OSError("simulated second-file replacement failure")
                return real_replace(source, destination)

            with patch.object(transaction.os, "replace", side_effect=fail_once):
                with self.assertRaises(OSError):
                    publish_file_bundle({first: b"new-predictions", second: b"new-metrics"})

            self.assertEqual(first.read_bytes(), b"old-predictions")
            self.assertEqual(second.read_bytes(), b"old-metrics")
            self.assertFalse(list(root.glob("*.staged")))
            self.assertFalse(list(root.glob("*.backup")))

    def test_removes_a_new_destination_when_bundle_commit_is_rolled_back(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = root / "new-predictions.json"
            second = root / "existing-metrics.json"
            second.write_bytes(b"old-metrics")

            import scripts.model_artifact_transaction as transaction
            real_replace = transaction.os.replace
            failed = False

            def fail_once(source, destination):
                nonlocal failed
                if Path(destination) == second and not failed:
                    failed = True
                    raise OSError("simulated replacement failure")
                return real_replace(source, destination)

            with patch.object(transaction.os, "replace", side_effect=fail_once):
                with self.assertRaises(OSError):
                    publish_file_bundle({first: b"new-predictions", second: b"new-metrics"})

            self.assertFalse(first.exists())
            self.assertEqual(second.read_bytes(), b"old-metrics")


class ModelConversionPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.source_dir = root / "source-data" / "model"
        self.output_dir = root / "public" / "data"
        self.source_dir.mkdir(parents=True)
        self.output_dir.mkdir(parents=True)
        self.history_file = self.source_dir / "holdout_predictions.csv"
        self.forecast_file = self.source_dir / "predictions.csv"
        self.metrics_file = self.source_dir / "metrics.json"
        self.manifest_file = self.source_dir / "source_manifest.json"

        self.originals = {
            "SOURCE_DIR": converter.SOURCE_DIR,
            "HISTORY_FILE": converter.HISTORY_FILE,
            "FORECAST_FILE": converter.FORECAST_FILE,
            "METRICS_FILE": converter.METRICS_FILE,
            "PUBLIC_DATA_DIR": converter.PUBLIC_DATA_DIR,
            "ROOT": converter.ROOT,
            "datetime": converter.datetime,
        }
        converter.SOURCE_DIR = self.source_dir
        converter.HISTORY_FILE = self.history_file
        converter.FORECAST_FILE = self.forecast_file
        converter.METRICS_FILE = self.metrics_file
        converter.PUBLIC_DATA_DIR = self.output_dir
        converter.ROOT = root
        converter.datetime = FrozenDateTime
        self.write_sources(forecast_week="2026-11-22")

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(converter, name, value)
        self.temporary.cleanup()

    def write_sources(self, *, forecast_week: str):
        provinces = [f"Province-{index:02d}" for index in range(1, 78)]
        with self.history_file.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=[
                "province", "week_start", "year", "cases", "pred", "persist",
                "seasonal_naive", "climatology", "residual",
            ])
            writer.writeheader()
            for province in provinces:
                writer.writerow({
                    "province": province, "week_start": "2026-11-01", "year": 2026,
                    "cases": 10, "pred": 8, "persist": 7, "seasonal_naive": 6,
                    "climatology": 5, "residual": 2,
                })

        with self.forecast_file.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["province", "week_start", "pred"])
            writer.writeheader()
            for province in provinces:
                writer.writerow({"province": province, "week_start": forecast_week, "pred": 9})

        self.metrics_file.write_text(json.dumps({
            "mae": 1.2, "rmse": 2.3, "eval_cutoff": "2026-11-01",
            "features": ["lag_1"], "n_test": 77,
        }), encoding="utf-8")

        source_paths = {
            "holdout_predictions.csv": "DenguYosoku/holdout_predictions.csv",
            "predictions.csv": "predict_week/predictions.csv",
            "metrics.json": "DenguYosoku/metrics.json",
        }
        files = [self.history_file, self.forecast_file, self.metrics_file]
        artifacts = {}
        for file in files:
            payload = file.read_bytes()
            artifacts[file.name] = {
                "source_path": source_paths[file.name],
                "size_bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        self.manifest_file.write_text(json.dumps({
            "repository": "https://github.com/johnlovepizza/DenguYosoku",
            "ref": "main",
            "commit_sha": "a" * 40,
            "retrieved_at_utc": "2026-11-19T09:00:00+00:00",
            "artifacts": artifacts,
        }), encoding="utf-8")


    def add_operational_release(self, *, forecast_week: str, input_week: str):
        metrics = json.loads(self.metrics_file.read_text(encoding="utf-8"))
        metrics["operational_release"] = {
            "release_type": "nowcast",
            "forecast_week": forecast_week,
            "input_data_through_week": input_week,
            "input_data_ref": "private-source/dengue_cases_2026-11-08.csv",
            "input_data_sha256": "b" * 64,
            "generated_at_utc": "2026-11-19T09:30:00Z",
        }
        self.metrics_file.write_text(json.dumps(metrics), encoding="utf-8")

        manifest = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        payload = self.metrics_file.read_bytes()
        manifest["artifacts"]["metrics.json"]["size_bytes"] = len(payload)
        manifest["artifacts"]["metrics.json"]["sha256"] = hashlib.sha256(payload).hexdigest()
        self.manifest_file.write_text(json.dumps(manifest), encoding="utf-8")

    def test_check_mode_validates_and_does_not_change_existing_outputs(self):
        predictions = self.output_dir / "model_predictions.json"
        metrics = self.output_dir / "model_metrics.json"
        predictions.write_bytes(b"existing-predictions")
        metrics.write_bytes(b"existing-metrics")

        output = io.StringIO()
        error = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            result = converter.main(["--check"])

        self.assertEqual(result, 0, error.getvalue())
        self.assertIn("no output files were written", output.getvalue())
        self.assertEqual(predictions.read_bytes(), b"existing-predictions")
        self.assertEqual(metrics.read_bytes(), b"existing-metrics")

    def test_require_current_blocks_stale_forecast_before_publication(self):
        self.write_sources(forecast_week="2026-11-08")
        predictions = self.output_dir / "model_predictions.json"
        metrics = self.output_dir / "model_metrics.json"
        predictions.write_bytes(b"existing-predictions")
        metrics.write_bytes(b"existing-metrics")

        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            result = converter.main(["--require-current"])

        self.assertEqual(result, 1)
        self.assertIn("--require-current prevents publication", error.getvalue())
        self.assertEqual(predictions.read_bytes(), b"existing-predictions")
        self.assertEqual(metrics.read_bytes(), b"existing-metrics")

    def test_check_and_require_current_blocks_stale_forecast_without_writing(self):
        self.write_sources(forecast_week="2026-11-08")
        predictions = self.output_dir / "model_predictions.json"
        metrics = self.output_dir / "model_metrics.json"
        predictions.write_bytes(b"existing-predictions")
        metrics.write_bytes(b"existing-metrics")

        output = io.StringIO()
        error = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            result = converter.main(["--check", "--require-current"])

        self.assertEqual(result, 1)
        self.assertIn("--require-current prevents publication", error.getvalue())
        self.assertNotIn("Model data conversion completed.", output.getvalue())
        self.assertEqual(predictions.read_bytes(), b"existing-predictions")
        self.assertEqual(metrics.read_bytes(), b"existing-metrics")


    def test_require_current_blocks_current_week_without_operational_provenance(self):
        self.write_sources(forecast_week="2026-11-15")
        predictions = self.output_dir / "model_predictions.json"
        metrics = self.output_dir / "model_metrics.json"
        predictions.write_bytes(b"existing-predictions")
        metrics.write_bytes(b"existing-metrics")

        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            result = converter.main(["--require-current"])

        self.assertEqual(result, 1)
        self.assertIn("operational release acceptance failed", error.getvalue())
        self.assertIn("operational_release", error.getvalue())
        self.assertEqual(predictions.read_bytes(), b"existing-predictions")
        self.assertEqual(metrics.read_bytes(), b"existing-metrics")

    def test_check_require_current_accepts_complete_nowcast_provenance_without_writing(self):
        self.write_sources(forecast_week="2026-11-15")
        self.add_operational_release(forecast_week="2026-11-15", input_week="2026-11-08")
        predictions = self.output_dir / "model_predictions.json"
        metrics = self.output_dir / "model_metrics.json"
        predictions.write_bytes(b"existing-predictions")
        metrics.write_bytes(b"existing-metrics")

        output = io.StringIO()
        error = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            result = converter.main(["--check", "--require-current"])

        self.assertEqual(result, 0, error.getvalue())
        self.assertIn("CHECK ONLY", output.getvalue())
        self.assertEqual(predictions.read_bytes(), b"existing-predictions")
        self.assertEqual(metrics.read_bytes(), b"existing-metrics")

    def test_require_current_rejects_future_week_even_when_it_has_provenance(self):
        self.write_sources(forecast_week="2026-11-22")
        self.add_operational_release(forecast_week="2026-11-22", input_week="2026-11-15")
        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            result = converter.main(["--require-current"])

        self.assertEqual(result, 1)
        self.assertIn("must equal current week 2026-11-15", error.getvalue())

    def test_manifest_size_mismatch_fails_check_without_publication(self):
        manifest = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        manifest["artifacts"]["predictions.csv"]["size_bytes"] += 1
        self.manifest_file.write_text(json.dumps(manifest), encoding="utf-8")

        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            result = converter.main(["--check"])

        self.assertEqual(result, 1)
        self.assertIn("size_bytes does not match predictions.csv", error.getvalue())
        self.assertFalse((self.output_dir / "model_predictions.json").exists())
        self.assertFalse((self.output_dir / "model_metrics.json").exists())

    def test_successful_conversion_publishes_matching_revision_bundle(self):
        output = io.StringIO()
        error = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
            result = converter.main([])

        self.assertEqual(result, 0, error.getvalue())
        predictions = json.loads((self.output_dir / "model_predictions.json").read_text(encoding="utf-8"))
        metrics = json.loads((self.output_dir / "model_metrics.json").read_text(encoding="utf-8"))
        self.assertEqual(predictions["model_revision"], metrics["model_revision"])
        self.assertEqual(len(predictions["forecast"]), 77)
        self.assertIn("staged bundle with rollback", output.getvalue())


class ModelArtifactFetchPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.originals = {
            "ROOT": fetcher.ROOT,
            "DESTINATION": fetcher.DESTINATION,
            "REF": fetcher.REF,
        }
        fetcher.ROOT = self.root
        fetcher.DESTINATION = self.root / "source-data" / "model"
        fetcher.REF = "main"

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(fetcher, name, value)
        self.temporary.cleanup()

    def test_missing_source_artifact_stops_before_download_or_publication(self):
        report = {
            "status": "missing",
            "commit_sha": "a" * 40,
            "message": "required source artifact is missing",
            "artifacts": [
                {"source_path": "DenguYosoku/holdout_predictions.csv", "status": "available"},
                {"source_path": "predict_week/predictions.csv", "status": "missing"},
                {"source_path": "DenguYosoku/metrics.json", "status": "available"},
            ],
        }
        error = io.StringIO()
        with patch.object(fetcher, "probe_model_source", return_value=report), \\
             patch.object(fetcher, "download") as download, \\
             patch.object(fetcher, "publish_file_bundle") as publish:
            with contextlib.redirect_stderr(error):
                result = fetcher.main()

        self.assertEqual(result, 1)
        self.assertIn("predict_week/predictions.csv", error.getvalue())
        self.assertIn("No artifact contents were downloaded", error.getvalue())
        download.assert_not_called()
        publish.assert_not_called()
        self.assertFalse(fetcher.DESTINATION.exists())

    def test_successful_preflight_pins_all_downloads_to_the_resolved_commit(self):
        commit_sha = "c" * 40
        report = {
            "status": "available",
            "commit_sha": commit_sha,
            "message": "all required artifacts are reachable",
            "artifacts": [
                {"source_path": path, "status": "available"}
                for path in fetcher.ARTIFACTS
            ],
        }
        downloaded = []
        published = {}

        def fake_download(url):
            downloaded.append(url)
            return ("payload:" + url.rsplit("/", 1)[-1]).encode("utf-8")

        def fake_publish(bundle):
            published.update(bundle)

        output = io.StringIO()
        error = io.StringIO()
        with patch.object(fetcher, "probe_model_source", return_value=report), \\
             patch.object(fetcher, "download", side_effect=fake_download), \\
             patch.object(fetcher, "publish_file_bundle", side_effect=fake_publish):
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                result = fetcher.main()

        self.assertEqual(result, 0, error.getvalue())
        self.assertEqual(len(downloaded), 3)
        self.assertTrue(all(f"/{commit_sha}/" in url for url in downloaded))
        self.assertEqual(len(published), 4)  # three artifacts plus source manifest
        manifest_path = fetcher.DESTINATION / "source_manifest.json"
        manifest = json.loads(published[manifest_path].decode("utf-8"))
        self.assertEqual(manifest["commit_sha"], commit_sha)
        self.assertIn("Downloaded model artifacts", output.getvalue())


if __name__ == "__main__":
    unittest.main()
