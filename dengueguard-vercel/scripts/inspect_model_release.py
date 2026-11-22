#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only acceptance check for a published DenguYosoku model release.

The command first resolves and HEAD-checks the three configured artifacts via
check_model_source.py. It then reads only the small predictions.csv and
metrics.json payloads into memory (bounded size); it never downloads the
782 KB holdout file, writes project files, or publishes website JSON.

A release is READY only when the 77-province nowcast targets the current
Asia/Bangkok epidemiological week and metrics.json contains explicit
operational input-data provenance. Artifact reachability alone is not enough.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
from datetime import date, datetime, timezone
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from .check_model_source import REPOSITORY, probe_model_source
    from .model_release_contract import current_epidemiological_week, parse_sunday_week, validate_operational_release
except ImportError:  # direct execution: python scripts/inspect_model_release.py
    from check_model_source import REPOSITORY, probe_model_source
    from model_release_contract import current_epidemiological_week, parse_sunday_week, validate_operational_release

USER_AGENT = "DengueYosoku-Model-Release-Acceptance/1.0"
PREDICTIONS_PATH = "predict_week/predictions.csv"
METRICS_PATH = "DenguYosoku/metrics.json"
MAX_METADATA_BYTES = 64 * 1024
EXPECTED_PROVINCES = 77
REQUIRED_METRICS = ("mae", "rmse", "eval_cutoff", "features")
class ReleaseInspectionError(RuntimeError):
    """Raised when bounded upstream metadata cannot be retrieved."""


def _parse_prediction_rows(payload: str) -> tuple[date, int, list[str]]:
    reader = csv.DictReader(io.StringIO(payload.lstrip("\ufeff")))
    headers = set(reader.fieldnames or [])
    missing = sorted({"province", "week_start", "pred"} - headers)
    if missing:
        raise ValueError(f"predictions.csv missing columns: {', '.join(missing)}")

    weeks: set[date] = set()
    provinces: set[str] = set()
    issues: list[str] = []
    row_count = 0
    for line_number, row in enumerate(reader, start=2):
        row_count += 1
        province = (row.get("province") or "").strip()
        if not province:
            issues.append(f"predictions.csv:{line_number}: province is blank")
        elif province in provinces:
            issues.append(f"predictions.csv:{line_number}: duplicate province {province}")
        else:
            provinces.add(province)

        week_value = (row.get("week_start") or "").strip()
        try:
            weeks.add(parse_sunday_week(week_value, field=f"predictions.csv:{line_number}.week_start"))
        except ValueError as exc:
            issues.append(str(exc))

        pred_value = (row.get("pred") or "").strip()
        try:
            prediction = float(pred_value)
            if not math.isfinite(prediction) or prediction < 0:
                raise ValueError
        except ValueError:
            issues.append(f"predictions.csv:{line_number}: pred must be finite and non-negative")

    if row_count != EXPECTED_PROVINCES:
        issues.append(f"predictions.csv must contain exactly {EXPECTED_PROVINCES} rows; found {row_count}")
    if len(provinces) != EXPECTED_PROVINCES:
        issues.append(f"predictions.csv must contain {EXPECTED_PROVINCES} unique nonblank provinces; found {len(provinces)}")
    if len(weeks) != 1:
        issues.append(f"predictions.csv must contain exactly one Sunday forecast week; found {len(weeks)}")

    if len(weeks) == 1:
        forecast_week = next(iter(weeks))
    else:
        # Use a sentinel only in the report; the accumulated validation issue
        # guarantees this value can never produce READY status.
        forecast_week = date.min
    return forecast_week, row_count, issues


