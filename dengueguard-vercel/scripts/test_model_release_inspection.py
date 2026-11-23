from __future__ import annotations

import csv
import io
import json
import unittest
from datetime import datetime, timezone

from scripts.inspect_model_release import (
    MAX_METADATA_BYTES,
    ReleaseInspectionError,
    _fetch_bounded_text,
    assess_model_release,
    current_epidemiological_week,
    inspect_upstream_release,
)

NOW = datetime(2026, 11, 19, 11, 55, tzinfo=timezone.utc)  # 18:55 Asia/Bangkok
CURRENT_WEEK = "2026-11-15"
PROVINCES = [f"Province {index:02d}" for index in range(1, 78)]


def predictions_csv(*, week=CURRENT_WEEK, count=77, duplicate=False, second_week=False, bad_week=False, negative=False):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=["province", "week_start", "pred"])
    writer.writeheader()
    for index in range(count):
        province = PROVINCES[index]
        if duplicate and index == count - 1:
            province = PROVINCES[0]
        row_week = "2026-11-16" if bad_week and index == 0 else week
        if second_week and index == count - 1:
            row_week = "2026-11-08"
        writer.writerow({"province": province, "week_start": row_week, "pred": -1 if negative and index == 0 else 2.5})
    return stream.getvalue()


def metrics_json(**overrides):
    payload = {
        "mae": 3.5,
        "rmse": 6.5,
        "eval_cutoff": "2026-10-25",
        "features": ["cases_L1", "cases_L2"],
        "operational_release": {
            "release_type": "nowcast",
            "forecast_week": CURRENT_WEEK,
            "input_data_through_week": "2026-11-08",
            "input_data_ref": "private-source/dengue_cases_2026-11-08.csv",
            "input_data_sha256": "a" * 64,
            "generated_at_utc": "2026-11-19T10:00:00Z",
        },
    }
    for key, value in overrides.items():
        payload[key] = value
    return json.dumps(payload)




class FakeResponse:
    def __init__(self, payload=b"", *, status=200, headers=None):
        self.payload = payload
        self.status = status
        self.headers = headers or {}
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        if size < 0:
            return self.payload
        return self.payload[:size]

    def close(self):
        pass


