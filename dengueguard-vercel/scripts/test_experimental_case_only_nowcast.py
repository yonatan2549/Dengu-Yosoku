#!/usr/bin/env python3
"""Tests for the experimental case-only nowcast's dynamic weekly input contract."""
from __future__ import annotations

import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.experimental_case_only_nowcast import (
    load_and_combine,
    mmwr_week_start,
    mmwr_year_week,
)

PROVINCES = [f"Province {index:02d}" for index in range(1, 78)]


def write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


class ExperimentalCaseOnlyInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.historical = self.root / "historical.csv"
        self.incoming = self.root / "incoming.csv"

        historical_rows = []
        for week_number in (42, 43):
            week_start = mmwr_week_start(2026, week_number)
            for index, province in enumerate(PROVINCES):
                historical_rows.append({
                    "province": province,
                    "week_start": week_start.date().isoformat(),
                    "week": week_number,
                    "cases": 10 + index + week_number,
                })
        write_csv(
            self.historical,
            ["province", "week_start", "week", "cases"],
            historical_rows,
        )
        self.write_incoming((44, 45, 46))

    def tearDown(self):
        self.temp.cleanup()

    def write_incoming(self, weeks):
        rows = []
        for week_number in weeks:
            for index, province in enumerate(PROVINCES):
                rows.append({
                    "province": province,
                    "year": 2026,
                    "week": week_number,
                    "cases": 30 + index + week_number,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], rows)

    def test_accepts_multiple_consecutive_current_weeks(self):
        frame = load_and_combine(self.historical, self.incoming)
        self.assertEqual(len(frame), 5 * 77)
        self.assertEqual(frame["province"].nunique(), 77)
        self.assertEqual(
            sorted(frame["week_start"].dt.strftime("%Y-%m-%d").unique().tolist()),
            ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15"],
        )
        self.assertEqual(frame.groupby("week_start")["province"].nunique().min(), 77)

    def test_rejects_a_gap_in_incoming_epi_weeks(self):
        self.write_incoming((44, 46))
        with self.assertRaises(ValueError):
            load_and_combine(self.historical, self.incoming)

    def test_rejects_incomplete_province_week_coverage(self):
        rows = []
        for week_number in (44, 45):
            for province in PROVINCES[:-1]:
                rows.append({
                    "province": province, "year": 2026, "week": week_number,
                    "cases": 40,
                })
        write_csv(self.incoming, ["province", "year", "week", "cases"], rows)
        with self.assertRaises(ValueError):
            load_and_combine(self.historical, self.incoming)

    def test_mmwr_year_boundary_resolves_to_the_next_epi_year(self):
        start = mmwr_week_start(2027, 1)
        self.assertEqual(start.date(), date(2027, 1, 3))
        self.assertEqual(mmwr_year_week(start), (2027, 1))
        with self.assertRaises(ValueError):
            mmwr_week_start(2026, 53)


if __name__ == "__main__":
    unittest.main()
