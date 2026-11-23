import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAssessmentRules } from "../.next/assessment-tests/lib/assessment/engine.js";

const rules = [
  ["U001", "urgency", "emergency_any", "EMERGENCY", 1],
  ["U002", "urgency", "dengue_warning_any", "DENGUE_WARNING", 2],
  ["U003", "urgency", "hydration_concern", "HYDRATION_REVIEW", 3],
  ["D001", "dengue_evidence", "naat_positive", "LAB_SUPPORT_NAAT", 1],
  ["D002", "dengue_evidence", "ns1_positive", "LAB_SUPPORT_NS1", 2],
  ["D003", "dengue_evidence", "igm_positive", "PRESUMPTIVE_RECENT", 3],
  ["D004", "dengue_evidence", "clinical_pattern", "CLINICAL_SUSPICION", 4],
  ["D005", "dengue_evidence", "igg_only_positive", "IGG_ONLY", 5],
  ["D006", "dengue_evidence", "cbc_trend", "CBC_CONTEXT", 6],
].map(([rule_id, domain, condition_code, output_code, priority]) => ({
  rule_id, domain, condition_code, output_code, priority,
  logic_summary_th: "test", reference_url: "", clinical_note_th: "",
}));

const evaluate = (answers) => evaluateAssessmentRules(answers, rules);

test("U001 emergency takes priority over warning and hydration", () => {
  const result = evaluate({ breathing_difficulty: true, severe_abdominal: true, unable_to_drink: true });
  assert.equal(result.urgencyCode, "EMERGENCY");
  assert.deepEqual(result.matchedUrgencyRules.map((rule) => rule.rule_id), ["U001", "U002", "U003"]);
});

test("U002 warning signs take priority over hydration", () => {
  assert.equal(evaluate({ severe_abdominal: true, reduced_urine: true }).urgencyCode, "DENGUE_WARNING");
});

test("hepatomegaly is included as a warning sign", () => {
  const result = evaluate({ hepatomegaly: true });
  assert.equal(result.urgencyCode, "DENGUE_WARNING");
  assert.equal(result.matchedUrgencyRules[0].rule_id, "U002");
});

test("clinician-reported progressive Hct rise is included as a warning sign", () => {
  assert.equal(evaluate({ hct_increase_reported: true }).urgencyCode, "DENGUE_WARNING");
});

test("U003 hydration concern requires inability to drink or reduced urine", () => {
  assert.equal(evaluate({ excessive_thirst: true }).urgencyCode, "NO_URGENT_FLAG");
  assert.equal(evaluate({ unable_to_drink: true }).urgencyCode, "HYDRATION_REVIEW");
});

test("D001 NAAT is the highest-priority evidence output", () => {
  const result = evaluate({ naat_result: "positive", ns1_result: "positive", igm_result: "positive", igg_result: "positive" });
  assert.equal(result.evidenceCode, "LAB_SUPPORT_NAAT");
  assert.equal(result.matchedEvidenceRules.some((rule) => rule.rule_id === "D005"), false);
});

test("D002 NS1 takes priority over IgM", () => {
  assert.equal(evaluate({ ns1_result: "positive", igm_result: "positive" }).evidenceCode, "LAB_SUPPORT_NS1");
});

test("D003 single-sample IgM is presumptive recent evidence", () => {
  assert.equal(evaluate({ igm_result: "positive" }).evidenceCode, "PRESUMPTIVE_RECENT");
});

test("D004 requires fever on days 2-7, recent-area exposure and two manifestation groups", () => {
  const result = evaluate({ fever_status: "fever_now", illness_onset: "day2_3", endemic_area: true, headache: true, eye_pain: true, myalgia: true });
  assert.equal(result.manifestations, 2);
  assert.equal(result.clinicalPattern, true);
  assert.equal(result.evidenceCode, "CLINICAL_SUSPICION");
});

test("headache and eye pain are one manifestation group", () => {
  const result = evaluate({ fever_status: "fever_now", illness_onset: "day2_3", endemic_area: true, headache: true, eye_pain: true });
  assert.equal(result.manifestations, 1);
  assert.equal(result.clinicalPattern, false);
});

