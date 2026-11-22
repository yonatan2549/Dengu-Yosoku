import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { evaluateHealthKnowledgeGovernance } = require("../.next/health-knowledge-governance-tests/lib/health-assistant/governance.js");
const { HEALTH_KNOWLEDGE } = require("../.next/health-knowledge-governance-tests/lib/health-assistant/knowledge.js");

function reviewedDocument(overrides = {}) {
  return {
    ...HEALTH_KNOWLEDGE[0], reviewStatus: "clinically_reviewed", reviewedAt: "2026-11-01",
    reviewedBy: "Reviewer A", reviewReference: "Clinical review record CR-001", ...overrides,
  };
}

test("reports every current knowledge document as awaiting clinical review", () => {
  const report = evaluateHealthKnowledgeGovernance();
  assert.equal(report.totalDocuments, HEALTH_KNOWLEDGE.length);
  assert.equal(report.awaitingClinicalReview, HEALTH_KNOWLEDGE.length);
  assert.equal(report.clinicallyReviewed, 0);
  assert.equal(report.productionAnswersAllowed, false);
});

test("accepts the current knowledge registry metadata for review preparation", () => {
  const report = evaluateHealthKnowledgeGovernance();
  assert.equal(report.status, "ready-for-review");
  assert.equal(report.metadataIssues, 0);
  assert.equal(report.duplicateIds, 0);
});

test("lists document title, publisher, date and source link", () => {
  const report = evaluateHealthKnowledgeGovernance();
  assert.equal(report.documents.length, HEALTH_KNOWLEDGE.length);
  assert.ok(report.documents.every((document) => document.title && document.publisher && document.publishedAt && document.sourceUrl.startsWith("https://")));
});

test("blocks an empty knowledge registry", () => {
  const report = evaluateHealthKnowledgeGovernance([]);
  assert.equal(report.status, "blocked");
  assert.equal(report.productionAnswersAllowed, false);
});

test("blocks duplicate document IDs", () => {
  const input = [HEALTH_KNOWLEDGE[0], { ...HEALTH_KNOWLEDGE[1], id: HEALTH_KNOWLEDGE[0].id }];
  const report = evaluateHealthKnowledgeGovernance(input);
  assert.equal(report.status, "blocked");
  assert.equal(report.duplicateIds, 1);
});

test("blocks non-HTTPS source URLs", () => {
  const report = evaluateHealthKnowledgeGovernance([{ ...HEALTH_KNOWLEDGE[0], sourceUrl: "http://example.test/source" }]);
  assert.equal(report.status, "blocked");
  assert.equal(report.metadataIssues, 1);
});

test("blocks malformed HTTPS source URLs", () => {
  const report = evaluateHealthKnowledgeGovernance([{ ...HEALTH_KNOWLEDGE[0], sourceUrl: "https://" }]);
  assert.equal(report.status, "blocked");
  assert.equal(report.metadataIssues, 1);
});

test("blocks documents with missing source publisher or summary metadata", () => {
  const report = evaluateHealthKnowledgeGovernance([{ ...HEALTH_KNOWLEDGE[0], publisher: "", summary: "" }]);
  assert.equal(report.status, "blocked");
  assert.equal(report.metadataIssues, 1);
});

test("does not count a reviewed document without review identity and evidence", () => {
  const report = evaluateHealthKnowledgeGovernance([reviewedDocument({ reviewedBy: "", reviewReference: "" })]);
  assert.equal(report.clinicallyReviewed, 0);
  assert.equal(report.awaitingClinicalReview, 1);
  assert.equal(report.productionAnswersAllowed, false);
});

test("counts review metadata only when reviewer, date and reference are complete", () => {
  const report = evaluateHealthKnowledgeGovernance([reviewedDocument()]);
  assert.equal(report.clinicallyReviewed, 1);
  assert.equal(report.awaitingClinicalReview, 0);
  assert.equal(report.productionAnswersAllowed, false);
});

test("does not treat a malformed review date as clinical approval evidence", () => {
  const report = evaluateHealthKnowledgeGovernance([reviewedDocument({ reviewedAt: "2026-99-99" })]);
  assert.equal(report.clinicallyReviewed, 0);
  assert.equal(report.productionAnswersAllowed, false);
});

test("keeps production answer generation blocked even when metadata is reviewed", () => {
  const report = evaluateHealthKnowledgeGovernance([reviewedDocument()]);
  assert.equal(report.checks.find((check) => check.id === "production-generation")?.status, "blocked");
  assert.equal(report.productionAnswersAllowed, false);
});

test("does not claim to have fetched full external documents or approved clinical content", () => {
  const report = evaluateHealthKnowledgeGovernance();
  assert.match(report.note, /ไม่ดึงเนื้อหาเต็มจาก URL/);
  assert.match(report.note, /ไม่อนุมัติเอกสารแทนผู้เชี่ยวชาญ/);
});
