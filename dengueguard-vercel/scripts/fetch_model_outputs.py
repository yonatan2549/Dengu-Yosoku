#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Download the published model artifacts from a pinned GitHub commit.

Usage from the dengueguard-vercel project root:
    python scripts/fetch_model_outputs.py
    python scripts/convert_model_outputs.py

Only public, derived artifacts are downloaded. The script deliberately does
not download raw case data, answer_key.csv, or model.txt.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from .check_model_source import probe_model_source
    from .model_artifact_transaction import publish_file_bundle
except ImportError:  # direct execution: python scripts/fetch_model_outputs.py
    from check_model_source import probe_model_source
    from model_artifact_transaction import publish_file_bundle

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "source-data" / "model"
REPOSITORY = "johnlovepizza/DenguYosoku"
REF = os.environ.get("DENGUYOSOKU_MODEL_REF", "main")
ARTIFACTS = {
    "DenguYosoku/holdout_predictions.csv": "holdout_predictions.csv",
    "predict_week/predictions.csv": "predictions.csv",
    "DenguYosoku/metrics.json": "metrics.json",
}


def download(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "DengueYosoku-Model-Artifact-Sync/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"Could not download {url}: {exc}") from exc
    if not payload:
        raise RuntimeError(f"Downloaded an empty file from {url}")
    return payload


def main() -> int:
    try:
        if not isinstance(REF, str) or not REF.strip():
            raise RuntimeError("DENGUYOSOKU_MODEL_REF must be a non-empty Git reference")

        # Resolve and HEAD-check every required artifact before downloading any
        # payload. This prevents a partial/needless download (especially the
        # historical holdout actuals) when the forecast artifact is missing.
        source_report = probe_model_source(ref=REF)
        if source_report.get("status") != "available":
            missing = [
                item.get("source_path", "unknown path")
                for item in source_report.get("artifacts", [])
                if item.get("status") != "available"
            ]
            details = ", ".join(missing) or source_report.get("message", "source preflight failed")
            raise RuntimeError(
                f"Model source preflight {source_report.get('status', 'failed')}: {details}. "
                "No artifact contents were downloaded and no destination files were changed."
            )

        commit_sha = source_report.get("commit_sha")
        if not isinstance(commit_sha, str) or len(commit_sha) != 40 or any(
            character not in "0123456789abcdefABCDEF" for character in commit_sha
        ):
            raise RuntimeError("Source preflight did not return a valid pinned commit SHA")
        commit_sha = commit_sha.lower()

        pending: dict[str, bytes] = {}
        manifest_artifacts: dict[str, dict[str, object]] = {}
        for source_path, destination_name in ARTIFACTS.items():
            url = (
                f"https://raw.githubusercontent.com/{REPOSITORY}/"
                f"{commit_sha}/{source_path}"
            )
            payload = download(url)
            pending[destination_name] = payload
            manifest_artifacts[destination_name] = {
                "source_path": source_path,
                "size_bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }

        manifest = {
            "repository": f"https://github.com/{REPOSITORY}",
            "ref": REF,
            "commit_sha": commit_sha.lower(),
            "retrieved_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "artifacts": manifest_artifacts,
        }
        manifest_path = DESTINATION / "source_manifest.json"
        bundle = {
            DESTINATION / filename: payload
            for filename, payload in pending.items()
        }
        bundle[manifest_path] = json.dumps(
            manifest, ensure_ascii=False, indent=2
        ).encode("utf-8")

        # Stage every artifact and the manifest before replacing any destination.
        # If a replacement fails, previously replaced files are restored.
        publish_file_bundle(bundle)

        print(f"Downloaded model artifacts from {REPOSITORY}@{commit_sha[:12]}")
        for filename, info in manifest_artifacts.items():
            print(f"  {filename}: {info['size_bytes']:,} bytes")
        print(f"  Manifest: {manifest_path.relative_to(ROOT)}")
        print("Next: python scripts/convert_model_outputs.py")
        return 0

    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