class ModelReleaseInspectionTests(unittest.TestCase):
    def assess(self, predictions=None, metrics=None):
        return assess_model_release(predictions or predictions_csv(), metrics or metrics_json(), now=NOW)

    def test_current_week_with_explicit_input_provenance_is_ready(self):
        report = self.assess()
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["current_epidemiological_week"], CURRENT_WEEK)
        self.assertTrue(all(report["acceptance"].values()))
        self.assertFalse(report["write_performed"])


    def test_bounded_metadata_reader_refuses_payloads_over_64_kib(self):
        response = FakeResponse(b"x" * (MAX_METADATA_BYTES + 1), headers={"Content-Length": str(MAX_METADATA_BYTES + 1)})
        with self.assertRaisesRegex(ReleaseInspectionError, "exceeds 65536 bytes"):
            _fetch_bounded_text("https://example.invalid/metadata.json", timeout=1, opener=lambda request, timeout: response)
        self.assertEqual(response.read_sizes, [])

    def test_network_inspection_only_gets_small_prediction_and_metrics_payloads(self):
        import json as json_module
        from urllib.request import Request

        calls = []
        def opener(request: Request, timeout: float):
            url = request.full_url
            method = request.get_method()
            calls.append((method, url))
            if "api.github.com" in url:
                body = json_module.dumps({"sha": "a" * 40}).encode()
                return FakeResponse(body, headers={"Content-Length": str(len(body))})
            if method == "HEAD":
                return FakeResponse(b"", headers={"Content-Length": "100"})
            if url.endswith("/predict_week/predictions.csv"):
                body = predictions_csv().encode()
                return FakeResponse(body, headers={"Content-Length": str(len(body))})
            if url.endswith("/DenguYosoku/metrics.json"):
                body = metrics_json().encode()
                return FakeResponse(body, headers={"Content-Length": str(len(body))})
            raise AssertionError(f"Unexpected GET request: {url}")

        report = inspect_upstream_release(ref="main", timeout=1, opener=opener, now=NOW)
        self.assertEqual(report["status"], "ready")
        self.assertTrue(any(method == "HEAD" and url.endswith("/DenguYosoku/holdout_predictions.csv") for method, url in calls))
        self.assertFalse(any(method == "GET" and url.endswith("/DenguYosoku/holdout_predictions.csv") for method, url in calls))
        self.assertEqual(sum(1 for method, _ in calls if method == "GET" and "raw.githubusercontent.com" in _), 2)
        self.assertFalse(report["write_performed"])
        self.assertFalse(report["holdout_artifact_downloaded"])

    def test_current_week_calculation_uses_bangkok_sunday_start(self):
        self.assertEqual(current_epidemiological_week(NOW).isoformat(), CURRENT_WEEK)

    def test_stale_forecast_is_blocked_and_lag_is_reported(self):
        report = self.assess(predictions_csv(week="2026-10-25"), metrics_json(operational_release={
            "release_type": "nowcast", "forecast_week": "2026-10-25",
            "input_data_through_week": "2026-10-18", "input_data_ref": "snapshot.csv",
            "input_data_sha256": "b" * 64, "generated_at_utc": "2026-10-26T00:00:00Z",
        }))
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["forecast_lag_weeks"], 3)
        self.assertTrue(any("3 epidemiological week(s) behind" in item for item in report["issues"]))

    def test_future_target_is_not_accepted_as_a_nowcast(self):
        week = "2026-11-22"
        report = self.assess(predictions_csv(week=week), metrics_json(operational_release={
            "release_type": "nowcast", "forecast_week": week,
            "input_data_through_week": "2026-11-15", "input_data_ref": "snapshot.csv",
            "input_data_sha256": "b" * 64, "generated_at_utc": "2026-11-19T10:00:00Z",
        }))
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any("ahead of current week" in item for item in report["issues"]))

    def test_requires_exactly_77_rows(self):
        report = self.assess(predictions_csv(count=76))
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any("exactly 77 rows" in item for item in report["issues"]))

    def test_rejects_duplicate_province_names(self):
        report = self.assess(predictions_csv(duplicate=True))
        self.assertTrue(any("duplicate province" in item for item in report["issues"]))

    def test_rejects_blank_province_names(self):
        source = predictions_csv().replace("Province 01,2026-11-15,2.5", ",2026-11-15,2.5", 1)
        report = self.assess(source)
        self.assertTrue(any("province is blank" in item for item in report["issues"]))

    def test_rejects_multiple_forecast_weeks(self):
        report = self.assess(predictions_csv(second_week=True))
        self.assertTrue(any("exactly one Sunday forecast week" in item for item in report["issues"]))

    def test_rejects_non_sunday_week_start(self):
        report = self.assess(predictions_csv(bad_week=True))
        self.assertTrue(any("must be a Sunday epidemiological week start" in item for item in report["issues"]))

    def test_rejects_negative_prediction(self):
        report = self.assess(predictions_csv(negative=True))
        self.assertTrue(any("finite and non-negative" in item for item in report["issues"]))

    def test_rejects_non_finite_prediction(self):
        source = predictions_csv().replace("Province 01,2026-11-15,2.5", "Province 01,2026-11-15,nan", 1)
        report = self.assess(source)
        self.assertTrue(any("finite and non-negative" in item for item in report["issues"]))

    def test_requires_operational_release_object(self):
        report = self.assess(metrics=metrics_json(operational_release=None))
        self.assertTrue(any("missing operational_release provenance object" in item for item in report["issues"]))

    def test_requires_input_data_to_be_exactly_one_week_before_target(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["input_data_through_week"] = "2026-11-01"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("exactly one epidemiological week before" in item for item in report["issues"]))

    def test_requires_sha256_for_input_snapshot(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["input_data_sha256"] = "not-a-hash"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("64-character SHA-256" in item for item in report["issues"]))

    def test_requires_timezone_aware_generation_timestamp(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["generated_at_utc"] = "2026-11-19T10:00:00"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("must include a timezone" in item for item in report["issues"]))

    def test_rejects_future_generation_timestamp(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["generated_at_utc"] = "2026-12-01T00:00:00Z"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("is in the future" in item for item in report["issues"]))

    def test_requires_nowcast_release_type(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["release_type"] = "multi-week-forecast"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("must be 'nowcast'" in item for item in report["issues"]))

    def test_rejects_invalid_metrics_json(self):
        report = self.assess(metrics="{not-json")
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any("not valid JSON" in item for item in report["issues"]))

    def test_requires_nonempty_features_and_valid_quality_metrics(self):
        report = self.assess(metrics=metrics_json(mae=float("nan"), features=[]))
        self.assertTrue(any("mae must be finite" in item for item in report["issues"]))
        self.assertTrue(any("features must be a non-empty" in item for item in report["issues"]))


    def test_rejects_generation_timestamp_before_forecast_week(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["generated_at_utc"] = "2026-11-14T16:59:59Z"  # Before 15 Nov 00:00 in Bangkok
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("during the forecast epidemiological week" in item for item in report["issues"]))

    def test_rejects_non_utc_generation_timestamp(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["generated_at_utc"] = "2026-11-19T17:00:00+07:00"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("must be expressed in UTC" in item for item in report["issues"]))

    def test_requires_identifiable_input_data_reference(self):
        provenance = json.loads(metrics_json())["operational_release"]
        provenance["input_data_ref"] = "data"
        report = self.assess(metrics=metrics_json(operational_release=provenance))
        self.assertTrue(any("at least 8 non-whitespace characters" in item for item in report["issues"]))

if __name__ == "__main__":
    unittest.main()
