export interface AssessmentRule {
  rule_id: string;
  domain: string;
  condition_code: string;
  logic_summary_th: string;
  output_code: string;
  priority: number;
  reference_url: string;
  clinical_note_th: string;
}

export type AssessmentAnswers = Record<string, string | boolean | undefined>;

export interface AssessmentRuleEvaluation {
  urgencyCode: string;
  evidenceCode: string;
  matchedUrgencyRules: AssessmentRule[];
  matchedEvidenceRules: AssessmentRule[];
  unsupportedConditions: string[];
  configurationIssues: string[];
  clinicalPattern: boolean;
  manifestations: number;
  cbcTrend: boolean;
  naatPositive: boolean;
  ns1Positive: boolean;
  igmPositive: boolean;
  iggPositive: boolean;
}

const EMERGENCY_KEYS = [
  "blood_in_vomit_stool",
  "breathing_difficulty",
  "cold_clammy_faint",
  "altered_consciousness",
] as const;

// Clinical warning signs, including hepatomegaly and a clinician-reported
// progressive hematocrit rise. These are screening flags, not severity grades.
const WARNING_KEYS = [
  "severe_abdominal",
  "persistent_vomiting",
  "mucosal_bleeding",
  "lethargy_restlessness",
  "fluid_accumulation",
  "hepatomegaly",
  "hct_increase_reported",
] as const;

const REQUIRED_RULES = [
  "urgency:emergency_any",
  "urgency:dengue_warning_any",
  "urgency:hydration_concern",
  "dengue_evidence:naat_positive",
  "dengue_evidence:ns1_positive",
  "dengue_evidence:igm_positive",
  "dengue_evidence:clinical_pattern",
  "dengue_evidence:igg_only_positive",
  "dengue_evidence:cbc_trend",
] as const;

function isChecked(value: string | boolean | undefined): boolean {
  return value === true || value === "true";
}

