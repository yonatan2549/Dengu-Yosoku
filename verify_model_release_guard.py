#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inspect the on-disk converter source without running it or touching model files."""
from __future__ import annotations

import argparse
import ast
import hashlib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCRIPT = ROOT / "scripts" / "convert_model_outputs.py"


def _literal_strings(node: ast.AST) -> list[str]:
    return [item.value for item in ast.walk(node) if isinstance(item, ast.Constant) and isinstance(item.value, str)]


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            return node.func.id
        if isinstance(node.func, ast.Attribute):
            return node.func.attr
    return None


def inspect_converter_source(source: str) -> dict[str, bool]:
    tree = ast.parse(source)
    flags: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _call_name(node) == "add_argument":
            for arg in node.args:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    flags.add(arg.value)

    has_current_guard = False
    has_check_only_branch = False
    has_provenance_gate = False
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        test_text = ast.unparse(node.test).replace(" ", "").replace("(", "").replace(")", "")
        if test_text == "args.require_currentandnotforecast_is_current_or_future":
            strings = " ".join(_literal_strings(node))
            has_raise = any(isinstance(item, ast.Raise) for item in ast.walk(node))
            has_current_guard = has_raise and "--require-current prevents publication" in strings

        if test_text in {"args.check", "bool(args.check)"}:
            strings = " ".join(_literal_strings(node))
            body_calls = {_call_name(item) for item in ast.walk(ast.Module(body=node.body, type_ignores=[]))}
            else_calls = {_call_name(item) for item in ast.walk(ast.Module(body=node.orelse, type_ignores=[]))}
            has_check_only_branch = has_check_only_branch or (
                "no output files were written" in strings
                and "publish_file_bundle" not in body_calls
                and "publish_file_bundle" in else_calls
            )
        if test_text == "args.require_current":
            strings = " ".join(_literal_strings(node))
            body_calls = {_call_name(item) for item in ast.walk(ast.Module(body=node.body, type_ignores=[]))}
            has_provenance_gate = has_provenance_gate or (
                "validate_operational_release" in body_calls
                and "operational release acceptance failed" in strings
                and any(isinstance(item, ast.Raise) for item in ast.walk(ast.Module(body=node.body, type_ignores=[])))
            )

    return {
        "check_flag": "--check" in flags,
        "require_current_flag": "--require-current" in flags,
        "stale_forecast_block": has_current_guard,
        "check_mode_does_not_publish": has_check_only_branch,
        "strict_nowcast_provenance_gate": has_provenance_gate,
    }


def build_report(script_path: Path = DEFAULT_SCRIPT) -> dict[str, Any]:
    try:
        payload = script_path.read_bytes()
        source = payload.decode("utf-8-sig")
        checks = inspect_converter_source(source)
        parse_error = None
    except (OSError, UnicodeDecodeError, SyntaxError) as exc:
        payload = b""
        checks = {
            "check_flag": False,
            "require_current_flag": False,
            "stale_forecast_block": False,
            "check_mode_does_not_publish": False,
            "strict_nowcast_provenance_gate": False,
        }
        parse_error = str(exc)

    passed = all(checks.values()) and parse_error is None
    return {
        "status": "ready" if passed else "blocked",
        "script_path": str(script_path.resolve()),
        "sha256": hashlib.sha256(payload).hexdigest() if payload else None,
        "checks": checks,
        "parse_error": parse_error,
        "executed_converter": False,
        "model_files_read": False,
        "model_files_written": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect Model converter safeguards without executing conversion")
    parser.add_argument("--script", type=Path, default=DEFAULT_SCRIPT, help="Converter path to inspect")
    args = parser.parse_args(argv)
    report = build_report(args.script)
    print("DengueYosoku Model Release Guard · SOURCE INSPECTION ONLY")
    print(f"Script : {report['script_path']}")
    print(f"SHA256 : {report['sha256'] or 'unavailable'}")
    for name, value in report["checks"].items():
        label = name.replace("_", " ")
        print(f"  [{'PASS' if value else 'FAIL'}] {label}")
    if report["parse_error"]:
        print(f"ERROR: {report['parse_error']}")
    print(f"Status : {report['status'].upper()}")
    print("Safety : converter was not executed; public/data and source-data were not read or changed")
    return 0 if report["status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
