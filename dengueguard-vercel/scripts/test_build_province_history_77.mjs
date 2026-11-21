import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProvinceHistorySnapshot, parseCsvLine } from "./build_province_history_77.mjs";

test("CSV parser preserves quoted commas and escaped quotation marks", () => {
  assert.deepEqual(parseCsvLine('"จังหวัด,ตัวอย่าง","ข้อความ ""อ้างอิง"""'), [
    "จังหวัด,ตัวอย่าง",
    'ข้อความ "อ้างอิง"',
  ]);
});

test("historical snapshot preserves actual cases and flags incomplete weeks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dengue-history-"));
  const sourcePath = join(directory, "dengue_full.csv");
  try {
    await writeFile(sourcePath, [
      "province,week_start,cases,other",
      "จังหวัด ก,2024-01-07,4,foo",
      "จังหวัด ข,2024-01-07,6,bar",
      "จังหวัด ก,2024-01-14,2,baz",
      "",
    ].join("\n"), "utf8");
    const provinces = Array.from({ length: 77 }, (_, index) =>
      index < 2 ? ["จังหวัด ก", "จังหวัด ข"][index] : "จังหวัด " + index
    );
    const payload = await buildProvinceHistorySnapshot({
      sourcePath,
      provinces,
      generatedAtUtc: "2026-11-21T00:00:00.000Z",
    });
    assert.equal(payload.status, "ready");
    assert.equal(payload.row_count, 3);
    assert.deepEqual(payload.years, [2024]);
    assert.equal(payload.week_coverage[0].province_count, 2);
    assert.equal(payload.week_coverage[0].complete, false);
    assert.equal(payload.rows.find((row) => row.week_start === "2024-01-07" && row.province === "จังหวัด ข").actual_cases, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conflicting duplicate province-week rows are rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dengue-history-"));
  const sourcePath = join(directory, "dengue_full.csv");
  try {
    await writeFile(sourcePath, [
      "province,week_start,cases",
      "จังหวัด ก,2024-01-07,4",
      "จังหวัด ก,2024-01-07,9",
    ].join("\n"), "utf8");
    const provinces = Array.from({ length: 77 }, (_, index) => index === 0 ? "จังหวัด ก" : "จังหวัด " + index);
    await assert.rejects(
      buildProvinceHistorySnapshot({ sourcePath, provinces }),
      /Conflicting duplicate province-week row/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
