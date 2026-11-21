import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAlertDryRun } from "../lib/alerting/engine";
import { ALERT_RULE_PROFILE } from "../lib/alerting/profile";
import {
  ALERT_AUDIT_MAX_RECORDS,
  appendAlertAuditRecord,
  createAlertAuditRecord,
  readAlertAuditRecords,
  writeAlertAuditRecords,
  type AlertAuditStorage,
} from "../lib/alerting/audit";
import type { AlertModelSnapshot, AlertRuleProfile } from "../lib/alerting/types";

const provinceNames = Array.from({ length: 77 }, (_, index) => `จังหวัดทดสอบ${index + 1}`);

function createModel(): AlertModelSnapshot {
  return {
    model_revision: "a".repeat(40),
    generated_at_utc: "2026-10-26T02:00:00.000Z",
    source_retrieved_at_utc: "2026-10-26T01:30:00.000Z",
    source_repository: "https://github.com/johnlovepizza/DenguYosoku",
    province_count: 77,
    provinces: [...provinceNames],
    forecast: provinceNames.map((province, index) => ({
      province,
      week_start: "2026-10-25",
      prediction: index === 0 ? 12 : index === 1 ? 3 : 0.5,
    })),
    coverage: {
      forecast_rows: 77,
      forecast_week: "2026-10-25",
      history_end_week: "2026-10-18",
    },
  };
}

function createApprovedProfile(): AlertRuleProfile {
  return {
    ...ALERT_RULE_PROFILE,
    status: "approved",
    approvalReference: "TEST-APPROVAL-001",
    effectiveFromWeek: "2026-10-25",
    thresholdsByProvince: Object.fromEntries(
      provinceNames.map((province) => [province, { watch: 2, alert: 10 }]),
    ),
  };
}

test("blocks evaluation when the model snapshot is missing", () => {
  const result = evaluateAlertDryRun(null, ALERT_RULE_PROFILE, "2026-11-15");
  assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0);
  assert.equal(result.externalNotificationsEnabled, false);
});

test("does not invent candidates while the default nationwide profile is a draft", () => {
  const result = evaluateAlertDryRun(createModel(), ALERT_RULE_PROFILE, "2026-11-15");
  assert.equal(result.status, "blocked");
  assert.equal(result.ruleProfileStatus, "draft");
  assert.equal(result.evaluatedProvinceCount, 0);
  assert.equal(result.candidateEvents.length, 0);
  assert.ok(result.blockedReasons.some((reason) => reason.includes("Rule Profile")));
  assert.equal(result.freshness, "stale");
  assert.equal(result.forecastLagWeeks, 3);
  assert.equal(result.externalNotificationsEnabled, false);
});

test("blocks stale snapshots even when the profile is approved and all 77 thresholds are valid", () => {
  const result = evaluateAlertDryRun(createModel(), createApprovedProfile(), "2026-11-15");
  assert.equal(result.status, "blocked");
  assert.equal(result.freshness, "stale");
  assert.equal(result.forecastLagWeeks, 3);
  assert.equal(result.evaluatedProvinceCount, 0);
  assert.equal(result.candidateEvents.length, 0);
  assert.equal(result.checks.find((check) => check.id === "forecast-freshness")?.status, "blocked");
  assert.ok(result.blockedReasons.some((reason) => reason.includes("ไม่สร้าง Candidate")));
  assert.equal(result.externalNotificationsEnabled, false);
});

test("blocks unknown snapshot freshness even when the profile is approved and thresholds are valid", () => {
  const result = evaluateAlertDryRun(createModel(), createApprovedProfile(), "not-a-week");
  assert.equal(result.status, "blocked");
  assert.equal(result.freshness, "unknown");
  assert.equal(result.evaluatedProvinceCount, 0);
  assert.equal(result.candidateEvents.length, 0);
  assert.equal(result.checks.find((check) => check.id === "forecast-freshness")?.status, "blocked");
  assert.ok(result.blockedReasons.some((reason) => reason.includes("ไม่สามารถยืนยันความใหม่")));
  assert.equal(result.externalNotificationsEnabled, false);
});

