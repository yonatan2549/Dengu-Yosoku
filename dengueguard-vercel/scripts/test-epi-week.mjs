import assert from "node:assert/strict";
import testRunner from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getEpiWeek, formatEpiWeekLabel } = require("../.next/dashboard-view-tests/lib/epi-week.js");

testRunner("week 46 begins on 15 November 2026", () => {
  assert.deepEqual(getEpiWeek("2026-11-15"), { year: 2026, week: 46 });
  assert.equal(formatEpiWeekLabel("2026-11-15"), "สัปดาห์ที่ 46/2569");
});

testRunner("week 45 begins on 8 November 2026", () => {
  assert.deepEqual(getEpiWeek("2026-11-08"), { year: 2026, week: 45 });
});

testRunner("the first Sunday in January starts epidemiological week 1", () => {
  assert.deepEqual(getEpiWeek("2027-01-03"), { year: 2027, week: 1 });
});

testRunner("invalid calendar dates, non-Sundays and blank strings are rejected", () => {
  assert.equal(getEpiWeek("2026-02-29"), null);
  assert.equal(getEpiWeek("2026-11-16"), null);
  assert.equal(getEpiWeek(""), null);
});
