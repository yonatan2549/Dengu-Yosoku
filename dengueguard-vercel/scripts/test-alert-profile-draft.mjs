import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateProfileDraftPayload } from "../.next/alert-profile-draft-tests/lib/alerting/profile-draft-contract.js";

const migrationSql = readFileSync(new URL("../database/migrations/005_alert_rule_draft_workflow.sql", import.meta.url), "utf8");

const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัดทดสอบ${String(index + 1).padStart(2, "0")}`);
const fullThresholds = () => provinces.map((provinceName) => ({
  provinceName,
  watch: 10,
  alert: 20,
}));
const base = (overrides = {}) => ({
  methodology: "เกณฑ์ร่างเพื่อรอการทบทวนโดยผู้เชี่ยวชาญด้านระบาดวิทยา",
  changeNote: "ปรับปรุงฉบับร่างตามเอกสารหารือ",
  submitForReview: false,
  thresholds: fullThresholds(),
  ...overrides,
});

test("accepts a complete 77-province Draft without changing it to Approved", () => {
  const result = validateProfileDraftPayload(base(), provinces);
  assert.equal(result.ok, true);
  assert.equal(result.value?.thresholds.length, 77);
  assert.equal(result.value?.submitForReview, false);
});

test("accepts a partial Draft so administrators can save work in progress", () => {
  const result = validateProfileDraftPayload(base({ thresholds: fullThresholds().slice(0, 12) }), provinces);
  assert.equal(result.ok, true);
  assert.equal(result.completeThresholdCount, 12);
});

test("accepts an empty-threshold methodology-only Draft", () => {
  const result = validateProfileDraftPayload(base({ thresholds: [] }), provinces);
  assert.equal(result.ok, true);
  assert.equal(result.completeThresholdCount, 0);
});

test("rejects a non-object payload", () => {
  assert.equal(validateProfileDraftPayload(null, provinces).ok, false);
});

test("rejects an incomplete canonical province list", () => {
  assert.equal(validateProfileDraftPayload(base(), provinces.slice(0, 76)).ok, false);
});

test("rejects duplicate canonical province names", () => {
  const duplicated = [...provinces.slice(0, 76), provinces[0]];
  assert.equal(validateProfileDraftPayload(base(), duplicated).ok, false);
});

test("rejects duplicate threshold provinces", () => {
  const rows = fullThresholds();
  rows[1].provinceName = rows[0].provinceName;
  const result = validateProfileDraftPayload(base({ thresholds: rows }), provinces);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("จังหวัดซ้ำ")));
});

test("rejects provinces not present in the current model snapshot", () => {
  const rows = fullThresholds();
  rows[0].provinceName = "จังหวัดที่ไม่มีในโมเดล";
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects negative Watch threshold", () => {
  const rows = fullThresholds();
  rows[0].watch = -1;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects Alert threshold equal to Watch threshold", () => {
  const rows = fullThresholds();
  rows[0].alert = rows[0].watch;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects Alert threshold below Watch threshold", () => {
  const rows = fullThresholds();
  rows[0].alert = 9;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects non-finite threshold values", () => {
  const rows = fullThresholds();
  rows[0].watch = Number.NaN;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects threshold values with more than three decimal places", () => {
  const rows = fullThresholds();
  rows[0].watch = 1.2345;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects more than 77 threshold rows", () => {
  const rows = fullThresholds();
  rows.push({ provinceName: "จังหวัดที่ 78", watch: 1, alert: 2 });
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("rejects a one-sided threshold row", () => {
  const rows = fullThresholds().slice(0, 1);
  rows[0].alert = Number.NaN;
  assert.equal(validateProfileDraftPayload(base({ thresholds: rows }), provinces).ok, false);
});

test("does not allow review submission with partial province coverage", () => {
  const result = validateProfileDraftPayload(base({ submitForReview: true, thresholds: fullThresholds().slice(0, 76) }), provinces);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("ครบ 77 จังหวัด")));
});

test("requires a meaningful note for expert review submission", () => {
  const result = validateProfileDraftPayload(base({ submitForReview: true, changeNote: "ส่งตรวจ", thresholds: fullThresholds() }), provinces);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("อย่างน้อย 10 ตัวอักษร")));
});

test("accepts a complete 77-province submission request for expert review", () => {
  const result = validateProfileDraftPayload(base({
    submitForReview: true,
    changeNote: "ส่งเกณฑ์ทั้ง 77 จังหวัดให้คณะผู้เชี่ยวชาญตรวจสอบ",
  }), provinces);
  assert.equal(result.ok, true);
  assert.equal(result.value?.submitForReview, true);
  assert.equal(result.value?.thresholds.length, 77);
});

test("rejects a short methodology", () => {
  assert.equal(validateProfileDraftPayload(base({ methodology: "สั้นไป" }), provinces).ok, false);
});

test("rejects malformed change notes", () => {
  assert.equal(validateProfileDraftPayload(base({ changeNote: "  " }), provinces).ok, false);
});


test("migration authorizes Draft edits only for database Administrator role", () => {
  assert.match(migrationSql, /v_role IS DISTINCT FROM 'administrator'/);
  assert.match(migrationSql, /auth\.uid\(\)/);
});

test("migration is pinned to the configured Draft identity", () => {
  assert.match(migrationSql, /dengueyosoku-national-alerts/);
  assert.match(migrationSql, /0\.1\.0-draft/);
});

test("migration does not include a profile approval operation", () => {
  assert.doesNotMatch(migrationSql, /SET\s+status\s*=\s*'approved'/i);
  assert.doesNotMatch(migrationSql, /approved_by\s*=/i);
  assert.doesNotMatch(migrationSql, /approved_at\s*=/i);
});

test("profile history tables are read-only to authenticated browser roles", () => {
  assert.match(migrationSql, /REVOKE ALL ON public\.alert_rule_profile_change_log FROM PUBLIC, anon, authenticated/i);
  assert.match(migrationSql, /REVOKE ALL ON public\.alert_rule_profile_review_requests FROM PUBLIC, anon, authenticated/i);
  assert.match(migrationSql, /BEFORE UPDATE OR DELETE ON public\.alert_rule_profile_change_log/i);
});

test("review submission requires all 77 thresholds and leaves the profile Draft", () => {
  assert.match(migrationSql, /v_count <> 77/);
  assert.match(migrationSql, /'profile_status', 'draft'/);
  assert.match(migrationSql, /'review_status'.*'pending'/);
});
