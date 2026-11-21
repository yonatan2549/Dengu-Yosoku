import test from "node:test";
import assert from "node:assert/strict";
import { searchHealthKnowledge, validateKnowledgeQuery, HEALTH_KNOWLEDGE } from "../.next/health-knowledge-tests/lib/health-assistant/knowledge.js";

test("knowledge base contains dated source records with direct citation URLs", () => {
  assert.ok(HEALTH_KNOWLEDGE.length >= 6);
  for (const item of HEALTH_KNOWLEDGE) {
    assert.ok(item.sourceUrl.startsWith("https://"));
    assert.equal(item.reviewStatus, "awaiting_clinical_review");
    assert.equal(item.projectApproval.status, "approved");
    assert.equal(item.projectApproval.scope, "academic-demonstration-only");
  }
});

test("retrieves warning-sign reference for Thai warning query", () => {
  const results = searchHealthKnowledge("สัญญาณเตือนไข้เลือดออก");
  assert.ok(results.some((item) => item.id === "cdc-clinical-care-2026"));
});

test("retrieves diagnostic testing references for NS1, IgM and IgG", () => {
  const results = searchHealthKnowledge("NS1 IgM IgG");
  assert.ok(results.some((item) => item.id === "cdc-dengue-testing-2025"));
  assert.ok(results.some((item) => item.id === "who-lab-testing-2025"));
});

test("retrieves prevention knowledge for mosquito prevention query", () => {
  const results = searchHealthKnowledge("การป้องกันยุงลาย");
  assert.ok(results.some((item) => item.id === "who-dengue-fact-sheet"));
});

test("retrieval results always carry source and review status", () => {
  const results = searchHealthKnowledge("dengue clinical care");
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.sourceUrl.startsWith("https://") && item.reviewStatus === "awaiting_clinical_review"));
});

test("returns no results for unrelated query rather than fabricating content", () => {
  assert.deepEqual(searchHealthKnowledge("quantum black hole telescopes"), []);
});

test("rejects non-object request bodies", () => {
  assert.equal(validateKnowledgeQuery(null).ok, false);
  assert.equal(validateKnowledgeQuery([]).ok, false);
});

test("rejects missing or short queries", () => {
  assert.equal(validateKnowledgeQuery({}).ok, false);
  assert.equal(validateKnowledgeQuery({ query: "a" }).ok, false);
});

test("rejects oversized queries", () => {
  assert.equal(validateKnowledgeQuery({ query: "x".repeat(501) }).ok, false);
});

test("trims accepted queries", () => {
  assert.deepEqual(validateKnowledgeQuery({ query: "  dengue  " }), { ok: true, query: "dengue" });
});

test("retrieves Thai Department of Disease Control guideline directory", () => {
  const results = searchHealthKnowledge("คู่มือกรมควบคุมโรค แนวทางไข้เลือดออก");
  assert.ok(results.some((item) => item.id === "ddc-dengue-guidelines-portal"));
});
