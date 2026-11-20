#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only probe for the configured public DengueYosoku model artifact paths.

This command resolves one Git reference to a commit SHA, then sends HEAD requests
for the exact artifact paths used by fetch_model_outputs.py. It never downloads
CSV/JSON contents and never writes to source-data or public/data.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Callable
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Canonical model repository supplied by the project owner (no hyphen).
# Keep this identical to scripts/fetch_model_outputs.py.
REPOSITORY = "johnlovepizza/DenguYosoku"
ARTIFACTS = (
    ("DenguYosoku/holdout_predictions.csv", "holdout_predictions.csv"),
    ("predict_week/predictions.csv", "predictions.csv"),
    ("DenguYosoku/metrics.json", "metrics.json"),
)
USER_AGENT = "DengueYosoku-Model-Source-Preflight/1.0"


class ProbeError(RuntimeError):
    pass


def _request(
    opener: Callable[..., Any],
    request: Request,
    timeout: float,
) -> tuple[int, dict[str, str], bytes]:
    """Return status, headers and body, retaining HTTP error status for diagnostics."""
    try:
        response = opener(request, timeout=timeout)
        try:
            status_value = getattr(response, "status", None)
            status = int(status_value if status_value is not None else response.getcode())
            headers = {str(k).lower(): str(v) for k, v in response.headers.items()}
            body = response.read() if request.get_method() != "HEAD" else b""
            return status, headers, body
        finally:
            close = getattr(response, "close", None)
            if callable(close):
                close()
    except HTTPError as exc:
        headers = {str(k).lower(): str(v) for k, v in (exc.headers or {}).items()}
        try:
            body = exc.read() if request.get_method() != "HEAD" else b""
        except Exception:
            body = b""
        try:
            exc.close()
        except Exception:
            pass
        return int(exc.code), headers, body
    except (URLError, TimeoutError, OSError) as exc:
        raise ProbeError(str(exc)) from exc


def _request_for(method: str, url: str) -> Request:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.github+json",
        "Cache-Control": "no-cache",
    }
    return Request(url, headers=headers, method=method)


def probe_model_source(
    *,
    ref: str | None = None,
    timeout: float = 20.0,
    opener: Callable[..., Any] = urlopen,
) -> dict[str, Any]:
    """Probe a pinned repository commit and the three configured artifact paths."""
    selected_ref = (ref or os.environ.get("DENGUYOSOKU_MODEL_REF") or "main").strip()
    if not selected_ref:
        return {
            "status": "invalid",
            "repository": REPOSITORY,
            "ref": selected_ref,
            "commit_sha": None,
            "artifacts": [],
            "message": "Git ref must not be empty",
        }

    commit_url = f"https://api.github.com/repos/{REPOSITORY}/commits/{quote(selected_ref, safe='')}"
    try:
        status, _, body = _request(opener, _request_for("GET", commit_url), timeout)
    except ProbeError as exc:
        return {
            "status": "unavailable",
            "repository": REPOSITORY,
            "ref": selected_ref,
            "commit_sha": None,
            "artifacts": [],
            "message": f"GitHub commit API is unavailable: {exc}",
        }

    if status == 404:
        return {
            "status": "missing",
            "repository": REPOSITORY,
            "ref": selected_ref,
            "commit_sha": None,
            "artifacts": [],
            "message": "Repository or Git ref was not found",
            "http_status": status,
        }
    if status < 200 or status >= 300:
        return {
            "status": "unavailable",
            "repository": REPOSITORY,
            "ref": selected_ref,
            "commit_sha": None,
            "artifacts": [],
            "message": f"GitHub commit API returned HTTP {status}",
            "http_status": status,
        }

    try:
        commit_payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        commit_payload = None
    commit_sha = commit_payload.get("sha") if isinstance(commit_payload, dict) else None
    if not isinstance(commit_sha, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", commit_sha):
        return {
            "status": "invalid",
            "repository": REPOSITORY,
            "ref": selected_ref,
            "commit_sha": None,
            "artifacts": [],
            "message": "GitHub did not return a valid 40-character commit SHA",
            "http_status": status,
        }
    commit_sha = commit_sha.lower()

    artifact_results: list[dict[str, Any]] = []
    for source_path, local_name in ARTIFACTS:
        raw_url = (
            f"https://raw.githubusercontent.com/{REPOSITORY}/"
            f"{commit_sha}/{source_path}"
        )
        try:
            artifact_status, headers, _ = _request(
                opener, _request_for("HEAD", raw_url), timeout
            )
            if 200 <= artifact_status < 300:
                state = "available"
            elif artifact_status == 404:
                state = "missing"
            else:
                state = "unavailable"
            raw_length = headers.get("content-length")
            try:
                size_bytes = int(raw_length) if raw_length is not None else None
                if size_bytes is not None and size_bytes < 0:
                    size_bytes = None
            except ValueError:
                size_bytes = None
            artifact_results.append({
                "source_path": source_path,
                "local_name": local_name,
                "status": state,
                "http_status": artifact_status,
                "size_bytes": size_bytes,
            })
        except ProbeError as exc:
            artifact_results.append({
                "source_path": source_path,
                "local_name": local_name,
                "status": "unavailable",
                "http_status": None,
                "size_bytes": None,
                "message": str(exc),
            })

    states = {item["status"] for item in artifact_results}
    if states == {"available"}:
        overall = "available"
        message = "All configured artifacts are reachable at the pinned commit; contents were not downloaded"
    elif "unavailable" in states:
        overall = "unavailable"
        message = "At least one artifact path could not be checked; this is not proof that the path is missing"
    else:
        overall = "missing"
        message = "At least one configured artifact path is missing at the pinned commit"

    return {
        "status": overall,
        "repository": REPOSITORY,
        "ref": selected_ref,
        "commit_sha": commit_sha,
        "artifacts": artifact_results,
        "message": message,
        "downloaded_contents": False,
        "wrote_files": False,
    }


def render_report(report: dict[str, Any], *, as_json: bool = False) -> None:
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    print("DengueYosoku Model Source Preflight · READ ONLY")
    print(f"Repository : {report.get('repository')}")
    print(f"Ref        : {report.get('ref')}")
    print(f"Commit     : {report.get('commit_sha') or 'unavailable'}")
    print(f"Status     : {str(report.get('status', 'unavailable')).upper()}")
    for item in report.get("artifacts", []):
        size = f", {item['size_bytes']:,} bytes" if isinstance(item.get("size_bytes"), int) else ""
        http = f"HTTP {item['http_status']}" if item.get("http_status") is not None else "no HTTP status"
        print(f"  [{str(item['status']).upper():11}] {item['source_path']} ({http}{size})")
    print(f"Result     : {report.get('message', '')}")
    print("Safety     : no artifact contents downloaded; no project files written")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check the configured Model Repository and artifact paths without downloading files"
    )
    parser.add_argument("--ref", default=None, help="Git ref to inspect; defaults to DENGUYOSOKU_MODEL_REF or main")
    parser.add_argument("--timeout", type=float, default=20.0, help="Per-request timeout in seconds (default: 20)")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable JSON report")
    args = parser.parse_args(argv)
    if args.timeout <= 0 or args.timeout > 120:
        parser.error("--timeout must be greater than 0 and no more than 120 seconds")

    report = probe_model_source(ref=args.ref, timeout=args.timeout)
    render_report(report, as_json=args.json)
    if report["status"] == "available":
        return 0
    if report["status"] == "missing":
        return 2
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
