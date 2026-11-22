import assert from "node:assert/strict";
import testCase from "node:test";
import {
  detectEmergencySignals,
  parseSearchOutput,
} from "../lib/health-assistant/contracts";

testCase("detects urgent breathing symptoms", () => {
  assert.ok(detectEmergencySignals("ผู้ป่วยหายใจลำบากควรทำอย่างไร").includes("หายใจเร็วหรือหายใจลำบาก"));
});

testCase("detects urgent bleeding symptoms", () => {
  assert.ok(detectEmergencySignals("มีอาการอาเจียนเป็นเลือด").includes("อาเจียนเป็นเลือด"));
});

testCase("does not escalate a negated symptom mention", () => {
  assert.deepEqual(detectEmergencySignals("ไม่มีอาเจียนเป็นเลือดและไม่มีหายใจลำบาก"), []);
});

testCase("keeps general warning-sign questions available for retrieval", () => {
  assert.deepEqual(detectEmergencySignals("อาการเตือนของไข้เลือดออกมีอะไรบ้าง"), []);
});

testCase("parses evidence and accepts HTTPS source links", () => {
  const output = [
    "DENGUEYOSOKU — EVIDENCE RETRIEVAL v0.6.2",
    "Eligible chunks: 2 | Results: 1",
    "[1] Rank: 0.80 | Semantic: 0.70 | Lexical: 0.60 | Intent: +0.10",
    "    Source: Dengue prevention",
    "    Authority: World Health Organization",
    "    Page: HTML section",
    "    Language: en",
    "    URL: https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue",
    "    Excerpt:",
    "    To prevent mosquitoes from breeding, cover and clean water containers weekly.",
    "",
    "------------------------------------------------------------------------------",
  ].join("\n");
  const result = parseSearchOutput(output);
  assert.equal(result.status, "evidence");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].authority, "World Health Organization");
  assert.ok(result.evidence[0].url.startsWith("https://"));
});

testCase("rejects non-HTTPS source URLs", () => {
  const output = [
    "[1] Rank: 0.80",
    "Source: Unknown",
    "Authority: Unknown",
    "URL: javascript:alert(1)",
    "Excerpt:",
    "Some text",
    "------------------------------------------------------------------------------",
  ].join("\n");
  assert.equal(parseSearchOutput(output).status, "no_evidence");
});

testCase("parses public clinical safety gate as blocked", () => {
  const result = parseSearchOutput(
    "DENGUEYOSOKU — PUBLIC CLINICAL SAFETY GATE\nREQUEST BLOCKED: medication_dosing\nข้อความปฏิเสธ",
  );
  assert.equal(result.status, "blocked");
  assert.ok(result.message.includes("ไม่ให้คำแนะนำ"));
});

testCase("returns no-evidence result when retrieval has no eligible chunks", () => {
  const result = parseSearchOutput(
    "Eligible chunks: 0 | Results: 0\nNO ELIGIBLE EVIDENCE",
  );
  assert.equal(result.status, "no_evidence");
  assert.equal(result.evidence.length, 0);
});
