import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateExpertReviewDecision, isSundayEpiWeek } from "../.next/alert-review-tests/lib/alerting/review-decision-contract.js";

const reviewerId = "22222222-2222-4222-8222-222222222222";
const requesterId = "11111111-1111-4111-8111-111111111111";
const requestId = "33333333-3333-4333-8333-333333333333";
const baseActor = { actorId: reviewerId, actorRole: "reviewer", requestedBy: requesterId };
const base = {
  requestId,
  decision: "approved",
  reviewNote: "ตรวจสอบหลักฐานและระเบียบวิธีแล้ว เห็นชอบตามเอกสารที่อ้างอิง",
  evidenceReference: "มติคณะกรรมการ 01/2569",
  effectiveFromWeek: "2026-11-22",
};

test("accepts approval with distinct reviewer, evidence, and Sunday effective week", () => {
  const result = validateExpertReviewDecision(base, baseActor);
  assert.equal(result.ok, true);
  assert.equal(result.value?.decision, "approved");
});

test("rejects Administrator even if they are not the submitter", () => {
  const result = validateExpertReviewDecision(base, { ...baseActor, actorRole: "administrator" });
  assert.equal(result.ok, false);
});

test("rejects a reviewer who submitted the request", () => {
  const result = validateExpertReviewDecision(base, { ...baseActor, requestedBy: reviewerId });
  assert.equal(result.ok, false);
});

test("rejects malformed actor and request UUIDs", () => {
  const result = validateExpertReviewDecision({ ...base, requestId: "bad-id" }, { ...baseActor, actorId: "bad" });
  assert.equal(result.ok, false);
});

test("rejects an unknown decision", () => {
  assert.equal(validateExpertReviewDecision({ ...base, decision: "publish" }, baseActor).ok, false);
});

test("requires a meaningful review note", () => {
  assert.equal(validateExpertReviewDecision({ ...base, reviewNote: "ไม่ผ่าน" }, baseActor).ok, false);
});

test("requires approval evidence reference", () => {
  assert.equal(validateExpertReviewDecision({ ...base, evidenceReference: "" }, baseActor).ok, false);
});

test("requires Sunday epidemiological effective week", () => {
  assert.equal(isSundayEpiWeek("2026-11-23"), false);
  assert.equal(validateExpertReviewDecision({ ...base, effectiveFromWeek: "2026-11-23" }, baseActor).ok, false);
});

test("rejects impossible calendar dates", () => {
  assert.equal(isSundayEpiWeek("2026-02-30"), false);
});

test("accepts a changes-requested decision without approval metadata", () => {
  const result = validateExpertReviewDecision({
    requestId,
    decision: "changes_requested",
    reviewNote: "กรุณาแนบแหล่งอ้างอิงเพิ่มเติมสำหรับวิธีคำนวณเกณฑ์รายจังหวัด",
    evidenceReference: null,
    effectiveFromWeek: null,
  }, baseActor);
  assert.equal(result.ok, true);
  assert.equal(result.value?.evidenceReference, null);
});

test("accepts a rejection with a reason and no approval metadata", () => {
  const result = validateExpertReviewDecision({
    requestId,
    decision: "rejected",
    reviewNote: "หลักฐานที่แนบมายังไม่เพียงพอสำหรับรับรองเกณฑ์ดังกล่าว",
  }, baseActor);
  assert.equal(result.ok, true);
});

test("rejects approval metadata on non-approval decisions", () => {
  const result = validateExpertReviewDecision({
    requestId,
    decision: "rejected",
    reviewNote: "หลักฐานที่แนบมายังไม่เพียงพอสำหรับรับรองเกณฑ์ดังกล่าว",
    evidenceReference: "เลขที่เอกสาร 12345",
    effectiveFromWeek: null,
  }, baseActor);
  assert.equal(result.ok, false);
});

test("does not accept extra unknown decision string as typed value", () => {
  const result = validateExpertReviewDecision({ ...base, decision: "pending" }, baseActor);
  assert.equal(result.value, null);
});

test("migration requires a distinct reviewer role and rejects self-review", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /v_role IS DISTINCT FROM 'reviewer'/);
  assert.match(sql, /v_request\.requested_by = v_actor/);
});

