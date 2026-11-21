import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDraftSourcePolicy } from "../.next/health-assistant-source-policy-tests/lib/health-assistant/source-policy.js";

const source = (overrides = {}) => ({
  id: "cdc-dengue-care",
  title: "Clinical Care of Dengue",
  publisher: "CDC",
  publishedAt: "2026-04-15",
  sourceUrl: "https://www.cdc.gov/dengue/hcp/clinical-care/",
  reviewStatus: "awaiting_clinical_review",
  projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
  ...overrides,
});
const passage = (overrides = {}) => ({
  documentId: "cdc-dengue-care",
  title: "Clinical Care of Dengue",
  reviewStatus: "awaiting_clinical_review",
  sectionLabel: "สรุปในทะเบียนความรู้",
  text: "สรุปคำแนะนำเพื่อการศึกษา",
  sourceUrl: "https://www.cdc.gov/dengue/hcp/clinical-care/",
  publisher: "CDC",
  ...overrides,
});

test("allows well-formed HTTPS sources in local draft mode while flagging pending clinical review", () => {
  const report = evaluateDraftSourcePolicy([source()], [passage()]);
  assert.equal(report.allowed, true);
  assert.equal(report.pendingClinicalReview, 1);
  assert.ok(report.checks.some((check) => check.id === "clinical-review" && check.status === "warning"));
});

test("blocks when there are no evidence sources", () => {
  const report = evaluateDraftSourcePolicy([], []);
  assert.equal(report.allowed, false);
});

test("blocks duplicate source IDs", () => {
  const report = evaluateDraftSourcePolicy([source(), source()], [passage()]);
  assert.equal(report.allowed, false);
  assert.ok(report.checks.some((check) => check.id === "unique-source-ids" && check.status === "blocked"));
});

test("blocks missing source title, publisher or published date", () => {
  const report = evaluateDraftSourcePolicy([source({ title: "", publisher: "" })], []);
  assert.equal(report.allowed, false);
  assert.ok(report.checks.some((check) => check.id === "source-metadata" && check.status === "blocked"));
});

test("blocks HTTP and malformed source URLs", () => {
  for (const sourceUrl of ["http://example.org/source", "not-a-url"]) {
    const report = evaluateDraftSourcePolicy([source({ sourceUrl })], []);
    assert.equal(report.allowed, false);
  }
});

test("blocks HTTPS source URLs that embed usernames or passwords", () => {
  const report = evaluateDraftSourcePolicy([source({ sourceUrl: "https://user:secret@example.org/source" })], []);
  assert.equal(report.allowed, false);
});

test("blocks unknown review states", () => {
  const report = evaluateDraftSourcePolicy([source({ reviewStatus: "approved-by-model" })], []);
  assert.equal(report.allowed, false);
});

test("blocks passages whose document ID is not present in the evidence package", () => {
  const report = evaluateDraftSourcePolicy([source()], [passage({ documentId: "other-doc" })]);
  assert.equal(report.allowed, false);
});

test("blocks passages with source URL different from the registered source", () => {
  const report = evaluateDraftSourcePolicy([source()], [passage({ sourceUrl: "https://example.org/other" })]);
  assert.equal(report.allowed, false);
});

test("blocks passages with a publisher that does not match the source registry", () => {
  const report = evaluateDraftSourcePolicy([source()], [passage({ publisher: "Unknown publisher" })]);
  assert.equal(report.allowed, false);
});

test("blocks passage metadata when the review status differs from the registered document", () => {
  const report = evaluateDraftSourcePolicy([source()], [passage({ reviewStatus: "clinically_reviewed" })]);
  assert.equal(report.allowed, false);
});

test("blocks empty passage text or missing section labels", () => {
  assert.equal(evaluateDraftSourcePolicy([source()], [passage({ text: "" })]).allowed, false);
  assert.equal(evaluateDraftSourcePolicy([source()], [passage({ sectionLabel: "" })]).allowed, false);
});

test("allows a clinically reviewed source but does not authorize Production AI", () => {
  const report = evaluateDraftSourcePolicy(
    [source({ reviewStatus: "clinically_reviewed" })],
    [passage({ reviewStatus: "clinically_reviewed" })],
  );
  assert.equal(report.allowed, true);
  assert.match(report.note, /ไม่อนุญาตให้เปิด Production AI/);
});

test("allows source-only evidence when there are no passages, provided source metadata is sound", () => {
  const report = evaluateDraftSourcePolicy([source()], []);
  assert.equal(report.allowed, true);
  assert.equal(report.passageCount, 0);
});

test("blocks sources without explicit project-owner approval for academic demonstration", () => {
  const report = evaluateDraftSourcePolicy([source({ projectApproval: undefined })], []);
  assert.equal(report.allowed, false);
  assert.equal(report.projectApprovalFailures, 1);
  assert.ok(report.checks.some((check) => check.id === "project-owner-approval" && check.status === "blocked"));
});

test("blocks project approval with a scope broader than academic demonstration", () => {
  const report = evaluateDraftSourcePolicy([source({
    projectApproval: { status: "approved", scope: "production-medical-advice", approvedAt: "2026-11-21", approvedBy: "project-owner" },
  })], []);
  assert.equal(report.allowed, false);
});