test("creates simulated WATCH and ALERT candidates only for an approved complete profile", () => {
  const result = evaluateAlertDryRun(createModel(), createApprovedProfile(), "2026-10-25");
  assert.equal(result.status, "evaluated");
  assert.equal(result.evaluatedProvinceCount, 77);
  assert.equal(result.watchCandidateCount, 1);
  assert.equal(result.alertCandidateCount, 1);
  assert.equal(result.candidateEvents.length, 2);
  assert.ok(result.candidateEvents.every((event) => event.delivery === "not_sent_dry_run_only"));
  assert.equal(result.externalNotificationsEnabled, false);
});

test("blocks invalid province thresholds where alert is not above watch", () => {
  const profile = createApprovedProfile();
  profile.thresholdsByProvince[provinceNames[0]] = { watch: 5, alert: 4 };
  const result = evaluateAlertDryRun(createModel(), profile, "2026-10-25");
  assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0);
  assert.ok(result.blockedReasons.some((reason) => reason.includes("เกณฑ์ที่ไม่ถูกต้อง")));
});

test("blocks incomplete forecast coverage", () => {
  const model = createModel();
  model.forecast.pop();
  const result = evaluateAlertDryRun(model, createApprovedProfile(), "2026-10-25");
  assert.equal(result.status, "blocked");
  assert.equal(result.forecastProvinceCount, 76);
  assert.equal(result.candidateEvents.length, 0);
});

test("refuses any rule profile that attempts to enable external notifications", () => {
  const profile = createApprovedProfile();
  profile.externalNotificationsEnabled = true;
  const result = evaluateAlertDryRun(createModel(), profile, "2026-10-25");
  assert.equal(result.status, "blocked");
  assert.equal(result.candidateEvents.length, 0);
  assert.equal(result.externalNotificationsEnabled, false);
  assert.ok(result.blockedReasons.some((reason) => reason.includes("Profile")));
});


function createAuditRecord(evaluatedAt = new Date("2026-11-17T03:00:00.000Z")) {
  const model = createModel();
  const result = evaluateAlertDryRun(model, ALERT_RULE_PROFILE, "2026-11-15");
  return createAlertAuditRecord(model, ALERT_RULE_PROFILE, result, evaluatedAt);
}

class MemoryAuditStorage implements AlertAuditStorage {
  value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

test("audit record captures model provenance, profile rules, and dry-run outcome", () => {
  const record = createAuditRecord();
  assert.equal(record.modelRevision, "a".repeat(40));
  assert.equal(record.modelGeneratedAtUtc, "2026-10-26T02:00:00.000Z");
  assert.equal(record.sourceRetrievedAtUtc, "2026-10-26T01:30:00.000Z");
  assert.equal(record.historyEndWeek, "2026-10-18");
  assert.equal(record.ruleProfileStatus, "draft");
  assert.equal(record.thresholdsByProvince && Object.keys(record.thresholdsByProvince).length, 77);
  assert.equal(record.ruleProfileStatus, "draft");
  assert.equal(record.status, "blocked");
  assert.equal(record.externalNotificationsEnabled, false);
});

test("audit history de-duplicates the same snapshot and rule evaluation", () => {
  const first = createAuditRecord(new Date("2026-11-17T03:00:00.000Z"));
  const repeated = createAuditRecord(new Date("2026-11-17T04:00:00.000Z"));
  assert.equal(first.runFingerprint, repeated.runFingerprint);

  const withFirst = appendAlertAuditRecord([], first);
  const withRepeat = appendAlertAuditRecord(withFirst, repeated);
  assert.equal(withRepeat, withFirst);
  assert.equal(withRepeat.length, 1);
});

test("audit history retains no more than the configured record limit", () => {
  const base = createAuditRecord();
  const existing = Array.from({ length: ALERT_AUDIT_MAX_RECORDS }, (_, index) => ({
    ...base,
    id: `record-${index}`,
    runFingerprint: `fingerprint-${index}`,
  }));
  const next = appendAlertAuditRecord(existing, {
    ...base,
    id: "new-record",
    runFingerprint: "new-fingerprint",
  });
  assert.equal(next.length, ALERT_AUDIT_MAX_RECORDS);
  assert.equal(next[0].id, "new-record");
});

test("audit storage safely ignores malformed local JSON", () => {
  const storage = new MemoryAuditStorage();
  storage.value = "{not valid json";
  assert.deepEqual(readAlertAuditRecords(storage), []);
});

test("audit storage reports quota or permission failures", () => {
  const storage: AlertAuditStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("storage unavailable"); },
  };
  assert.equal(writeAlertAuditRecords(storage, [createAuditRecord()]), false);
});


