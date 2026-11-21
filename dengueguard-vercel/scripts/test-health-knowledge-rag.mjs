import test from "node:test";
import assert from "node:assert/strict";
import { retrieveHealthKnowledgeChunks } from "../.next/health-knowledge-rag-tests/lib/health-assistant/chunk-retrieval.js";
import { buildHealthEvidencePackage } from "../.next/health-knowledge-rag-tests/lib/health-assistant/evidence.js";
import { buildGroundedMessages } from "../.next/health-knowledge-rag-tests/lib/health-assistant/chat-contract.js";

test("retrieves warning-sign passages with traceable CDC source metadata", () => {
  const results = retrieveHealthKnowledgeChunks("สัญญาณเตือนไข้เลือดออก ปวดท้อง อาเจียน", 8);
  assert.ok(results.length > 0);
  assert.ok(results.some((item) => item.documentId === "cdc-clinical-care-2026"));
  assert.ok(results.every((item) => item.sourceUrl.startsWith("https://")));
});

test("retrieves testing passages for NS1, IgM and IgG", () => {
  const results = retrieveHealthKnowledgeChunks("NS1 IgM IgG ต่างกันอย่างไร", 8);
  assert.ok(results.some((item) => item.documentId === "cdc-dengue-testing-2025" || item.documentId === "who-lab-testing-2025"));
});

test("retrieves prevention passages", () => {
  const results = retrieveHealthKnowledgeChunks("การป้องกันยุงลายและแหล่งเพาะพันธุ์", 8);
  assert.ok(results.length > 0);
  assert.ok(results.some((item) => item.text.length > 0));
});

test("every passage retains document identity, section, publisher and URL", () => {
  const results = retrieveHealthKnowledgeChunks("ไข้เลือดออกติดต่อได้อย่างไร", 8);
  assert.ok(results.length > 0);
  for (const item of results) {
    assert.ok(item.chunkId.startsWith(`${item.documentId}:`));
    assert.ok(item.section === "summary" || item.section === "key-point");
    assert.ok(item.publisher.length > 0);
    assert.ok(item.sourceUrl.startsWith("https://"));
  }
});

test("all passages remain explicitly pending clinical review", () => {
  const results = retrieveHealthKnowledgeChunks("NS1 IgM", 8);
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.reviewStatus === "awaiting_clinical_review"));
});

test("retrieval labels its method as curated registry lexical retrieval", () => {
  const results = retrieveHealthKnowledgeChunks("อาการเตือนไข้เลือดออก", 8);
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.retrievalMethod === "curated-registry-lexical"));
});

test("does not claim that passages came from full external documents", () => {
  const results = retrieveHealthKnowledgeChunks("แนวทางการดูแลไข้เลือดออก", 8);
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.chunkId.includes(":summary") || item.chunkId.includes(":point:")));
});

test("does not fabricate passages for unrelated queries", () => {
  assert.deepEqual(retrieveHealthKnowledgeChunks("อัตราดอกเบี้ยสินเชื่อรถยนต์", 8), []);
});

test("returns no more than two passages per source document", () => {
  const results = retrieveHealthKnowledgeChunks("ไข้เลือดออก dengue อาการ การดูแล ป้องกัน ยุงลาย", 8);
  const counts = new Map();
  for (const item of results) counts.set(item.documentId, (counts.get(item.documentId) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test("respects a bounded result limit", () => {
  const results = retrieveHealthKnowledgeChunks("ไข้เลือดออก", 1);
  assert.ok(results.length <= 1);
});

test("caps an excessive result limit at eight", () => {
  const results = retrieveHealthKnowledgeChunks("ไข้เลือดออก", 100);
  assert.ok(results.length <= 8);
});

test("rejects a too-short query by returning no passages", () => {
  assert.deepEqual(retrieveHealthKnowledgeChunks("x", 8), []);
});

test("does not mark passages as clinically approved", () => {
  const results = retrieveHealthKnowledgeChunks("สัญญาณเตือน dengue", 8);
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.reviewStatus !== "clinically_approved"));
});


test("grounded prompt uses retrieved passages and keeps citation marker tied to the source document", () => {
  const query = "NS1 IgM และ IgG ต่างกันอย่างไร";
  const evidence = buildHealthEvidencePackage(query);
  const passages = retrieveHealthKnowledgeChunks(query, 8);
  const messages = buildGroundedMessages(query, [], evidence, passages);
  const prompt = messages[0]?.content ?? "";
  assert.ok(passages.length > 0);
  assert.ok(prompt.includes("ข้อความที่ค้นคืนจากทะเบียนความรู้"));
  assert.ok(prompt.includes("ไม่ใช่เอกสารฉบับเต็ม"));
  assert.ok(prompt.includes("[S1]"));
});

test("grounded prompt explicitly states the knowledge review limitation", () => {
  const query = "สัญญาณเตือนของไข้เลือดออกมีอะไรบ้าง";
  const evidence = buildHealthEvidencePackage(query);
  const passages = retrieveHealthKnowledgeChunks(query, 8);
  const messages = buildGroundedMessages(query, [], evidence, passages);
  const prompt = messages[0]?.content ?? "";
  assert.ok(prompt.includes("awaiting_clinical_review"));
  assert.ok(prompt.includes("ไม่ใช่เอกสารฉบับเต็ม"));
});