def _validate_metrics(metrics: Any, *, forecast_week: date, now: datetime) -> tuple[list[str], dict[str, Any]]:
    issues: list[str] = []
    summary: dict[str, Any] = {}
    if not isinstance(metrics, dict):
        return ["metrics.json must contain a JSON object"], summary

    for key in REQUIRED_METRICS:
        if key not in metrics:
            issues.append(f"metrics.json is missing required field {key!r}")

    for key in ("mae", "rmse"):
        value = metrics.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) < 0:
            issues.append(f"metrics.json {key} must be finite and non-negative")
        else:
            summary[key] = float(value)

    features = metrics.get("features")
    if not isinstance(features, list) or not features or not all(isinstance(item, str) and item.strip() for item in features):
        issues.append("metrics.json features must be a non-empty list of names")
    else:
        summary["feature_count"] = len(features)

    eval_cutoff = metrics.get("eval_cutoff")
    if not isinstance(eval_cutoff, str):
        issues.append("metrics.json eval_cutoff must be an ISO date")
    else:
        try:
            summary["eval_cutoff"] = date.fromisoformat(eval_cutoff.strip()).isoformat()
        except ValueError:
            issues.append("metrics.json eval_cutoff must be an ISO date")

    issues.extend(validate_operational_release(
        metrics,
        forecast_week=forecast_week,
        current_week=current_epidemiological_week(now),
        now=now,
    ))
    provenance = metrics.get("operational_release")
    if isinstance(provenance, dict):
        for key in ("input_data_ref", "input_data_sha256", "generated_at_utc"):
            value = provenance.get(key)
            if isinstance(value, str) and value.strip():
                summary[key] = value.strip()

    return issues, summary


