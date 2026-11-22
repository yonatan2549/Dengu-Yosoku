from __future__ import annotations

import unittest

from scripts.verify_model_release_guard import inspect_converter_source

VALID_SOURCE = '''
import argparse
from scripts.model_artifact_transaction import publish_file_bundle
from scripts.model_release_contract import validate_operational_release

parser = argparse.ArgumentParser()
parser.add_argument("--check", action="store_true")
parser.add_argument("--require-current", action="store_true")
args = parser.parse_args()

if args.require_current and not forecast_is_current_or_future:
    raise DataValidationError("--require-current prevents publication")

if args.require_current:
    provenance_issues = validate_operational_release(metrics, forecast_week=forecast_week, current_week=current_week)
    if provenance_issues:
        raise DataValidationError("operational release acceptance failed; --require-current prevents publication")

if args.check:
    print("no output files were written")
else:
    publish_file_bundle({})
'''


class ModelReleaseGuardInspectionTests(unittest.TestCase):
    def test_accepts_converter_with_both_flags_and_safe_branches(self):
        report = inspect_converter_source(VALID_SOURCE)
        self.assertEqual(report, {
            "check_flag": True,
            "require_current_flag": True,
            "stale_forecast_block": True,
            "check_mode_does_not_publish": True,
            "strict_nowcast_provenance_gate": True,
        })

    def test_detects_missing_check_flag(self):
        report = inspect_converter_source(VALID_SOURCE.replace('parser.add_argument("--check", action="store_true")\n', ""))
        self.assertFalse(report["check_flag"])

    def test_detects_missing_strict_current_flag(self):
        report = inspect_converter_source(VALID_SOURCE.replace('parser.add_argument("--require-current", action="store_true")\n', ""))
        self.assertFalse(report["require_current_flag"])

    def test_detects_current_flag_without_a_blocking_raise(self):
        source = VALID_SOURCE.replace(
            'raise DataValidationError("--require-current prevents publication")',
            'print("forecast is old")',
        )
        self.assertFalse(inspect_converter_source(source)["stale_forecast_block"])

    def test_detects_check_branch_that_writes_files(self):
        source = VALID_SOURCE.replace(
            'print("no output files were written")',
            'publish_file_bundle({})',
        )
        self.assertFalse(inspect_converter_source(source)["check_mode_does_not_publish"])

    def test_detects_check_branch_without_a_publication_else_branch(self):
        source = VALID_SOURCE.replace('else:\n    publish_file_bundle({})\n', '')
        self.assertFalse(inspect_converter_source(source)["check_mode_does_not_publish"])


    def test_detects_missing_strict_provenance_gate(self):
        source = VALID_SOURCE.replace(
            '    provenance_issues = validate_operational_release(metrics, forecast_week=forecast_week, current_week=current_week)\n',
            '',
        )
        self.assertFalse(inspect_converter_source(source)["strict_nowcast_provenance_gate"])

    def test_detects_provenance_gate_outside_require_current_branch(self):
        source = VALID_SOURCE.replace(
            'if args.require_current:\n    provenance_issues = validate_operational_release(metrics, forecast_week=forecast_week, current_week=current_week)\n    if provenance_issues:\n        raise DataValidationError("operational release acceptance failed; --require-current prevents publication")\n',
            'provenance_issues = validate_operational_release(metrics, forecast_week=forecast_week, current_week=current_week)\n',
        )
        self.assertFalse(inspect_converter_source(source)["strict_nowcast_provenance_gate"])

    def test_invalid_python_source_raises_syntax_error(self):
        with self.assertRaises(SyntaxError):
            inspect_converter_source("if :\n    pass\n")


if __name__ == "__main__":
    unittest.main()
