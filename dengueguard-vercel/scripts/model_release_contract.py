#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared operational provenance contract for strict model releases."""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

REQUIRED_PROVENANCE = (
    "release_type",
    "forecast_week",
    "input_data_through_week",
    "input_data_ref",
    "input_data_sha256",
    "generated_at_utc",
)


def parse_sunday_week(value: Any, *, field: str) -> date:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO date string")
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD)") from exc
    if parsed.weekday() != 6:
        raise ValueError(f"{field} must be a Sunday epidemiological week start")
    return parsed


def current_epidemiological_week(now: datetime | None = None) -> date:
    """Return the Sunday-start epidemiological week in Asia/Bangkok (UTC+7)."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    bangkok_date = (current.astimezone(timezone.utc) + timedelta(hours=7)).date()
    return bangkok_date - timedelta(days=(bangkok_date.weekday() + 1) % 7)


def validate_operational_release(
    metrics: Any,
    *,
    forecast_week: date,
    current_week: date,
    now: datetime | None = None,
) -> list[str]:
    """Return strict nowcast/provenance issues; an empty list means accepted."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("now must be timezone-aware")

    issues: list[str] = []
    if not isinstance(metrics, dict):
        return ["metrics.json must contain an operational_release object"]

    provenance = metrics.get("operational_release")
    if not isinstance(provenance, dict):
        return ["metrics.json is missing operational_release provenance object"]

    for key in REQUIRED_PROVENANCE:
        if key not in provenance:
            issues.append(f"operational_release is missing required field {key!r}")

    if provenance.get("release_type") != "nowcast":
        issues.append("operational_release.release_type must be 'nowcast' (the model is not a multi-week forecast)")

    try:
        declared_forecast = parse_sunday_week(
            provenance.get("forecast_week"), field="operational_release.forecast_week"
        )
        if declared_forecast != forecast_week:
            issues.append("operational_release.forecast_week does not match predictions.csv")
    except ValueError as exc:
        issues.append(str(exc))

    try:
        input_week = parse_sunday_week(
            provenance.get("input_data_through_week"),
            field="operational_release.input_data_through_week",
        )
        if forecast_week != date.min and input_week != forecast_week - timedelta(days=7):
            issues.append("operational_release.input_data_through_week must be exactly one epidemiological week before forecast_week for this nowcast")
    except ValueError as exc:
        issues.append(str(exc))

    if forecast_week != current_week:
        issues.append(
            f"forecast week {forecast_week} must equal current epidemiological week {current_week} for a current-week nowcast"
        )

    input_ref = provenance.get("input_data_ref")
    if not isinstance(input_ref, str) or len(input_ref.strip()) < 8:
        issues.append("operational_release.input_data_ref must identify the input dataset/snapshot (at least 8 non-whitespace characters)")

    input_hash = provenance.get("input_data_sha256")
    if not isinstance(input_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", input_hash.strip()):
        issues.append("operational_release.input_data_sha256 must be a 64-character SHA-256")

    timestamp_value = provenance.get("generated_at_utc")
    if not isinstance(timestamp_value, str) or not timestamp_value.strip():
        issues.append("operational_release.generated_at_utc must be an ISO timestamp")
    else:
        try:
            generated_at = datetime.fromisoformat(timestamp_value.strip().replace("Z", "+00:00"))
            if generated_at.tzinfo is None or generated_at.utcoffset() is None:
                raise ValueError("timezone is required")
            if generated_at.utcoffset() != timedelta(0):
                issues.append("operational_release.generated_at_utc must be expressed in UTC (Z or +00:00)")
            generated_utc = generated_at.astimezone(timezone.utc)
            if generated_utc > current.astimezone(timezone.utc) + timedelta(minutes=5):
                issues.append("operational_release.generated_at_utc is in the future")
            if forecast_week != date.min:
                week_start_bangkok = datetime(
                    forecast_week.year, forecast_week.month, forecast_week.day,
                    tzinfo=timezone(timedelta(hours=7)),
                ).astimezone(timezone.utc)
                if generated_utc < week_start_bangkok:
                    issues.append("operational_release.generated_at_utc must be generated during the forecast epidemiological week or later")
        except ValueError as exc:
            if str(exc) == "timezone is required":
                issues.append("operational_release.generated_at_utc must include a timezone")
            else:
                issues.append("operational_release.generated_at_utc must be an ISO timestamp")

    return issues