def assess_model_release(
    predictions_csv: str,
    metrics_json: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Validate a release using already-retrieved small text payloads."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    current_week = current_epidemiological_week(current)
    issues: list[str] = []

    try:
        forecast_week, row_count, prediction_issues = _parse_prediction_rows(predictions_csv)
        issues.extend(prediction_issues)
    except (csv.Error, UnicodeError, ValueError) as exc:
        forecast_week, row_count = date.min, 0
        issues.append(f"predictions.csv could not be parsed: {exc}")

    metrics: Any
    try:
        metrics = json.loads(metrics_json.lstrip("\ufeff"))
    except json.JSONDecodeError as exc:
        metrics = None
        issues.append(f"metrics.json is not valid JSON: {exc}")

    metrics_issues, metrics_summary = _validate_metrics(metrics, forecast_week=forecast_week, now=current)
    issues.extend(metrics_issues)

    forecast_label = None if forecast_week == date.min else forecast_week.isoformat()
    lag_weeks: int | None = None
    if forecast_week != date.min:
        delta_days = (current_week - forecast_week).days
        if delta_days > 0:
            lag_weeks = delta_days // 7
            issues.append(f"forecast week {forecast_week} is {lag_weeks} epidemiological week(s) behind current week {current_week}")
        elif delta_days < 0:
            lag_weeks = delta_days // 7
            issues.append(f"forecast week {forecast_week} is ahead of current week {current_week}; this model release contract is for a current-week nowcast")

    return {
        "status": "ready" if not issues else "blocked",
        "current_epidemiological_week": current_week.isoformat(),
        "forecast_week": forecast_label,
        "forecast_lag_weeks": lag_weeks,
        "province_rows": row_count,
        "metrics": metrics_summary,
        "issues": issues,
        "acceptance": {
            "exactly_77_unique_provinces": row_count == EXPECTED_PROVINCES and not any(
                issue.startswith("predictions.csv") and ("province" in issue or "rows" in issue)
                for issue in issues
            ),
            "single_sunday_forecast_week": forecast_week != date.min and not any(
                issue.startswith("predictions.csv") and "week" in issue for issue in issues
            ),
            "current_week_nowcast": forecast_week == current_week,
            "explicit_operational_provenance": isinstance(metrics, dict)
            and isinstance(metrics.get("operational_release"), dict)
            and not any("operational_release" in issue for issue in metrics_issues),
        },
        "write_performed": False,
        "holdout_artifact_downloaded": False,
    }


def _fetch_bounded_text(url: str, *, timeout: float, opener: Callable[..., Any]) -> str:
    request = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/csv, application/json, */*",
        "Cache-Control": "no-cache",
    })
    try:
        response = opener(request, timeout=timeout)
        try:
            status_value = getattr(response, "status", None)
            status = int(status_value if status_value is not None else response.getcode())
            if status < 200 or status >= 300:
                raise ReleaseInspectionError(f"GET {url} returned HTTP {status}")
            raw_length = response.headers.get("Content-Length") or response.headers.get("content-length")
            if raw_length is not None:
                try:
                    if int(raw_length) > MAX_METADATA_BYTES:
                        raise ReleaseInspectionError(f"Refusing {url}: content exceeds {MAX_METADATA_BYTES} bytes")
                except ValueError:
                    pass
            payload = response.read(MAX_METADATA_BYTES + 1)
            if len(payload) > MAX_METADATA_BYTES:
                raise ReleaseInspectionError(f"Refusing {url}: content exceeds {MAX_METADATA_BYTES} bytes")
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
    except HTTPError as exc:
        raise ReleaseInspectionError(f"GET {url} returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ReleaseInspectionError(f"Could not read {url}: {exc}") from exc

    try:
        return payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ReleaseInspectionError(f"{url} is not valid UTF-8 text") from exc


def inspect_upstream_release(
    *,
    ref: str | None = None,
    timeout: float = 20.0,
    opener: Callable[..., Any] = urlopen,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Resolve a ref, verify the three artifact paths, and inspect two small payloads."""
    source_report = probe_model_source(ref=ref, timeout=timeout, opener=opener)
    if source_report.get("status") != "available":
        return {
            "status": "unavailable" if source_report.get("status") == "unavailable" else "blocked",
            "repository": REPOSITORY,
            "ref": source_report.get("ref"),
            "commit_sha": source_report.get("commit_sha"),
            "source_probe": source_report,
            "issues": [source_report.get("message", "Model source preflight did not pass")],
            "write_performed": False,
            "holdout_artifact_downloaded": False,
        }

    commit_sha = source_report["commit_sha"]
    base = f"https://raw.githubusercontent.com/{REPOSITORY}/{commit_sha}"
    try:
        predictions = _fetch_bounded_text(f"{base}/{PREDICTIONS_PATH}", timeout=timeout, opener=opener)
        metrics = _fetch_bounded_text(f"{base}/{METRICS_PATH}", timeout=timeout, opener=opener)
    except ReleaseInspectionError as exc:
        return {
            "status": "unavailable",
            "repository": REPOSITORY,
            "ref": source_report.get("ref"),
            "commit_sha": commit_sha,
            "source_probe": source_report,
            "issues": [str(exc)],
            "write_performed": False,
            "holdout_artifact_downloaded": False,
        }

    report = assess_model_release(predictions, metrics, now=now)
    report.update({
        "repository": REPOSITORY,
        "ref": source_report.get("ref"),
        "commit_sha": commit_sha,
        "source_probe_status": source_report.get("status"),
        "metadata_payloads_read_in_memory": [PREDICTIONS_PATH, METRICS_PATH],
        "metadata_bytes_limit_each": MAX_METADATA_BYTES,
    })
    return report


def render_report(report: dict[str, Any], *, as_json: bool = False) -> None:
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    print("DengueYosoku Model Release Acceptance · READ ONLY")
    print(f"Repository : {report.get('repository', REPOSITORY)}")
    print(f"Ref        : {report.get('ref', 'unavailable')}")
    print(f"Commit     : {report.get('commit_sha') or 'unavailable'}")
    print(f"Current epi week : {report.get('current_epidemiological_week', 'unavailable')}")
    print(f"Forecast week    : {report.get('forecast_week') or 'unavailable'}")
    lag = report.get("forecast_lag_weeks")
    print(f"Forecast lag     : {lag if lag is not None else 'n/a'} week(s)")
    print(f"Province rows    : {report.get('province_rows', 'unavailable')}")
    metrics = report.get("metrics", {})
    if metrics:
        print(f"Eval cutoff      : {metrics.get('eval_cutoff', 'unavailable')}")
        print(f"MAE / RMSE       : {metrics.get('mae', 'unavailable')} / {metrics.get('rmse', 'unavailable')}")
    print(f"Status           : {str(report.get('status', 'unavailable')).upper()}")
    for issue in report.get("issues", []):
        print(f"  - {issue}")
    if report.get("metadata_payloads_read_in_memory"):
        print("Read only        : predictions.csv and metrics.json read in memory (each capped at 64 KiB)")
    print("Safety           : holdout_predictions.csv body not downloaded; no project files written")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect model release freshness and operational provenance without writing project files")
    parser.add_argument("--ref", default=None, help="Git ref to inspect; defaults to DENGUYOSOKU_MODEL_REF or main")
    parser.add_argument("--timeout", type=float, default=20.0, help="Per-request timeout (default: 20 seconds)")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable JSON report")
    args = parser.parse_args(argv)
    if args.timeout <= 0 or args.timeout > 120:
        parser.error("--timeout must be greater than 0 and no more than 120 seconds")

    report = inspect_upstream_release(ref=args.ref, timeout=args.timeout)
    render_report(report, as_json=args.json)
    if report["status"] == "ready":
        return 0
    if report["status"] == "blocked":
        return 2
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
