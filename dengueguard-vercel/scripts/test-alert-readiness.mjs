import test from "node:test";
import assert from "node:assert/strict";
import { assessAlertReadiness } from "../.next/alert-readiness-tests/lib/alerting/readiness-contract.js";

const provinces = Array.from({ length: 77 }, (_, index) => `จังหวัด${String(index + 1).padStart(2, "0")}`);
const thresholds = (names = provinces) => names.map((provinceName, index) => ({ provinceName, watch: 10 + index, alert: 20 + index }));
const profile = { profileId: "national-alerts", version: "1.0.0", status: "approved", externalNotificationsEnabled: false };
const base = {
  migration004Available: true,
  profile,
  thresholds: thresholds(),
  expectedProvinces: provinces,
  applicationProfileId: "national-alerts",
  applicationProfileVersion: "1.0.0",
  applicationProfileStatus: "approved",
};

test("reports ready only for an approved profile and exact valid 77-province thresholds", () => {
  const result = assessAlertReadiness(base);
  assert.equal(result.canCreateCandidates, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.thresholdCount, 77);
});

test("blocks when Migration 004 RPC is missing", () => {
  const result = assessAlertReadiness({ ...base, migration004Available: false });
  assert.equal(result.canCreateCandidates, false);
  assert.match(result.blockers.join(" "), /Migration 004/);
});

test("blocks when the rule profile is missing", () => {
  const result = assessAlertReadiness({ ...base, profile: null });
  assert.equal(result.profileFound, false);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks Draft profiles", () => {
  const result = assessAlertReadiness({ ...base, profile: { ...profile, status: "draft" } });
  assert.equal(result.profileStatus, "draft");
  assert.equal(result.canCreateCandidates, false);
});

test("blocks when profile identity or status differs from application configuration", () => {
  const result = assessAlertReadiness({ ...base, applicationProfileVersion: "2.0.0" });
  assert.equal(result.profileMatchesApplication, false);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks incomplete threshold coverage", () => {
  const result = assessAlertReadiness({ ...base, thresholds: thresholds().slice(0, 76) });
  assert.equal(result.thresholdCount, 76);
  assert.equal(result.missingProvinces.length, 1);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks unexpected threshold provinces", () => {
  const invalid = thresholds().slice(0, 76).concat({ provinceName: "จังหวัดนอกโมเดล", watch: 10, alert: 20 });
  const result = assessAlertReadiness({ ...base, thresholds: invalid });
  assert.equal(result.unexpectedProvinces.length, 1);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks duplicate threshold province rows", () => {
  const duplicate = thresholds().concat(thresholds([provinces[0]]));
  const result = assessAlertReadiness({ ...base, thresholds: duplicate });
  assert.deepEqual(result.duplicateThresholdProvinces, [provinces[0]]);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks negative, non-finite or inverted thresholds", () => {
  const invalid = thresholds();
  invalid[0] = { provinceName: provinces[0], watch: -1, alert: 5 };
  invalid[1] = { provinceName: provinces[1], watch: 5, alert: 5 };
  invalid[2] = { provinceName: provinces[2], watch: 5, alert: Number.NaN };
  const result = assessAlertReadiness({ ...base, thresholds: invalid });
  assert.equal(result.invalidThresholdProvinces.length, 3);
  assert.equal(result.canCreateCandidates, false);
});

test("blocks incomplete or duplicate model province inputs", () => {
  const result = assessAlertReadiness({ ...base, expectedProvinces: provinces.slice(1) });
  assert.equal(result.canCreateCandidates, false);
  assert.match(result.blockers.join(" "), /โมเดลไม่ครบ 77/);
});

test("blocks a database role mismatch detected by the RPC probe", () => {
  const result = assessAlertReadiness({ ...base, databaseRoleMismatch: true });
  assert.equal(result.databaseRoleMismatch, true);
  assert.equal(result.canCreateCandidates, false);
  assert.match(result.blockers.join(" "), /Role ใน user_profiles/);
});

test("blocks duplicate province names in the model snapshot", () => {
  const duplicateProvinces = [...provinces.slice(0, 76), provinces[0]];
  const result = assessAlertReadiness({ ...base, expectedProvinces: duplicateProvinces });
  assert.equal(result.canCreateCandidates, false);
  assert.match(result.blockers.join(" "), /โมเดลไม่ครบ 77/);
});

test("never reports external notifications as enabled", () => {
  const result = assessAlertReadiness({ ...base, profile: { ...profile, externalNotificationsEnabled: true } });
  assert.equal(result.externalNotificationsEnabled, false);
  assert.equal(result.canCreateCandidates, false);
  assert.match(result.blockers.join(" "), /External Notifications/);
});

test("blocks when profile is approved in DB but app still identifies it as draft", () => {
  const result = assessAlertReadiness({ ...base, applicationProfileStatus: "draft" });
  assert.equal(result.profileMatchesApplication, false);
  assert.equal(result.canCreateCandidates, false);
});
