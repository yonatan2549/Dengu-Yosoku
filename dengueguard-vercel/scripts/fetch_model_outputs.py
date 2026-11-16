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
        api_url = f"https://api.github.com/repos/{REPOSITORY}/commits/{REF}"
        commit_payload = json.loads(download(api_url).decode("utf-8"))
        commit_sha = commit_payload.get("sha")
        if not isinstance(commit_sha, str) or len(commit_sha) != 40:
            raise RuntimeError("GitHub did not return a valid 40-character commit SHA")

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

        DESTINATION.mkdir(parents=True, exist_ok=True)
        temporary_paths: list[tuple[Path, Path]] = []
        for filename, payload in pending.items():
            destination = DESTINATION / filename
            temporary = destination.with_suffix(destination.suffix + ".tmp")
            temporary.write_bytes(payload)
            temporary_paths.append((temporary, destination))

        manifest = {
            "repository": f"https://github.com/{REPOSITORY}",
            "ref": REF,
            "commit_sha": commit_sha,
            "retrieved_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "artifacts": manifest_artifacts,
        }
        manifest_path = DESTINATION / "source_manifest.json"
        manifest_tmp = manifest_path.with_suffix(".json.tmp")
        manifest_tmp.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        for temporary, destination in temporary_paths:
            temporary.replace(destination)
        manifest_tmp.replace(manifest_path)

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