function numericValue(value: string | boolean | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function hasComparableCbc(answers: AssessmentAnswers): boolean {
  // D006 is context only. Require explicit confirmation that both reports
  // belong to the same person and are considered comparable by a clinician.
  if (!isChecked(answers.cbc_pair_comparable)) return false;

  const plateletPair =
    numericValue(answers.platelet_current) !== null &&
    numericValue(answers.platelet_previous) !== null;
  const hematocritPair =
    numericValue(answers.hct_current) !== null &&
    numericValue(answers.hct_previous) !== null;

  return plateletPair || hematocritPair;
}

function getClinicalManifestations(answers: AssessmentAnswers): number {
  // Count clinical groups, not individual checkboxes. Headache/retro-orbital
  // pain is one group; petechiae/positive tourniquet is one group.
  const groups = [
    isChecked(answers.nausea_vomiting),
    isChecked(answers.rash),
    isChecked(answers.headache) || isChecked(answers.eye_pain),
    isChecked(answers.myalgia) || isChecked(answers.arthralgia),
    isChecked(answers.petechiae) || isChecked(answers.tourniquet_positive),
    isChecked(answers.leukopenia_reported),
  ];
  return groups.filter(Boolean).length;
}

function getClinicalPattern(
  answers: AssessmentAnswers,
  manifestations: number,
): boolean {
  const fever = ["fever_now", "fever_reduced"].includes(String(answers.fever_status));
  const onset2to7 = ["day2_3", "day4_5", "day6_7"].includes(String(answers.illness_onset));
  // The exposure item represents residence/travel in an area with dengue
  // transmission during the previous 14 days.
  return fever && onset2to7 && isChecked(answers.endemic_area) && manifestations >= 2;
}

export function evaluateAssessmentRules(
  answers: AssessmentAnswers,
  rules: AssessmentRule[],
): AssessmentRuleEvaluation {
  const manifestations = getClinicalManifestations(answers);
  const clinicalPattern = getClinicalPattern(answers, manifestations);
  const naatPositive = answers.naat_result === "positive";
  const ns1Positive = answers.ns1_result === "positive";
  const igmPositive = answers.igm_result === "positive";
  const iggPositive = answers.igg_result === "positive";
  const cbcTrend = hasComparableCbc(answers);

  const conditionResults: Record<string, boolean> = {
    emergency_any: EMERGENCY_KEYS.some((key) => isChecked(answers[key])),
    dengue_warning_any: WARNING_KEYS.some((key) => isChecked(answers[key])),
    hydration_concern:
      isChecked(answers.unable_to_drink) || isChecked(answers.reduced_urine),
    naat_positive: naatPositive,
    ns1_positive: ns1Positive,
    igm_positive: igmPositive,
    clinical_pattern: clinicalPattern,
    // A single IgG-positive sample is isolated only when NAAT, NS1 and IgM
    // are not positive. It is not considered evidence of acute infection.
    igg_only_positive:
      iggPositive && !naatPositive && !ns1Positive && !igmPositive,
    cbc_trend: cbcTrend,
  };

  const supportedDomains = new Set(["urgency", "dengue_evidence"]);
  const sortedRules = [...rules].sort((a, b) =>
    a.priority - b.priority || a.rule_id.localeCompare(b.rule_id),
  );
  const knownConditions = new Set<string>();
  const unsupportedConditions = new Set<string>();
  const matchedUrgencyRules: AssessmentRule[] = [];
  const matchedEvidenceRules: AssessmentRule[] = [];

  for (const rule of sortedRules) {
    if (!supportedDomains.has(rule.domain)) continue;
    const key = `${rule.domain}:${rule.condition_code}`;
    knownConditions.add(key);

    if (!(rule.condition_code in conditionResults)) {
      unsupportedConditions.add(rule.condition_code);
      continue;
    }
    if (!conditionResults[rule.condition_code]) continue;

    if (rule.domain === "urgency") matchedUrgencyRules.push(rule);
    if (rule.domain === "dengue_evidence") matchedEvidenceRules.push(rule);
  }

  const configurationIssues = REQUIRED_RULES.filter((key) => !knownConditions.has(key));
  const fever = ["fever_now", "fever_reduced"].includes(String(answers.fever_status));

  // Within each domain, the first matching rule by priority is the primary
  // result. Additional matches remain available for transparent explanation.
  // FEVER_REVIEW is retained as a legacy fallback outside the supplied rules.
  let urgencyCode = matchedUrgencyRules[0]?.output_code ??
    (fever ? "FEVER_REVIEW" : "NO_URGENT_FLAG");

  // Fail-safe fallback only when a required urgency rule is missing from the
  // JSON. This prevents a broken rules file from downgrading an emergency.
  const emergencyPresent = EMERGENCY_KEYS.some((key) => isChecked(answers[key]));
  const warningPresent = WARNING_KEYS.some((key) => isChecked(answers[key]));
  const hydrationPresent =
    isChecked(answers.unable_to_drink) || isChecked(answers.reduced_urine);
  if (configurationIssues.includes("urgency:emergency_any") && emergencyPresent) {
    urgencyCode = "EMERGENCY";
  } else if (
    configurationIssues.includes("urgency:dengue_warning_any") &&
    warningPresent && urgencyCode !== "EMERGENCY"
  ) {
    urgencyCode = "DENGUE_WARNING";
  } else if (
    configurationIssues.includes("urgency:hydration_concern") &&
    hydrationPresent && !["EMERGENCY", "DENGUE_WARNING"].includes(urgencyCode)
  ) {
    urgencyCode = "HYDRATION_REVIEW";
  }

  const evidenceCode = matchedEvidenceRules[0]?.output_code ?? "INSUFFICIENT";

  return {
    urgencyCode,
    evidenceCode,
    matchedUrgencyRules,
    matchedEvidenceRules,
    unsupportedConditions: [...unsupportedConditions],
    configurationIssues,
    clinicalPattern,
    manifestations,
    cbcTrend,
    naatPositive,
    ns1Positive,
    igmPositive,
    iggPositive,
  };
}