import {
  reconcileAlertLifecycle,
  transitionAlertLifecycleEvent,
  ALERT_LIFECYCLE_MAX_EVENTS,
  readAlertLifecycleEvents,
  writeAlertLifecycleEvents,
  type AlertLifecycleStorage,
} from "../lib/alerting/lifecycle";

function approvedCandidates(model = createModel(), profile = createApprovedProfile()) {
  return evaluateAlertDryRun(model, profile, "2026-10-25").candidateEvents;
}

test("event identity remains stable when severity or rule version changes", () => {
  const firstProfile = createApprovedProfile();
  const firstModel = createModel();
  firstModel.forecast[0].prediction = 5;
  const firstCandidates = approvedCandidates(firstModel, firstProfile);
  const watch = firstCandidates.find((event) => event.province === provinceNames[0]);
  assert.ok(watch);
  assert.equal(watch.level, "WATCH");

  const changedModel = createModel();
  changedModel.forecast[0].prediction = 12;
  const changedProfile = createApprovedProfile();
  changedProfile.version = "0.2.0-test";
  const changedCandidates = approvedCandidates(changedModel, changedProfile);
  const alert = changedCandidates.find((event) => event.province === provinceNames[0]);
  assert.ok(alert);
  assert.equal(alert.level, "ALERT");
  assert.equal(alert.eventId, watch.eventId);
});

test("lifecycle creates one stable event and records a severity escalation", () => {
  const model = createModel();
  model.forecast[0].prediction = 5;
  const profile = createApprovedProfile();
  const candidates = approvedCandidates(model, profile);
  const created = reconcileAlertLifecycle(
    [],
    candidates,
    model.model_revision,
    new Date("2026-11-17T03:00:00.000Z"),
  );
  assert.equal(created.length, 2);
  assert.ok(created.every((event) => event.status === "new"));
  assert.ok(created.every((event) => event.transitions.length === 1));

  const changedModel = createModel();
  changedModel.forecast[0].prediction = 12;
  const changedProfile = createApprovedProfile();
  changedProfile.version = "0.2.0-test";
  const changed = reconcileAlertLifecycle(
    created,
    approvedCandidates(changedModel, changedProfile),
    changedModel.model_revision,
    new Date("2026-11-17T04:00:00.000Z"),
  );
  const escalated = changed.find((event) => event.province === provinceNames[0]);
  assert.ok(escalated);
  assert.equal(escalated.status, "new");
  assert.equal(escalated.level, "ALERT");
  assert.ok(escalated.transitions.some((item) => item.kind === "level_changed"));
});

