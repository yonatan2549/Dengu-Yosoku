import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalGroundedMessages,
  cosineSimilarity,
  isLocalHealthRagEnabled,
  rankLocalHealthChunks,
  validateLocalRagAnswer,
} from "../.next/local-health-rag-tests/lib/health-assistant/local-rag.js";

const source = {
  id: "who-test",
  title: "WHO dengue facts",
  publisher: "WHO",
  publishedAt: "2025-08-21",
  sourceType: "fact sheet",
  sourceUrl: "https://www.who.int/dengue",
  checkedAt: "2026-11-21",
  reviewStatus: "awaiting_clinical_review",
};

function chunk(id, sourceId, embedding, content = "ข้อมูลทดสอบจากแหล่งอ้างอิง") {
  return {
    id,
    sourceId,
    section: "testing",
    content,
    reviewStatus: "awaiting_clinical_review",
    source: { ...source, id: sourceId },
    embedding,
  };
}

test("cosine similarity ranks aligned vectors higher", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), -1);
});

test("vector retrieval ranks by similarity and caps two passages per source", () => {
  const chunks = [
    chunk("a1", "A", [0.9, 0.1]),
    chunk("a2", "A", [0.8, 0.2]),
    chunk("a3", "A", [0.7, 0.3]),
    chunk("b1", "B", [0.6, 0.4]),
  ];
  const result = rankLocalHealthChunks([1, 0], chunks, 6, 0.4, 2);
  assert.deepEqual(result.map((item) => item.id), ["a1", "a2", "b1"]);
});

test("vector retrieval abstains below the configured similarity floor", () => {
  const result = rankLocalHealthChunks([1, 0], [chunk("off-topic", "A", [0, 1])], 6, 0.3);
  assert.deepEqual(result, []);
});

test("local provider is enabled only in non-Vercel development", () => {
  assert.equal(isLocalHealthRagEnabled({ HEALTH_ASSISTANT_PROVIDER: "ollama-local", NODE_ENV: "development" }), true);
  assert.equal(isLocalHealthRagEnabled({ HEALTH_ASSISTANT_PROVIDER: "ollama-local", NODE_ENV: "production" }), false);
  assert.equal(isLocalHealthRagEnabled({ HEALTH_ASSISTANT_PROVIDER: "ollama-local", NODE_ENV: "development", VERCEL: "1" }), false);
  assert.equal(isLocalHealthRagEnabled({ HEALTH_ASSISTANT_PROVIDER: "ollama-local", NODE_ENV: "development", VERCEL_ENV: "preview" }), false);
});

test("grounded prompt assigns one source marker and uses source passages", () => {
  const a = chunk("a1", "A", [1, 0], "Dengue is transmitted by infected mosquitoes.");
  const b = chunk("a2", "A", [0.9, 0.1], "Mosquitoes are active during the day.");
  const messages = buildLocalGroundedMessages("How is dengue transmitted?", [], [a, b]);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /\[S1\] WHO dengue facts/);
  assert.match(messages[0].content, /Dengue is transmitted by infected mosquitoes/);
  assert.match(messages[0].content, /awaiting_clinical_review/);
  assert.match(messages[0].content, /ไม่แสดงความคิดภายใน/);
  assert.equal(messages[1].content, "How is dengue transmitted?");
});

test("accepts a cited final answer and returns grounded citation metadata", () => {
  const item = chunk("a1", "A", [1, 0]);
  const result = validateLocalRagAnswer("โรคนี้แพร่ผ่านยุงลายที่มีเชื้อ [S1]", [item]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.citations[0].sourceUrl, "https://www.who.int/dengue");
});

test("rejects answers without source markers", () => {
  const result = validateLocalRagAnswer("โรคไข้เลือดออกเกิดจากไวรัสเดงกี", [chunk("a1", "A", [1, 0])]);
  assert.equal(result.ok, false);
});

test("rejects fabricated citation markers", () => {
  const result = validateLocalRagAnswer("โรคนี้เกิดจากไวรัส [S2]", [chunk("a1", "A", [1, 0])]);
  assert.equal(result.ok, false);
});

test("rejects paragraphs without citations", () => {
  const result = validateLocalRagAnswer("โรคนี้เกิดจากไวรัส [S1]\n\nควรดื่มน้ำมาก ๆ", [chunk("a1", "A", [1, 0])]);
  assert.equal(result.ok, false);
});

test("rejects leaked analysis or thinking text", () => {
  const result = validateLocalRagAnswer("Thinking Process: let's think carefully [S1]", [chunk("a1", "A", [1, 0])]);
  assert.equal(result.ok, false);
});