test("migration prevents duplicate decisions for one request", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /review_request_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /This review request already has a decision/);
});

test("approval requires 77 thresholds and exact submitted snapshot", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /v_threshold_count <> 77 OR v_request\.threshold_count <> 77/);
  assert.match(sql, /v_snapshot IS DISTINCT FROM v_request\.profile_snapshot/);
});

test("approval requires evidence and a Sunday epidemiological week", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /Approval requires a meaningful evidence or approval reference/);
  assert.match(sql, /EXTRACT\(DOW FROM p_effective_from_week\) <> 0/);
});

test("approved profile is set only in approved branch", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /SET status = 'approved'/);
  assert.match(sql, /approval_reference = v_evidence/);
  assert.match(sql, /approved_by = v_actor/);
});

test("changes requested and rejected do not approve the profile", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'draft' END/);
  assert.match(sql, /ELSE\s+IF v_evidence IS NOT NULL OR p_effective_from_week IS NOT NULL THEN/s);
});

test("previously decided requests can be followed by a new submission", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /NOT EXISTS \([\s\S]*?alert_rule_profile_review_decisions/);
  assert.match(sql, /DROP INDEX IF EXISTS public\.alert_rule_profile_one_pending_review_idx/);
});

test("decision history is append-only and browser roles have read-only access", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /REVOKE ALL ON public\.alert_rule_profile_review_decisions FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT ON public\.alert_rule_profile_review_decisions TO authenticated/);
});

test("external notifications remain disabled", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /external notifications remain disabled/i);
  assert.doesNotMatch(sql, /external_notifications_enabled\s*=\s*true/i);
});

test("Draft save RPC freezes a request snapshot until a decision exists", () => {
  const sql = readFileSync(new URL("../database/migrations/006_alert_expert_review_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /An expert review request is pending; the submitted Draft snapshot is locked/);
});

test("evaluation endpoint resolves thresholds and profile status from PostgreSQL", () => {
  const source = readFileSync(new URL("../app/api/alerts/evaluations/route.ts", import.meta.url), "utf8");
  assert.match(source, /readStoredAlertRuleProfile\(access\.context\)/);
  assert.match(source, /evaluateAlertDryRun\(snapshot, activeProfile, currentEpiWeek\)/);
  assert.doesNotMatch(source, /evaluateAlertDryRun\(snapshot, ALERT_RULE_PROFILE,/);
});

test("readiness compares the database-backed status rather than a hard-coded Draft status", () => {
  const source = readFileSync(new URL("../app/api/alerts/readiness/route.ts", import.meta.url), "utf8");
  assert.match(source, /applicationProfileStatus: dbProfile\?\.status \?\? ALERT_RULE_PROFILE\.status/);
});

test("runtime profile API is read-only and server-authorized", () => {
  const source = readFileSync(new URL("../app/api/alerts/runtime-profile/route.ts", import.meta.url), "utf8");
  assert.match(source, /authorizeAlertReviewer\(request\)/);
  assert.match(source, /readStoredAlertRuleProfile\(access\.context\)/);
  assert.doesNotMatch(source, /method:\s*"POST"/);
});

test("review POST endpoint restricts decisions to Reviewer role", () => {
  const source = readFileSync(new URL("../app/api/alerts/reviews/route.ts", import.meta.url), "utf8");
  assert.match(source, /access\.context\.role !== "reviewer"/);
  assert.match(source, /requested_by/);
  assert.match(source, /dengueyosoku_review_alert_rule_request/);
});

test("admin Draft API distinguishes missing Migration 006 decision history", () => {
  const source = readFileSync(new URL("../app/api/alerts/admin/profile/route.ts", import.meta.url), "utf8");
  assert.match(source, /ยังไม่พบตารางประวัติผลทบทวนของ Migration 006/);
  assert.match(source, /const missing006 = !decisionResult\.ok/);
});

test("review API validates request UUID before querying Supabase", () => {
  const source = readFileSync(new URL("../app/api/alerts/reviews/route.ts", import.meta.url), "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  assert.match(post, /Request ID ไม่ใช่ UUID ที่ถูกต้อง/);
  assert.ok(post.indexOf("Request ID ไม่ใช่ UUID ที่ถูกต้อง") < post.indexOf("const requestUrl = new URL"));
});