test("reviewer must acknowledge and provide a reason before resolving an event", () => {
  const candidates = approvedCandidates();
  const created = reconcileAlertLifecycle([], candidates, "a".repeat(40), new Date("2026-11-17T03:00:00.000Z"));
  const targetId = created[0].eventId;
  const acknowledged = transitionAlertLifecycleEvent(
    created,
    targetId,
    "acknowledge",
    "ผู้ทบทวนรับทราบ",
    new Date("2026-11-17T03:10:00.000Z"),
  );
  assert.equal(acknowledged.find((event) => event.eventId === targetId)?.status, "acknowledged");

  const prematureResolve = transitionAlertLifecycleEvent(
    created,
    targetId,
    "resolve",
    "มีเหตุผลครบแต่ยังไม่รับทราบ",
    new Date("2026-11-17T03:05:00.000Z"),
  );
  assert.equal(prematureResolve, created);

  const withoutReason = transitionAlertLifecycleEvent(
    acknowledged,
    targetId,
    "resolve",
    " ",
    new Date("2026-11-17T03:20:00.000Z"),
  );
  assert.equal(withoutReason, acknowledged);

  const resolved = transitionAlertLifecycleEvent(
    acknowledged,
    targetId,
    "resolve",
    "ตรวจสอบแล้วและปิดรอบทดสอบ",
    new Date("2026-11-17T03:30:00.000Z"),
  );
  assert.equal(resolved.find((event) => event.eventId === targetId)?.status, "resolved");
});

test("an unchanged replay keeps a resolved event closed; a changed snapshot reopens it", () => {
  const model = createModel();
  const candidates = approvedCandidates(model);
  const created = reconcileAlertLifecycle([], candidates, model.model_revision, new Date("2026-11-17T03:00:00.000Z"));
  const targetId = created[0].eventId;
  const acknowledged = transitionAlertLifecycleEvent(
    created,
    targetId,
    "acknowledge",
    "ผู้ทบทวนรับทราบ",
    new Date("2026-11-17T03:05:00.000Z"),
  );
  const resolved = transitionAlertLifecycleEvent(
    acknowledged,
    targetId,
    "resolve",
    "สิ้นสุดการตรวจสอบจำลอง",
    new Date("2026-11-17T03:10:00.000Z"),
  );
  const unchangedReplay = reconcileAlertLifecycle(
    resolved,
    candidates,
    model.model_revision,
    new Date("2026-11-17T03:20:00.000Z"),
  );
  assert.equal(unchangedReplay.find((item) => item.eventId === targetId)?.status, "resolved");

  const updatedModel = createModel();
  updatedModel.forecast[0].prediction = 13;
  const reopened = reconcileAlertLifecycle(
    unchangedReplay,
    approvedCandidates(updatedModel),
    "b".repeat(40),
    new Date("2026-11-17T03:30:00.000Z"),
  );
  const event = reopened.find((item) => item.eventId === targetId);
  assert.ok(event);
  assert.equal(event.status, "reopened");
  assert.ok(event.transitions.some((item) => item.kind === "resolved"));
  assert.ok(event.transitions.some((item) => item.kind === "reopened"));
});

test("missing candidates do not automatically resolve an existing event", () => {
  const created = reconcileAlertLifecycle([], approvedCandidates(), "a".repeat(40));
  const next = reconcileAlertLifecycle(created, [], "a".repeat(40));
  assert.equal(next.length, created.length);
  assert.ok(next.every((event) => event.status === "new"));
});

class MemoryLifecycleStorage implements AlertLifecycleStorage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

test("lifecycle storage round-trips valid events and enforces retention", () => {
  const created = reconcileAlertLifecycle([], approvedCandidates(), "a".repeat(40));
  const storage = new MemoryLifecycleStorage();
  assert.equal(writeAlertLifecycleEvents(storage, created), true);
  assert.equal(readAlertLifecycleEvents(storage).length, created.length);

  const many = Array.from({ length: ALERT_LIFECYCLE_MAX_EVENTS + 5 }, (_, index) => ({
    ...created[0],
    eventId: "event-" + index,
  }));
  assert.equal(writeAlertLifecycleEvents(storage, many), true);
  assert.equal(readAlertLifecycleEvents(storage).length, ALERT_LIFECYCLE_MAX_EVENTS);
});

test("lifecycle storage safely handles malformed data and write failures", () => {
  const storage = new MemoryLifecycleStorage();
  storage.value = "{bad json";
  assert.deepEqual(readAlertLifecycleEvents(storage), []);
  const failing: AlertLifecycleStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("storage unavailable"); },
  };
  assert.equal(writeAlertLifecycleEvents(failing, []), false);
});
