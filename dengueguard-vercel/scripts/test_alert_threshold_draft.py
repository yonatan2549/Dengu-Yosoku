import json
import unittest
from pathlib import Path

from scripts.build_alert_threshold_draft import (
    build_candidate,
    quantile_type7,
    quantile_type7_independent,
    nearest_rank,
    _threshold_pair,
)

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = json.loads((ROOT / "public/data/model_predictions.json").read_text(encoding="utf-8"))
CANDIDATE = json.loads((ROOT / "public/data/alert_threshold_candidates_77.json").read_text(encoding="utf-8"))


class AlertThresholdDraftTests(unittest.TestCase):
    def test_candidate_is_reproducible_from_the_review_only_snapshot(self):
        self.assertEqual(build_candidate(SNAPSHOT), CANDIDATE)

    def test_all_77_provinces_have_26_observations_and_valid_ordered_thresholds(self):
        self.assertEqual(len(CANDIDATE["thresholds"]), 77)
        self.assertEqual(len({row["province"] for row in CANDIDATE["thresholds"]}), 77)
        for row in CANDIDATE["thresholds"]:
            self.assertEqual(row["observations"], 26)
            self.assertGreaterEqual(row["watch"], 0)
            self.assertGreater(row["alert"], row["watch"])

    def test_quantile_implementations_match(self):
        values = [0, 1, 2, 4, 8, 12, 20, 35, 50, 90]
        for probability in (0.75, 0.90):
            self.assertAlmostEqual(
                quantile_type7(values, probability),
                quantile_type7_independent(values, probability),
                places=9,
            )

    def test_next_distinct_value_fallback_is_disclosed_for_three_provinces(self):
        fallback = [row["province"] for row in CANDIDATE["thresholds"] if row["fallback"]]
        self.assertEqual(set(fallback), {"ลพบุรี", "ลำพูน", "สิงห์บุรี"})

    def test_temporal_split_uses_18_fit_and_8_validation_weeks(self):
        split = CANDIDATE["computational_review"]["temporal_split_validation"]
        self.assertEqual(split["training_weeks"], 18)
        self.assertEqual(split["validation_weeks"], 8)
        self.assertEqual(split["province_week_observations"], 616)
        self.assertEqual(split["observed_cases_at_or_above_watch"], 158)
        self.assertEqual(split["observed_cases_at_or_above_alert"], 96)
        self.assertGreaterEqual(split["one_case_increment_fallback_count"], 1)

    def test_small_sample_sensitivity_is_reported(self):
        sensitivity = CANDIDATE["computational_review"]["leave_one_week_out_sensitivity"]
        self.assertEqual(sensitivity["median_alert_threshold_span"], 1)
        self.assertEqual(sensitivity["max_alert_threshold_span"], 20.8)
        self.assertIn("กรุงเทพมหานคร", sensitivity["provinces_with_alert_span_over_10"])
        self.assertIn("สงขลา", sensitivity["provinces_with_alert_span_over_10"])

    def test_temporal_split_uses_one_case_increment_when_fit_weeks_have_no_higher_value(self):
        watch, alert, adjustment = _threshold_pair([0.0] * 18, allow_one_case_increment_fallback=True)
        self.assertEqual(watch, 0.0)
        self.assertEqual(alert, 1.0)
        self.assertEqual(adjustment, "one_case_increment_no_higher_fit_observation")

    def test_governance_never_promotes_the_candidate_to_approved(self):
        self.assertEqual(CANDIDATE["status"], "draft")
        self.assertIsNone(CANDIDATE["approval_reference"])
        self.assertIsNone(CANDIDATE["effective_from_week"])
        governance = CANDIDATE["governance"]
        self.assertEqual(governance["approval_status"], "not_approved")
        self.assertEqual(governance["human_independent_review_status"], "not_performed")
        self.assertFalse(governance["may_create_alert_candidates"])
        self.assertFalse(governance["may_classify_national_risk"])
        self.assertFalse(governance["external_notifications_enabled"])


if __name__ == "__main__":
    unittest.main()
