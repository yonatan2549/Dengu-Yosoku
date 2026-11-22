import test from "node:test";
import assert from "node:assert/strict";
import { validatePublicRagPayload } from "../.next/health-assistant-local-rag-tests/lib/health-assistant/local-rag-contract.js";

function makePayload(overrides = {}) {
  return {
    schema_version: "1.0",
    status: "ok",
    query: "ไข้เลือดออกติดต่อได้อย่างไร",
    audience: "public",
    safety: { blocked: false, gate_reasons: [] },
    retrieval: {
      engine: "hybrid-semantic-character-overlap-intent-rerank",
      version: "0.6.2",
      indexed_chunks: 126,
      eligible_chunks: 22,
      result_count: 1,
      semantic_weight: 0.8,
      query_intent: null,
      withheld: { source_policy: 91, audience_policy: 13, text_quality: 0 },
    },
    results: [{
      rank: 1,
      source_id: "DDC_DENGUE_OVERVIEW",
      title: "Dengue overview",
      authority: "Department of Disease Control",
      page_start: null,
      page_end: null,
      page_label: "HTML section (unpaginated)",
      audience: "general",
      access_policy: "public_general",
      extraction_method: "legacy_unknown",
      quality_status: "ok",
      replacement_chars: 0,
      language: "th",
      retrieved_at: "2026-11-21T16:46:34.020004+00:00",
      source_url: "https://ddc.moph.go.th/dcd/pagecontent.php?page=565",
      text: "Dengue is transmitted by infected Aedes mosquitoes.",
      scores: { combined: 0.66, semantic: 0.58, lexical: 0.94, intent_adjustment: 0 },
    }],
    warnings: ["Ranking scores are not medical accuracy scores."],
    ...overrides,
  };
}

test("accepts valid public RAG evidence and maps provenance", () => {
  const result = validatePublicRagPayload(makePayload());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.results[0].sourceId, "DDC_DENGUE_OVERVIEW");
    assert.equal(result.value.results[0].accessPolicy, "public_general");
    assert.equal(result.value.results[0].scores.combined, 0.66);
  }
});

test("rejects review audience payloads", () => {
  assert.equal(validatePublicRagPayload(makePayload({ audience: "review" })).ok, false);
});

test("rejects non-general or restricted chunk audiences", () => {
  const payload = makePayload();
  payload.results[0].audience = "clinician_only";
  assert.equal(validatePublicRagPayload(payload).ok, false);
});

test("rejects non-public access policies", () => {
  const payload = makePayload();
  payload.results[0].access_policy = "clinician_only";
  assert.equal(validatePublicRagPayload(payload).ok, false);
});

test("rejects URLs that are not safe HTTPS sources", () => {
  const payload = makePayload();
  payload.results[0].source_url = "http://example.test/source";
  assert.equal(validatePublicRagPayload(payload).ok, false);
});

test("rejects text with replacement characters or non-ok extraction quality", () => {
  const payload = makePayload();
  payload.results[0].replacement_chars = 2;
  assert.equal(validatePublicRagPayload(payload).ok, false);
});

test("keeps safety blocked separate from no evidence", () => {
  const blocked = makePayload({
    status: "blocked",
    safety: { blocked: true, gate_reasons: ["medication_dosing"], message: "blocked" },
    retrieval: {
      engine: "public-safety-gate", version: "1.0", indexed_chunks: 126,
      eligible_chunks: 0, result_count: 0, semantic_weight: 0.8, query_intent: null,
      withheld: { source_policy: 0, audience_policy: 0, text_quality: 0 },
    },
    results: [],
  });
  const noEvidence = makePayload({
    status: "no_evidence",
    safety: { blocked: false, gate_reasons: [] },
    retrieval: {
      engine: "hybrid", version: "0.6.2", indexed_chunks: 126,
      eligible_chunks: 0, result_count: 0, semantic_weight: 0.8, query_intent: null,
      withheld: { source_policy: 0, audience_policy: 0, text_quality: 0 },
    },
    results: [],
  });
  const blockedResult = validatePublicRagPayload(blocked);
  const emptyResult = validatePublicRagPayload(noEvidence);
  assert.equal(blockedResult.ok, true);
  assert.equal(emptyResult.ok, true);
  if (blockedResult.ok) assert.equal(blockedResult.value.status, "blocked");
  if (emptyResult.ok) assert.equal(emptyResult.value.status, "no_evidence");
});

test("rejects inconsistent result counts and overlong excerpts", () => {
  const countMismatch = makePayload();
  countMismatch.retrieval.result_count = 2;
  assert.equal(validatePublicRagPayload(countMismatch).ok, false);

  const longExcerpt = makePayload();
  longExcerpt.results[0].text = "x".repeat(1001);
  assert.equal(validatePublicRagPayload(longExcerpt).ok, false);
});