test("petechiae and positive tourniquet test are one manifestation group", () => {
  const result = evaluate({ fever_status: "fever_now", illness_onset: "day2_3", endemic_area: true, petechiae: true, tourniquet_positive: true, myalgia: true });
  assert.equal(result.manifestations, 2);
  assert.equal(result.clinicalPattern, true);
});

test("D004 is false without a recent-area exposure selection", () => {
  assert.equal(evaluate({ fever_status: "fever_now", illness_onset: "day4_5", headache: true, nausea_vomiting: true }).clinicalPattern, false);
});

test("D005 only applies when IgG is positive without NAAT, NS1 or IgM positive", () => {
  assert.equal(evaluate({ igg_result: "positive" }).evidenceCode, "IGG_ONLY");
  assert.equal(evaluate({ igg_result: "positive", ns1_result: "positive" }).matchedEvidenceRules.some((rule) => rule.rule_id === "D005"), false);
});

test("D006 requires comparable CBC confirmation and a paired analyte", () => {
  const noConfirmation = evaluate({ platelet_current: "120000", platelet_previous: "180000" });
  assert.equal(noConfirmation.cbcTrend, false);
  assert.equal(noConfirmation.matchedEvidenceRules.some((rule) => rule.rule_id === "D006"), false);

  const confirmed = evaluate({ cbc_pair_comparable: true, platelet_current: "120000", platelet_previous: "180000" });
  assert.equal(confirmed.cbcTrend, true);
  assert.equal(confirmed.evidenceCode, "CBC_CONTEXT");
});

test("D006 accepts a comparable paired Hct result", () => {
  const result = evaluate({ cbc_pair_comparable: true, hct_current: "42", hct_previous: "39" });
  assert.equal(result.cbcTrend, true);
  assert.equal(result.evidenceCode, "CBC_CONTEXT");
});

test("D006 remains secondary to stronger evidence rules", () => {
  const result = evaluate({ naat_result: "positive", cbc_pair_comparable: true, hct_current: "42", hct_previous: "39" });
  assert.equal(result.evidenceCode, "LAB_SUPPORT_NAAT");
  assert.equal(result.matchedEvidenceRules.some((rule) => rule.output_code === "CBC_CONTEXT"), true);
});

test("clinical pattern and isolated IgG can both be retained as matches", () => {
  const result = evaluate({ fever_status: "fever_now", illness_onset: "day4_5", endemic_area: true, headache: true, nausea_vomiting: true, igg_result: "positive" });
  assert.equal(result.evidenceCode, "CLINICAL_SUSPICION");
  assert.deepEqual(result.matchedEvidenceRules.map((rule) => rule.output_code), ["CLINICAL_SUSPICION", "IGG_ONLY"]);
});

test("configuration issues expose missing supplied rule definitions", () => {
  const result = evaluateAssessmentRules({}, rules.filter((rule) => rule.rule_id !== "U001"));
  assert.deepEqual(result.configurationIssues, ["urgency:emergency_any"]);
});

test("missing emergency rule cannot downgrade a selected emergency sign", () => {
  const rulesWithoutEmergency = rules.filter((rule) => rule.rule_id !== "U001");
  const result = evaluateAssessmentRules({ breathing_difficulty: true }, rulesWithoutEmergency);
  assert.equal(result.urgencyCode, "EMERGENCY");
  assert.deepEqual(result.configurationIssues, ["urgency:emergency_any"]);
});

test("unknown rule conditions are reported", () => {
  const result = evaluateAssessmentRules({}, [...rules, {
    rule_id: "X001", domain: "urgency", condition_code: "future_condition",
    logic_summary_th: "future", output_code: "FUTURE", priority: 99,
    reference_url: "", clinical_note_th: "",
  }]);
  assert.deepEqual(result.unsupportedConditions, ["future_condition"]);
});

test("legacy fever fallback remains available when no urgency rule matches", () => {
  assert.equal(evaluate({ fever_status: "fever_now" }).urgencyCode, "FEVER_REVIEW");
});

test("no fever and no urgency flags does not fabricate a warning", () => {
  assert.equal(evaluate({}).urgencyCode, "NO_URGENT_FLAG");
});
