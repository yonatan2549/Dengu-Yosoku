import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildHealthEvidencePackage, classifyHealthQuery } = require("../.next/health-evidence-tests/lib/health-assistant/evidence.js");

test("classifies general dengue warning-sign learning query as education", () => {
  assert.equal(classifyHealthQuery("สัญญาณเตือนไข้เลือดออก"), "general-education");
  const result = buildHealthEvidencePackage("สัญญาณเตือนไข้เลือดออก");
  assert.equal(result.safetyLevel, "education");
  assert.ok(result.results.length > 0);
});

test("routes severe abdominal pain to urgent safety notice", () => {
  const result = buildHealthEvidencePackage("ปวดท้องรุนแรง");
  assert.equal(result.intent, "emergency-warning");
  assert.equal(result.safetyLevel, "urgent");
  assert.equal(result.abstained, true);
});

test("routes persistent vomiting to urgent safety notice", () => {
  const result = buildHealthEvidencePackage("อาเจียนต่อเนื่อง");
  assert.equal(result.safetyLevel, "urgent");
  assert.match(result.safetyMessage, /โรงพยาบาล|ห้องฉุกเฉิน/);
});

test("routes bleeding symptoms to urgent safety notice", () => {
  const result = buildHealthEvidencePackage("ถ่ายเป็นเลือด");
  assert.equal(result.safetyLevel, "urgent");
});

test("routes breathing difficulty to urgent safety notice", () => {
  const result = buildHealthEvidencePackage("หายใจลำบาก");
  assert.equal(result.safetyLevel, "urgent");
});

test("routes loss of consciousness, shock and severe thirst to urgent safety notice", () => {
  for (const query of ["หมดสติ", "ผู้ป่วยมีอาการช็อก", "กระหายน้ำมาก"]) {
    assert.equal(classifyHealthQuery(query), "emergency-warning", query);
    assert.equal(buildHealthEvidencePackage(query).safetyLevel, "urgent", query);
  }
});

test("emergency safety route takes priority over a personal medical query", () => {
  const result = buildHealthEvidencePackage("ลูกของฉันอาเจียนต่อเนื่อง");
  assert.equal(result.intent, "emergency-warning");
  assert.equal(result.safetyLevel, "urgent");
});

test("classifies Thai first-person and family fever questions as personal medical", () => {
  for (const query of [
    "ฉันเป็นไข้",
    "ฉันมีไข้เลือดออกไหม",
    "ลูกของฉันมีไข้เลือดออกหรือไม่",
    "ผมเริ่มมีไข้เมื่อวาน",
    "หนูมีไข้สูง",
  ]) {
    assert.equal(classifyHealthQuery(query), "personal-medical", query);
  }
});

test("keeps general fever education questions in the education category", () => {
  assert.equal(classifyHealthQuery("ไข้เลือดออกมีอาการอย่างไร"), "general-education");
  assert.equal(classifyHealthQuery("มีไข้เลือดออกติดต่อกันอย่างไร"), "general-education");
});

test("abstains from personalized medication selection", () => {
  const result = buildHealthEvidencePackage("ฉันควรกินยาอะไรดี");
  assert.equal(result.intent, "personal-medical");
  assert.equal(result.safetyLevel, "caution");
  assert.equal(result.abstained, true);
});

test("abstains from interpreting an individual's lab results", () => {
  const result = buildHealthEvidencePackage("ผลเลือด platelet ของฉัน");
  assert.equal(result.intent, "personal-medical");
  assert.equal(result.safetyLevel, "caution");
});

test("retrieves testing evidence for NS1 IgM and IgG", () => {
  const result = buildHealthEvidencePackage("NS1 IgM และ IgG ต่างกันอย่างไร");
  assert.equal(result.safetyLevel, "education");
  assert.ok(result.results.some((item) => item.category === "testing"));
});

test("returns citations for every retrieved source", () => {
  const result = buildHealthEvidencePackage("การป้องกันยุงลาย");
  assert.equal(result.citations.length, result.results.length);
  assert.ok(result.citations.every((item) => item.sourceUrl.startsWith("https://")));
});

test("keeps all evidence marked as awaiting clinical review", () => {
  const result = buildHealthEvidencePackage("NS1 IgM IgG");
  assert.ok(result.results.every((item) => item.reviewStatus === "awaiting_clinical_review"));
  assert.ok(result.citations.every((item) => item.reviewStatus === "awaiting_clinical_review"));
});

test("does not generate an AI answer", () => {
  const result = buildHealthEvidencePackage("ไข้เลือดออกมีอาการอย่างไร");
  assert.equal(result.generatedAnswer, false);
  assert.equal(result.mode, "evidence-only");
});

test("abstains when no knowledge source matches", () => {
  const result = buildHealthEvidencePackage("หุ้นเทคโนโลยีอวกาศ");
  assert.equal(result.safetyLevel, "no-evidence");
  assert.equal(result.abstained, true);
  assert.equal(result.results.length, 0);
});

test("rejects queries shorter than the minimum length", () => {
  assert.throws(() => buildHealthEvidencePackage("x"), /อย่างน้อย 2 ตัวอักษร/);
});

test("rejects oversized queries", () => {
  assert.throws(() => buildHealthEvidencePackage("ก".repeat(501)), /ไม่เกิน 500 ตัวอักษร/);
});
