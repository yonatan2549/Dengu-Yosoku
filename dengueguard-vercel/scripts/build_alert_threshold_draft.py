#!/usr/bin/env python3
"""Build a reproducible, Draft-only 77-province alert-threshold candidate.

Input is the derived weekly province-level model snapshot. No patient-level
records are read or printed. Output is a candidate artifact plus computational
review diagnostics; it never approves or activates an Alert Rule Profile.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from statistics import median
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "public" / "data" / "model_predictions.json"
DEFAULT_OUTPUT = ROOT / "public" / "data" / "alert_threshold_candidates_77.json"
EXPECTED_PROVINCES = 77
MINIMUM_WEEKS = 26


def quantile_type7(values: list[float], probability: float) -> float:
    """Hyndman-Fan Type 7 quantile, using zero-based h=(n-1)*p."""
    ordered = sorted(float(value) for value in values)
    if not ordered or not 0 <= probability <= 1:
        raise ValueError("Quantile requires observations and a probability in [0, 1].")
    h = (len(ordered) - 1) * probability
    lower = math.floor(h)
    upper = math.ceil(h)
    fraction = h - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def quantile_type7_independent(values: list[float], probability: float) -> float:
    """Second implementation using one-based statistical ranks."""
    ordered = sorted(float(value) for value in values)
    if not ordered or not 0 <= probability <= 1:
        raise ValueError("Quantile requires observations and a probability in [0, 1].")
    rank = 1 + (len(ordered) - 1) * probability
    lower_rank = math.floor(rank)
    upper_rank = math.ceil(rank)
    fraction = rank - lower_rank
    low_value = ordered[lower_rank - 1]
    high_value = ordered[upper_rank - 1]
    return low_value + (high_value - low_value) * fraction


def nearest_rank(values: list[float], probability: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered or not 0 < probability <= 1:
        raise ValueError("Nearest-rank quantile requires observations and p in (0, 1].")
    return ordered[math.ceil(probability * len(ordered)) - 1]


def _round(value: float) -> float:
    rounded = round(float(value), 3)
    return 0.0 if rounded == 0 else rounded


def _threshold_pair(
    values: list[float],
    *,
    allow_one_case_increment_fallback: bool = False,
) -> tuple[float, float, str | None]:
    watch = quantile_type7(values, 0.75)
    alert = quantile_type7(values, 0.90)
    adjustment = None
    if alert <= watch:
        larger = sorted({float(value) for value in values if float(value) > watch})
        if larger:
            alert = larger[0]
            adjustment = "next_distinct_observed_value"
        elif allow_one_case_increment_fallback:
            # Temporal fit subsets can be constant (e.g. all zeros). The
            # validation diagnostic uses Watch + one case to preserve strict
            # ordering, and discloses this special fallback separately. This
            # does not change the 26-week per-province candidate thresholds.
            alert = watch + 1.0
            adjustment = "one_case_increment_no_higher_fit_observation"
        else:
            raise ValueError("No observed value above P75; cannot create an ordered Watch/Alert pair.")
    return _round(watch), _round(alert), adjustment


def build_candidate(snapshot: dict[str, Any]) -> dict[str, Any]:
    provinces = snapshot.get("provinces")
    history = snapshot.get("history")
    coverage = snapshot.get("coverage") or {}
    if snapshot.get("release_status") != "review_only":
        raise ValueError("This threshold generator only accepts an explicitly review_only model snapshot.")
    if not isinstance(provinces, list) or len(provinces) != EXPECTED_PROVINCES:
        raise ValueError("Model Snapshot must contain exactly 77 province names.")
    if len(set(provinces)) != EXPECTED_PROVINCES or not all(isinstance(p, str) and p.strip() for p in provinces):
        raise ValueError("Model Snapshot province names must be unique and non-empty.")
    if not isinstance(history, list):
        raise ValueError("Model Snapshot history must be an array.")

    grouped: dict[str, dict[str, float]] = {province: {} for province in provinces}
    weeks = sorted({
        row.get("week_start")
        for row in history
        if isinstance(row, dict) and isinstance(row.get("week_start"), str)
    })
    if len(weeks) < MINIMUM_WEEKS:
        raise ValueError(f"At least {MINIMUM_WEEKS} distinct weekly observations are required.")
    province_set = set(provinces)
    for row in history:
        if not isinstance(row, dict):
            raise ValueError("History contains a malformed row.")
        province = row.get("province")
        week = row.get("week_start")
        value = row.get("actual_cases")
        if province not in province_set or week not in weeks:
            raise ValueError("History contains an unexpected province or week.")
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) < 0:
            raise ValueError("History contains an invalid actual_cases value.")
        if week in grouped[province]:
            raise ValueError(f"Duplicate province/week observation: {province} / {week}")
        grouped[province][week] = float(value)

    if len(history) != EXPECTED_PROVINCES * len(weeks):
        raise ValueError("History row count is not a complete 77-province weekly panel.")
    if any(len(grouped[province]) != len(weeks) for province in provinces):
        raise ValueError("Every province must have one observation for every history week.")

    thresholds: list[dict[str, Any]] = []
    for province in provinces:
        values = [grouped[province][week] for week in weeks]
        watch, alert, adjustment = _threshold_pair(values)
        q75_check = quantile_type7_independent(values, 0.75)
        q90_check = quantile_type7_independent(values, 0.90)
        if abs(q75_check - quantile_type7(values, 0.75)) > 1e-9:
            raise AssertionError(f"Independent P75 implementation mismatch for {province}")
        if abs(q90_check - quantile_type7(values, 0.90)) > 1e-9:
            raise AssertionError(f"Independent P90 implementation mismatch for {province}")

        loo_watch = [
            quantile_type7(values[:index] + values[index + 1 :], 0.75)
            for index in range(len(values))
        ]
        loo_alert = [
            quantile_type7(values[:index] + values[index + 1 :], 0.90)
            for index in range(len(values))
        ]
        thresholds.append({
            "province": province,
            "watch": watch,
            "alert": alert,
            "observations": len(values),
            "zero_weeks": sum(value == 0 for value in values),
            "fallback": adjustment,
            "leave_one_out_watch_span": _round(max(loo_watch) - min(loo_watch)),
            "leave_one_out_alert_span": _round(max(loo_alert) - min(loo_alert)),
            "nearest_rank_watch": _round(nearest_rank(values, 0.75)),
            "nearest_rank_alert": _round(nearest_rank(values, 0.90)),
        })

    # Temporal check: fit thresholds only on the first 18 weeks, inspect the
    # last 8 weeks. This is threshold-exceedance frequency, not outbreak accuracy.
    fit_weeks = weeks[:18]
    validation_weeks = weeks[18:]
    if len(validation_weeks) < 8:
        raise ValueError("At least eight temporal validation weeks are required.")
    weekly_counts = {week: {"week": week, "watch": 0, "alert": 0} for week in validation_weeks}
    watch_count = 0
    alert_count = 0
    temporal_fallback_provinces: list[str] = []
    for province in provinces:
        fit_values = [grouped[province][week] for week in fit_weeks]
        watch, alert, adjustment = _threshold_pair(
            fit_values,
            allow_one_case_increment_fallback=True,
        )
        if adjustment == "one_case_increment_no_higher_fit_observation":
            temporal_fallback_provinces.append(province)
        for week in validation_weeks:
            observed = grouped[province][week]
            if observed >= watch:
                watch_count += 1
                weekly_counts[week]["watch"] += 1
            if observed >= alert:
                alert_count += 1
                weekly_counts[week]["alert"] += 1

    watch_spans = [row["leave_one_out_watch_span"] for row in thresholds]
    alert_spans = [row["leave_one_out_alert_span"] for row in thresholds]
    max_watch_delta = max(abs(row["watch"] - row["nearest_rank_watch"]) for row in thresholds)
    max_alert_delta = max(abs(row["alert"] - row["nearest_rank_alert"]) for row in thresholds)
    large_alert_spread = [
        row["province"] for row in thresholds if row["leave_one_out_alert_span"] > 10
    ]
    max_alert_delta_provinces = [
        row["province"] for row in thresholds
        if abs(row["alert"] - row["nearest_rank_alert"]) == max_alert_delta
    ]
    fallback_count = sum(row["fallback"] is not None for row in thresholds)
    if len(thresholds) != EXPECTED_PROVINCES or any(row["watch"] >= row["alert"] for row in thresholds):
        raise AssertionError("Candidate threshold coverage or Watch/Alert ordering failed.")

    return {
        "schema_version": 1,
        "profile_id": "dengueyosoku-national-alerts",
        "profile_version": "0.1.0-draft",
        "status": "draft",
        "scope": "national_77_provinces",
        "metric": "weekly_predicted_cases",
        "methodology": (
            "Draft statistical candidate: province-specific Type-7 empirical quantiles of weekly observed "
            f"case counts over {len(weeks)} weeks ({weeks[0]} through {weeks[-1]}). Watch=P75; Alert=P90. "
            f"Where P90 equals P75 ({fallback_count} provinces), Alert is set to the next distinct observed "
            "case count to preserve Watch < Alert. Applied only as a candidate reference for weekly predicted "
            "cases; not an official outbreak definition or approved public-health rule."
        ),
        "effective_from_week": None,
        "approval_reference": None,
        "external_notifications_enabled": False,
        "source": {
            "model_snapshot_revision": snapshot.get("model_revision"),
            "model_snapshot_release_status": snapshot.get("release_status"),
            "forecast_week": coverage.get("forecast_week"),
            "history_start_week": weeks[0],
            "history_end_week": weeks[-1],
            "history_weeks": len(weeks),
            "province_count": len(provinces),
            "history_rows": len(history),
            "observations_per_province": len(weeks),
            "model_generated_at_utc": snapshot.get("generated_at_utc"),
            "source_repository": snapshot.get("source_repository"),
            "source_commit_sha": snapshot.get("source_commit_sha"),
        },
        "quantile_method": "Hyndman-Fan Type 7; linear interpolation at h=(n-1)*p",
        "fallback_policy": (
            "If P90 <= P75, use the smallest distinct observed case count above P75; "
            "record the fallback per province."
        ),
        "thresholds": thresholds,
        "computational_review": {
            "status": "passed_with_limitations",
            "checks": [
                {"id": "coverage", "status": "pass", "detail": "77/77 unique provinces with exactly 26 weekly observations each."},
                {"id": "quantile-dual-implementation", "status": "pass", "detail": "Two separately written Type-7 quantile implementations match within 1e-9."},
                {"id": "threshold-order", "status": "pass", "detail": "Watch < Alert in all 77 provinces; tied P90/P75 cases are disclosed and adjusted."},
                {"id": "temporal-split", "status": "pass_with_limitations", "detail": "First 18 weeks fit, final 8 weeks check exceedance frequency only."},
                {"id": "leave-one-week-out", "status": "pass_with_limitations", "detail": "P75/P90 recalculated after omitting each week to show sample sensitivity."},
            ],
            "fallback_count": fallback_count,
            "leave_one_week_out_sensitivity": {
                "median_watch_threshold_span": _round(median(watch_spans)),
                "max_watch_threshold_span": _round(max(watch_spans)),
                "median_alert_threshold_span": _round(median(alert_spans)),
                "max_alert_threshold_span": _round(max(alert_spans)),
                "provinces_with_alert_span_over_10": large_alert_spread,
            },
            "quantile_definition_sensitivity": {
                "max_watch_delta_vs_nearest_rank": _round(max_watch_delta),
                "max_alert_delta_vs_nearest_rank": _round(max_alert_delta),
                "largest_alert_delta_provinces": max_alert_delta_provinces,
            },
            "temporal_split_validation": {
                "method": "Fit P75/P90 on first 18 weeks; count observed cases at or above each threshold in final 8 weeks.",
                "training_start_week": fit_weeks[0],
                "training_end_week": fit_weeks[-1],
                "training_weeks": len(fit_weeks),
                "validation_start_week": validation_weeks[0],
                "validation_end_week": validation_weeks[-1],
                "validation_weeks": len(validation_weeks),
                "province_week_observations": len(validation_weeks) * EXPECTED_PROVINCES,
                "observed_cases_at_or_above_watch": watch_count,
                "observed_cases_at_or_above_watch_percent": _round(watch_count / (len(validation_weeks) * EXPECTED_PROVINCES) * 100),
                "observed_cases_at_or_above_alert": alert_count,
                "observed_cases_at_or_above_alert_percent": _round(alert_count / (len(validation_weeks) * EXPECTED_PROVINCES) * 100),
                "one_case_increment_fallback_count": len(temporal_fallback_provinces),
                "one_case_increment_fallback_provinces": temporal_fallback_provinces,
                "weekly_candidate_counts": list(weekly_counts.values()),
            },
        },
        "governance": {
            "automated_quantitative_review_status": "passed_with_limitations",
            "human_independent_review_status": "not_performed",
            "clinical_review_status": "not_performed",
            "approval_status": "not_approved",
            "may_create_alert_candidates": False,
            "may_classify_national_risk": False,
            "external_notifications_enabled": False,
            "limitations": [
                "Only 26 weeks are available (about six months), not a full 52-week seasonal cycle.",
                "Thresholds are absolute weekly counts and do not adjust for population, testing volume, reporting completeness, or outbreak context.",
                "Temporal split rates are exceedance frequencies, not sensitivity, specificity, PPV, or proof of outbreak detection.",
                "The source model snapshot is review_only and targets 2026-11-15; it is stale for the epidemiological week beginning 2026-11-22.",
                "Automated quantitative review is not an independent epidemiologist's sign-off or clinical approval.",
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="Verify that the committed candidate exactly matches the source snapshot.")
    args = parser.parse_args()
    snapshot = json.loads(args.input.read_text(encoding="utf-8"))
    expected = build_candidate(snapshot)
    rendered = json.dumps(expected, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists():
            raise SystemExit(f"Missing generated candidate file: {args.output}")
        actual = args.output.read_text(encoding="utf-8")
        if actual != rendered:
            raise SystemExit("Committed alert threshold candidate is not reproducible from model_predictions.json")
        print("PASS: 77-province Draft threshold candidate is reproducible and audit checks pass.")
        return 0
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Wrote Draft threshold candidate to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
