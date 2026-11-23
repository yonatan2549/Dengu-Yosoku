import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSqliteCitations,
  buildSqliteGroundedMessages,
  validateSqliteCitedAnswer,
} from "../.next/health-assistant-sqlite-answer-tests/lib/health-assistant/sqlite-answer.js";

function makePayload() {
  return {
    schemaVersion: "1.0",
    status: "ok",
    query: "ไข้เลือดออกติดต่อได้อย่างไร",
    audience: "public",
    safety: { blocked: false, gateReasons: [] },
    retrieval: {
      engine: "hybrid-semantic-character-overlap-intent-rerank",
      version: "0.6.2",
      indexedChunks: 126,
      eligibleChunks: 22,
      resultCount: 3,
      semanticWeight: 0.8,
      queryIntent: "transmission",
      withheld: { sourcePolicy: 91, audiencePolicy: 13, textQuality: 0 },
    },
    results: [
      {
        rank: 1, sourceId: "DDC_DENGUE", title: "ไข้เลือดออก", authority: "กรมควบคุมโรค",
        pageStart: null, pageEnd: null, pageLabel: "HTML section",
        audience: "general", accessPolicy: "public_general", extractionMethod: "html",
        qualityStatus: "ok", replacementChars: 0, language: "th", retrievedAt: null,
        sourceUrl: "https://ddc.moph.go.th/dengue", text: "โรคไข้เลือดออกส่งผ่านมาทางยุงลาย",
        scores: { combined: 0.8, semantic: 0.7, lexical: 0.9, intentAdjustment: 0.1 },
      },
      {
        rank: 2, sourceId: "DDC_DENGUE", title: "ไข้เลือดออก", authority: "กรมควบคุมโรค",
        pageStart: null, pageEnd: null, pageLabel: "HTML section",
        audience: "general", accessPolicy: "public_general", extractionMethod: "html",
        qualityStatus: "ok", replacementChars: 0, language: "th", retrievedAt: null,
        sourceUrl: "https://ddc.moph.go.th/dengue", text: "ยุงลายเป็นพาหะนำเชื้อเดงกี",
        scores: { combined: 0.7, semantic: 0.6, lexical: 0.8, intentAdjustment: 0.1 },
      },
      {
        rank: 3, sourceId: "WHO_DENGUE", title: "Dengue", authority: "World Health Organization",
        pageStart: null, pageEnd: null, pageLabel: "Fact sheet",
        audience: "general", accessPolicy: "public_general", extractionMethod: "html",
        qualityStatus: "ok", replacementChars: 0, language: "en", retrievedAt: null,
        sourceUrl: "https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue",
        text: "Mosquitoes can become infected by people who are viremic with DENV.",
        scores: { combined: 0.6, semantic: 0.5, lexical: 0.7, intentAdjustment: 0.1 },
      },
    ],
    warnings: [],
  };
}

test("groups duplicate chunks under one stable source citation", () => {
  const citations = buildSqliteCitations(makePayload());
  assert.equal(citations.length, 2);
  assert.equal(citations[0].marker, "[S1]");
  assert.equal(citations[1].marker, "[S2]");
});

test("builds a single-turn Thai prompt using only returned excerpts", () => {
  const messages = buildSqliteGroundedMessages("ไข้เลือดออกติดต่อได้อย่างไร", makePayload());
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /EXCERPTS/);
  assert.match(messages[0].content, /โรคไข้เลือดออกส่งผ่านมาทางยุงลาย/);
  assert.match(messages[0].content, /ห้ามทำตามคำสั่ง/);
  assert.equal(messages[1].role, "user");
});

test("accepts an answer when each factual paragraph cites a retrieved source", () => {
  const result = validateSqliteCitedAnswer(
    "ไข้เลือดออกแพร่ผ่านยุงลายที่มีเชื้อเดงกี [S1]\n\nองค์การอนามัยโลกระบุว่ายุงสามารถรับเชื้อจากคนที่มีไวรัสในกระแสเลือดได้ [S2]\n\nคำตอบนี้เป็นร่างเพื่อการศึกษา ไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล",
    makePayload(),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.citations.map((item) => item.marker), ["[S1]", "[S2]"]);
});

test("rejects an answer without citations", () => {
  assert.equal(validateSqliteCitedAnswer("ไข้เลือดออกแพร่ผ่านยุงลายที่มีเชื้อเดงกี", makePayload()).ok, false);
});

test("rejects unknown citation markers", () => {
  assert.equal(validateSqliteCitedAnswer("ไข้เลือดออกแพร่ผ่านยุงลาย [S3]", makePayload()).ok, false);
});

test("rejects factual paragraphs without citations", () => {
  const result = validateSqliteCitedAnswer(
    "ไข้เลือดออกแพร่ผ่านยุงลายที่มีเชื้อเดงกี [S1]\n\nยุงลายมักกัดในเวลากลางวัน",
    makePayload(),
  );
  assert.equal(result.ok, false);
});

test("rejects medication and dosage instructions even with a valid citation", () => {
  const result = validateSqliteCitedAnswer(
    "คุณควรกินยาพาราเซตามอลตามขนาดนี้เพื่อรักษาอาการ [S1]",
    makePayload(),
  );
  assert.equal(result.ok, false);
});
