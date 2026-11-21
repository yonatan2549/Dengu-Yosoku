#!/usr/bin/env python3
"""Prepare a validated, review-only Phase 13 snapshot for the web Dashboard.

This script converts only derived holdout predictions, the 77-province forecast,
and model metrics. The raw TanRabad bundle, source case panel, training/full
panels, and LightGBM model weights are not copied to the website data folder.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from . import convert_model_outputs as converter
except ImportError:
    import convert_model_outputs as converter


EXPECTED_REPOSITORY = "https://github.com/johnlovepizza/DenguYosoku"
EXPECTED_FEATURES = {
    "cases_L1", "cases_L2", "cases_L3", "cases_L4", "cases_L8", "cases_L12",
    "outbreak_momentum", "cases_L1_relative", "cases_L2_relative",
    "sin_week", "cos_week", "w_apparent_temperature_mean_L1",
}
EXPECTED_FILES = {
    "holdout_predictions.csv": "DenguYosoku/holdout_predictions.csv",
    "predictions.csv": "predict_week/predictions.csv",
    "metrics.json": "DenguYosoku/metrics.json",
}


class SnapshotPreparationError(ValueError):
    """Raised when model artifacts are not eligible for a review snapshot."""


def read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotPreparationError(f"Unable to read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise SnapshotPreparationError(f"{label} must be a JSON object.")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_training_bundle(artifact_dir: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    metrics = read_json(artifact_dir / "metrics.json", "metrics.json")
    training_manifest = read_json(artifact_dir / "training_manifest.json", "training_manifest.json")
    data_audit = read_json(artifact_dir / "data_audit.json", "data_audit.json")

    if training_manifest.get("manifest_type") != "training_run_manifest_not_publication_manifest":
        raise SnapshotPreparationError("The input training manifest is not a Phase 13 training-run manifest.")
    if data_audit.get("status") != "passed":
        raise SnapshotPreparationError("The source-pair data audit did not pass.")

    source_repo = training_manifest.get("source_repository")
    source_sha = training_manifest.get("source_commit_sha")
    if source_repo != EXPECTED_REPOSITORY:
        raise SnapshotPreparationError(f"Unexpected model data repository: {source_repo!r}.")
    if not isinstance(source_sha, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", source_sha):
        raise SnapshotPreparationError("The training manifest has no valid upstream source commit SHA.")

    if metrics.get("source_repository") != source_repo or metrics.get("source_commit_sha", "").lower() != source_sha.lower():
        raise SnapshotPreparationError("Metrics provenance does not match the training manifest.")
    if metrics.get("model_revision") != source_sha:
        raise SnapshotPreparationError("Model metrics revision does not match the pinned upstream source revision.")
    if metrics.get("forecast_status") != "current_candidate":
        raise SnapshotPreparationError("The forecast is not labelled current_candidate.")
    if metrics.get("province_count") != 77:
        raise SnapshotPreparationError("The model must cover exactly 77 provinces.")
    if metrics.get("features") is None or set(metrics.get("features", [])) != EXPECTED_FEATURES:
        raise SnapshotPreparationError("The model does not match the expected 12-feature Phase 13 contract.")
    if len(metrics.get("features", [])) != 12:
        raise SnapshotPreparationError("The Phase 13 model must have exactly 12 features.")

    forecast_week = metrics.get("forecast_week")
    input_week = metrics.get("input_data_through_week")
    provenance = metrics.get("operational_release")
    if not isinstance(provenance, dict):
        raise SnapshotPreparationError("metrics.json is missing operational_release provenance.")
    if (
        provenance.get("release_type") != "nowcast"
        or provenance.get("forecast_week") != forecast_week
        or provenance.get("input_data_through_week") != input_week
    ):
        raise SnapshotPreparationError("Operational provenance does not match the model forecast metadata.")
    if data_audit.get("forecast_target_week") != forecast_week:
        raise SnapshotPreparationError("The source-pair audit target does not match metrics.json.")
    if data_audit.get("training_end_week") != input_week:
        raise SnapshotPreparationError("The source-pair audit training end does not match operational provenance.")
    if data_audit.get("target_week_actuals_used_as_features") is not False:
        raise SnapshotPreparationError("The audit does not explicitly confirm target labels were excluded from features.")

    outputs = training_manifest.get("outputs")
    if not isinstance(outputs, dict):
        raise SnapshotPreparationError("Training manifest outputs are missing.")
    for file_name in EXPECTED_FILES:
        file_path = artifact_dir / file_name
        metadata = outputs.get(file_name)
        if not file_path.is_file() or not isinstance(metadata, dict):
            raise SnapshotPreparationError(f"Missing model output artifact: {file_name}.")
        if metadata.get("size_bytes") != file_path.stat().st_size:
            raise SnapshotPreparationError(f"Size mismatch for {file_name}.")
        if metadata.get("sha256") != sha256_file(file_path):
            raise SnapshotPreparationError(f"SHA-256 mismatch for {file_name}.")

    if metrics.get("n_test") <= 0 or metrics.get("n_test") % 77 != 0:
        raise SnapshotPreparationError("Holdout row count must represent complete 77-province weeks.")
    if metrics.get("eval_cutoff") != input_week:
        raise SnapshotPreparationError("Metrics evaluation cutoff must match the last labelled input week.")

    forecast_info = data_audit.get("full_source", {})
    if (
        forecast_info.get("target_week_rows") != 77
        or forecast_info.get("blank_target_rows") != 77
        or forecast_info.get("blank_weather_rows") != 77
        or forecast_info.get("target_week_actuals_present_in_raw_full") is not False
    ):
        raise SnapshotPreparationError("Target-week rows fail the blank-label / no-leakage audit.")

    return metrics, training_manifest, data_audit


def prepare_current_snapshot(
    artifact_dir: Path,
    output_dir: Path,
    *,
    model_revision: str,
    training_run_id: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", model_revision or ""):
        raise SnapshotPreparationError("model_revision must be a 40-character Git commit SHA.")
    if not training_run_id or not training_run_id.strip():
        raise SnapshotPreparationError("training_run_id is required.")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None or current.utcoffset() is None:
        raise SnapshotPreparationError("now must be timezone-aware.")

    metrics, training_manifest, _ = validate_training_bundle(artifact_dir)
    retrieved_at = current.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    source_commit = str(training_manifest["source_commit_sha"]).lower()
    source_ref = str(training_manifest.get("source_ref") or "main")

    source_dir = output_dir / "source-data" / "model"
    public_dir = output_dir / "public" / "data"
    source_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)

    source_manifest_artifacts: dict[str, dict[str, Any]] = {}
    for file_name, source_path in EXPECTED_FILES.items():
        source = artifact_dir / file_name
        destination = source_dir / file_name
        shutil.copyfile(source, destination)
        source_manifest_artifacts[file_name] = {
            "source_path": source_path,
            "size_bytes": destination.stat().st_size,
            "sha256": sha256_file(destination),
        }

    source_manifest = {
        "repository": EXPECTED_REPOSITORY,
        "ref": source_ref,
        "commit_sha": source_commit,
        "model_revision": model_revision.lower(),
        "release_status": "review_only",
        "training_run_id": training_run_id,
        "retrieved_at_utc": retrieved_at,
        "artifacts": source_manifest_artifacts,
    }
    (source_dir / "source_manifest.json").write_text(
        json.dumps(source_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    original_values = {
        "ROOT": converter.ROOT,
        "SOURCE_DIR": converter.SOURCE_DIR,
        "PUBLIC_DATA_DIR": converter.PUBLIC_DATA_DIR,
        "HISTORY_FILE": converter.HISTORY_FILE,
        "FORECAST_FILE": converter.FORECAST_FILE,
        "METRICS_FILE": converter.METRICS_FILE,
        "datetime": converter.datetime,
    }
    converter.ROOT = output_dir
    converter.SOURCE_DIR = source_dir
    converter.PUBLIC_DATA_DIR = public_dir
    converter.HISTORY_FILE = source_dir / "holdout_predictions.csv"
    converter.FORECAST_FILE = source_dir / "predictions.csv"
    converter.METRICS_FILE = source_dir / "metrics.json"

    if now is not None:
        class FrozenDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                value = now.astimezone(timezone.utc)
                return cls.fromtimestamp(value.timestamp(), tz=timezone.utc if tz else None)

        converter.datetime = FrozenDateTime

    try:
        check_result = converter.main(["--check", "--require-current"])
        if check_result != 0:
            raise SnapshotPreparationError("Model converter preflight did not pass; no public snapshot was written.")
        convert_result = converter.main(["--require-current"])
        if convert_result != 0:
            raise SnapshotPreparationError("Model converter did not create the model snapshot.")
    finally:
        for name, value in original_values.items():
            setattr(converter, name, value)

    predictions_path = public_dir / "model_predictions.json"
    metrics_path = public_dir / "model_metrics.json"
    if not predictions_path.is_file() or not metrics_path.is_file():
        raise SnapshotPreparationError("The converter did not produce both Dashboard model files.")

    predictions_payload = read_json(predictions_path, "model_predictions.json")
    metrics_payload = read_json(metrics_path, "model_metrics.json")
    if (
        predictions_payload.get("release_status") != "review_only"
        or metrics_payload.get("release_status") != "review_only"
        or predictions_payload.get("model_revision") != metrics_payload.get("model_revision")
    ):
        raise SnapshotPreparationError("The generated Predictions/Metrics review-only status or revision does not match.")
    if predictions_payload.get("coverage", {}).get("forecast_rows") != 77:
        raise SnapshotPreparationError("The generated web snapshot does not contain 77 forecast rows.")

    report = {
        "status": "prepared_review_only",
        "release_status": "review_only",
        "training_run_id": training_run_id,
        "model_revision": model_revision.lower(),
        "source_data_revision": source_commit,
        "forecast_week": metrics.get("forecast_week"),
        "input_data_through_week": metrics.get("input_data_through_week"),
        "province_count": 77,
        "holdout_rows": metrics.get("n_test"),
        "feature_count": len(metrics.get("features", [])),
        "mae": metrics.get("mae"),
        "rmse": metrics.get("rmse"),
        "forecast_total": sum(row["prediction"] for row in predictions_payload["forecast"]),
        "files": {
            "model_predictions.json": {
                "size_bytes": predictions_path.stat().st_size,
                "sha256": sha256_file(predictions_path),
            },
            "model_metrics.json": {
                "size_bytes": metrics_path.stat().st_size,
                "sha256": sha256_file(metrics_path),
            },
        },
        "publication_note": "These files are review-only branch preview assets. No alert eligibility or external notification is approved.",
    }
    (output_dir / "model-snapshot-preparation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare a review-only 77-province Dashboard model snapshot.")
    parser.add_argument("--artifact-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--model-revision", required=True)
    parser.add_argument("--training-run-id", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = prepare_current_snapshot(
        args.artifact_dir,
        args.output_dir,
        model_revision=args.model_revision,
        training_run_id=args.training_run_id,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("Review-only Dashboard model files prepared. No external alert or deployment was enabled.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (SnapshotPreparationError, OSError) as exc:
        raise SystemExit(f"ERROR: {exc}")
