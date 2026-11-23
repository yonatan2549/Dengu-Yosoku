"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Info, RotateCcw, ShieldAlert } from "lucide-react";
import { useDengueData } from "@/components/DataProvider";
import { evaluateAssessmentRules } from "@/lib/assessment/engine";
import type { QuestionRow, RecommendationRow, RuleRow } from "@/lib/types";

const PAGE_CONFIG = [
  { label: "1", title: "สถานะไข้และระยะเวลาป่วย", sections: ["fever"] },
  { label: "2–7", title: "อาการและข้อมูลประกอบการประเมิน", sections: ["symptoms", "warning", "emergency", "exposure", "personal", "hydration"] },
  { label: "8", title: "ผลตรวจทางห้องปฏิบัติการ", sections: ["lab"] },
];

const SECTION_HELP: Record<string, { tone: string; text: string }> = {
  warning: { tone: "warning", text: "รายการนี้เป็นสัญญาณเตือนที่ต้องประเมินเร่งด่วนในผู้ที่สงสัย/ยืนยันไข้เลือดออก แต่การเลือกอาการเพียงข้อเดียวไม่ได้ยืนยันว่าเป็นไข้เลือดออก ควรไปโรงพยาบาลเพื่อประเมินโดยเร็ว" },
  emergency: { tone: "danger", text: "อาการเหล่านี้อาจเป็นภาวะฉุกเฉินจากหลายสาเหตุ ไม่จำเพาะต่อไข้เลือดออก หากเกิดขึ้นให้ไปห้องฉุกเฉินทันที ไม่ต้องรอผลแบบประเมิน" },
  lab: { tone: "info", text: "กรอกเฉพาะผลที่มีจากสถานพยาบาล หากไม่ได้ตรวจสามารถเลือก ‘ไม่ได้ตรวจ / ไม่ทราบ’ หรือเว้นช่องตัวเลขว่าง ผลตรวจต้องแปลร่วมกับวันเริ่มป่วย วิธีตรวจ และบริบททางคลินิก" },
};

const NUMERIC_FIELDS = new Set(["temperature_c", "platelet_current", "platelet_previous", "hct_current", "hct_previous", "wbc_current"]);

function getRec(recommendations: RecommendationRow[], group: string, code: string) {
  return recommendations.find((item) => item.group_code === group && item.result_code === code);
}

function RecommendationCard({ item, tone = "info" }: { item?: RecommendationRow; tone?: string }) {
  if (!item) return <div className="result-card info"><strong>ไม่พบข้อความคำแนะนำ</strong><p>กรุณาตรวจสอบไฟล์ recommendations.csv</p></div>;
  return <div className={`result-card ${tone}`}><strong>{item.title_th}</strong><p>{item.message_th}</p><div><b>คำแนะนำ:</b> {item.action_th}</div></div>;
}

function parseOptionalNumber(value: string | boolean | undefined, label: string, min: number, max: number) {
  if (value === undefined || value === "") return { number: null as number | null, error: null as string | null };
  const parsed = Number(String(value).replaceAll(",", "").trim());
  if (!Number.isFinite(parsed)) return { number: null, error: `${label}: กรุณากรอกเป็นตัวเลขเท่านั้น` };
  if (parsed < min) return { number: null, error: `${label}: ค่าต่ำกว่าช่วงที่รับได้` };
  if (parsed > max) return { number: null, error: `${label}: ค่าสูงกว่าช่วงที่รับได้` };
  return { number: parsed, error: null };
}

export default function SymptomCheckerPage() {
  const { data } = useDengueData();
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [showResults, setShowResults] = useState(false);
  const [navigationError, setNavigationError] = useState("");

  const sortedQuestions = useMemo(() => data ? [...data.questions].sort((a, b) => a.section_order - b.section_order || a.question_order - b.question_order) : [], [data]);
  const currentPage = PAGE_CONFIG[pageIndex];
  const questionsForPage = sortedQuestions.filter((question) => currentPage.sections.includes(question.section_id));
  const optionsFor = (key: string) => data?.options.filter((option) => option.options_key === key).sort((a, b) => a.display_order - b.display_order) ?? [];

  if (!data) return null;

  function update(field: string, value: string | boolean) {
    setAnswers((previous) => ({ ...previous, [field]: value }));
  }

  function nextPage() {
    setNavigationError("");
    if (pageIndex === 0) {
      if (!answers.fever_status) {
        setNavigationError("กรุณาระบุสถานะการมีไข้ก่อนดำเนินการต่อ");
        return;
      }
      if (["fever_now", "fever_reduced"].includes(String(answers.fever_status)) && !answers.illness_onset) {
        setNavigationError("กรุณาระบุระยะเวลาตั้งแต่เริ่มป่วย");
        return;
      }
    }
    if (pageIndex === PAGE_CONFIG.length - 1) {
      const numericSpecs: Array<[string, number, number, string]> = [
        ["temperature_c", 30, 45, "อุณหภูมิร่างกาย"],
        ["platelet_current", 0, 2000000, "Platelet ปัจจุบัน"],
        ["platelet_previous", 0, 2000000, "Platelet ครั้งก่อน"],
        ["hct_current", 0, 100, "Hct ปัจจุบัน"],
        ["hct_previous", 0, 100, "Hct ครั้งก่อน"],
        ["wbc_current", 0, 200000, "WBC ปัจจุบัน"],
      ];
      const numericErrors = numericSpecs
        .map(([key, minimum, maximum, label]) => parseOptionalNumber(answers[key], label, minimum, maximum).error)
        .filter((error): error is string => Boolean(error));
      if (numericErrors.length) {
        setNavigationError(numericErrors.join(" · "));
        return;
      }
    }

    if (pageIndex < PAGE_CONFIG.length - 1) setPageIndex((value) => value + 1);
    else setShowResults(true);
  }

  function previousPage() {
    setNavigationError("");
    setPageIndex((value) => Math.max(0, value - 1));
  }

  function reset() {
    setAnswers({});
    setPageIndex(0);
    setShowResults(false);
    setNavigationError("");
  }

  const result = showResults ? buildAssessment(answers, data.rules) : null;
  const step = showResults ? 3 : pageIndex;

  return (
    <div className="page-stack symptom-page">
      <section className="page-heading-row">
        <div><div className="eyebrow">DENGUE SYMPTOM CHECKER</div><h1>ประเมินอาการเบื้องต้น</h1><p>คัดกรองอาการ ข้อมูลความเสี่ยง และผลตรวจทางห้องปฏิบัติการ</p></div>
        <div className="heading-icon-card"><ClipboardCheck size={58} strokeWidth={1.35} /><span>SCREENING</span></div>
      </section>
      <div className="screening-disclaimer"><ShieldAlert size={19} /><span>แบบประเมินนี้ให้ข้อมูลเบื้องต้น ไม่ใช่เครื่องมือวินิจฉัย หากมีอาการฉุกเฉินควรไปโรงพยาบาลทันทีโดยไม่ต้องรอกรอกแบบสอบถาม</span></div>

      <section className="wizard-panel panel">
        <div className="wizard-progress-row">
          <div><span className="eyebrow">STEP {step + 1} OF 4</span><strong>{showResults ? "ผลการประเมิน" : currentPage.title}</strong></div>
          <span className="wizard-step-count">{showResults ? "ผล" : currentPage.label} / ผล</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
        <div className="wizard-stepper">
          {PAGE_CONFIG.map((page, index) => <div className={`wizard-step ${index < pageIndex || showResults ? "complete" : index === pageIndex && !showResults ? "active" : ""}`} key={page.label}><span>{index < pageIndex || showResults ? <CheckCircle2 size={15} /> : index + 1}</span><small>{page.label}</small></div>)}
          <div className={`wizard-step ${showResults ? "active" : ""}`}><span>{showResults ? <CheckCircle2 size={15} /> : 4}</span><small>ผล</small></div>
        </div>

        {!showResults ? (
          <>
            <div className="wizard-page-heading"><div className="eyebrow">ส่วน {currentPage.label}</div><h2>{currentPage.title}</h2>{pageIndex === 1 && <p>คำถามข้อ 2–7 อยู่ในหน้านี้ทั้งหมด สามารถเลื่อนลงเพื่อตอบแต่ละหมวดได้</p>}{pageIndex === 2 && <p>กรอกผลตรวจที่มีจากสถานพยาบาลเท่านั้น หากไม่มีผลตรวจสามารถข้ามหน้านี้ได้</p>}</div>
            <div className="questionnaire-sections">
              {currentPage.sections.map((sectionId) => {
                const sectionQuestions = questionsForPage.filter((question) => question.section_id === sectionId);
                if (!sectionQuestions.length) return null;
                const sectionTitle = sectionQuestions[0].section_title;
                const help = SECTION_HELP[sectionId];
                return (
                  <section className="question-section" key={sectionId}>
                    <div className="question-section-heading"><span className="section-number">{sectionQuestions[0].section_order.toString().padStart(2, "0")}</span><h3>{sectionTitle}</h3></div>
                    {help && <div className={`inline-callout ${help.tone}`}><Info size={17} /><span>{help.text}</span></div>}
                    <div className="question-list">
                      {sectionQuestions.map((question) => {
                        if (question.field_key === "illness_onset" && answers.fever_status === "no_fever_7d") return null;
                        return <QuestionField key={question.field_key} question={question} value={answers[question.field_key]} options={optionsFor(question.options_key)} onChange={update} />;
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            {navigationError && <div className="form-error"><AlertCircle size={17} />{navigationError}</div>}
            <div className="wizard-actions">
              <div>{pageIndex > 0 && <button className="button button-secondary" onClick={previousPage}><ArrowLeft size={16} /> ย้อนกลับ</button>}</div>
              <button className="button button-primary" onClick={nextPage}>{pageIndex === PAGE_CONFIG.length - 1 ? "ประเมินผล" : "ถัดไป"} <ArrowRight size={16} /></button>
            </div>
          </>
        ) : (
          <AssessmentResults result={result!} answers={answers} data={data} onReset={reset} />
        )}
      </section>
    </div>
  );
}

function QuestionField({ question, value, options, onChange }: {
  question: QuestionRow;
  value: string | boolean | undefined;
  options: { option_value: string; option_label: string }[];
  onChange: (field: string, value: string | boolean) => void;
}) {
  const required = question.required === "yes";
  const field = question.field_key;
  return (
    <div className="question-field">
      {question.input_type !== "checkbox" && (
        <div className="question-label-row"><label className="question-label" htmlFor={`question-${field}`}>{question.question_th}{required && <span className="required-mark">*</span>}</label>{question.help_text && <span className="question-help">{question.help_text}</span>}</div>
      )}
      {question.input_type === "checkbox" ? (
        <div>
          <label className="checkbox-option"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(field, event.target.checked)} /><span className="custom-check" /><span>{question.question_th}</span></label>
          {question.help_text && <span className="question-help">{question.help_text}</span>}
        </div>
      ) : question.input_type === "radio" ? (
        <div className="radio-options">{options.map((option) => <label className={`radio-option ${value === option.option_value ? "selected" : ""}`} key={option.option_value}><input type="radio" name={field} value={option.option_value} checked={value === option.option_value} onChange={() => onChange(field, option.option_value)} /><span className="radio-dot" /><span>{option.option_label}</span></label>)}</div>
      ) : question.input_type === "select" ? (
        <select id={`question-${field}`} className="question-select" value={String(value ?? "")} onChange={(event) => onChange(field, event.target.value)}><option value="">{question.placeholder || "เลือกคำตอบ"}</option>{options.map((option) => <option value={option.option_value} key={option.option_value}>{option.option_label}</option>)}</select>
      ) : (
        <input id={`question-${field}`} className="question-input" type={NUMERIC_FIELDS.has(field) ? "number" : "text"} min={NUMERIC_FIELDS.has(field) ? 0 : undefined} max={field === "temperature_c" ? 45 : field.startsWith("hct") ? 100 : undefined} step={field === "temperature_c" || field.startsWith("hct") ? "0.1" : "1"} placeholder={question.placeholder || "กรอกข้อมูล (ถ้ามี)"} value={String(value ?? "")} onChange={(event) => onChange(field, event.target.value)} />
      )}
    </div>
  );
}

type AssessmentResult = {
  emergency: string[];
  warning: string[];
  hydration: string[];
  personal: string[];
  evidenceCode: string;
  urgencyCode: string;
  manifestations: number;
  numericValues: Record<string, number | null>;
  numericErrors: string[];
  clinicalPattern: boolean;
  naatPositive: boolean;
  ns1Positive: boolean;
  igmPositive: boolean;
  iggPositive: boolean;
  hasGeneralSymptoms: boolean;
  matchedUrgencyRules: RuleRow[];
  matchedEvidenceRules: RuleRow[];
  unsupportedConditions: string[];
  configurationIssues: string[];
  cbcTrend: boolean;
};

function buildAssessment(answers: Record<string, string | boolean>, rules: RuleRow[]): AssessmentResult {
  const numericSpecs: Record<string, [number, number, string]> = {
    temperature_c: [30, 45, "อุณหภูมิร่างกาย"],
    platelet_current: [0, 2000000, "Platelet ปัจจุบัน"],
    platelet_previous: [0, 2000000, "Platelet ครั้งก่อน"],
    hct_current: [0, 100, "Hct ปัจจุบัน"],
    hct_previous: [0, 100, "Hct ครั้งก่อน"],
    wbc_current: [0, 200000, "WBC ปัจจุบัน"],
  };
  const numericValues: Record<string, number | null> = {};
  const numericErrors: string[] = [];
  Object.entries(numericSpecs).forEach(([key, [min, max, label]]) => {
    const parsed = parseOptionalNumber(answers[key], label, min, max);
    numericValues[key] = parsed.number;
    if (parsed.error) numericErrors.push(parsed.error);
  });

  const emergencyLabels: Record<string, string> = {
    blood_in_vomit_stool: "อาเจียนเป็นเลือดหรือถ่ายอุจจาระเป็นเลือด/ดำคล้ายยางมะตอย",
    breathing_difficulty: "หายใจเร็วหรือหายใจลำบาก",
    cold_clammy_faint: "มือเท้าเย็น ตัวซีด เหงื่อออกเย็น หรือคล้ายจะเป็นลม",
    altered_consciousness: "สับสนมาก ปลุกไม่ตื่น ชัก หรือหมดสติ",
  };
  const warningLabels: Record<string, string> = {
    severe_abdominal: "ปวดท้องรุนแรงหรือกดเจ็บบริเวณท้อง",
    persistent_vomiting: "อาเจียนต่อเนื่องตามเกณฑ์ที่ระบุ",
    mucosal_bleeding: "มีเลือดออกตามเยื่อบุ",
    lethargy_restlessness: "ซึมลง อ่อนเพลียมากผิดปกติ หรือกระสับกระส่าย",
    fluid_accumulation: "ท้องโต/บวมใหม่ หรือได้รับแจ้งว่ามีของเหลวสะสม",
    hepatomegaly: "ได้รับแจ้งจากบุคลากรทางการแพทย์ว่าตับโต",
    hct_increase_reported: "ได้รับแจ้งว่า Hematocrit เพิ่มขึ้นต่อเนื่องจากผลตรวจอย่างน้อย 2 ครั้ง ห่างกันประมาณ 6 ชั่วโมง",
  };
  const checked = (value: string | boolean | undefined) => value === true || value === "true";
  const emergency = Object.entries(emergencyLabels).filter(([key]) => checked(answers[key])).map(([, label]) => label);
  const warning = Object.entries(warningLabels).filter(([key]) => checked(answers[key])).map(([, label]) => label);
  const hydration = [
    ["unable_to_drink", "ไม่สามารถดื่มน้ำหรือรับประทานอาหารได้ตามปกติ"],
    ["reduced_urine", "ปัสสาวะน้อยลงอย่างชัดเจน"],
    ["excessive_thirst", "กระหายน้ำมากผิดปกติ"],
  ].filter(([key]) => checked(answers[String(key)])).map(([, label]) => String(label));
  const personal = [
    ["pregnancy", "กำลังตั้งครรภ์"],
    ["chronic_disease", "มีโรคประจำตัว"],
    ["bleeding_disorder", "มีความผิดปกติของการแข็งตัวของเลือด/เลือดออกง่าย"],
    ["age_risk", "เป็นเด็กอายุต่ำกว่า 1 ปีหรือผู้สูงอายุตั้งแต่ 65 ปีขึ้นไป"],
  ].filter(([key]) => checked(answers[String(key)])).map(([, label]) => String(label));

  const evaluation = evaluateAssessmentRules(answers, rules);
  const fever = ["fever_now", "fever_reduced"].includes(String(answers.fever_status));
  const generalKeys = ["headache", "eye_pain", "myalgia", "nausea_vomiting", "rash", "fatigue", "poor_appetite", "petechiae", "abdominal_discomfort", "tourniquet_positive"];
  const hasGeneralSymptoms = generalKeys.some((key) => checked(answers[key]));

  return {
    emergency,
    warning,
    hydration,
    personal,
    evidenceCode: evaluation.evidenceCode,
    urgencyCode: evaluation.urgencyCode,
    manifestations: evaluation.manifestations,
    numericValues,
    numericErrors,
    clinicalPattern: evaluation.clinicalPattern,
    naatPositive: evaluation.naatPositive,
    ns1Positive: evaluation.ns1Positive,
    igmPositive: evaluation.igmPositive,
    iggPositive: evaluation.iggPositive,
    hasGeneralSymptoms,
    matchedUrgencyRules: evaluation.matchedUrgencyRules as RuleRow[],
    matchedEvidenceRules: evaluation.matchedEvidenceRules as RuleRow[],
    unsupportedConditions: evaluation.unsupportedConditions,
    configurationIssues: evaluation.configurationIssues,
    cbcTrend: evaluation.cbcTrend,
  };
}

function AssessmentResults({ result, answers, data, onReset }: {
  result: AssessmentResult;
  answers: Record<string, string | boolean>;
  data: NonNullable<ReturnType<typeof useDengueData>["data"]>;
  onReset: () => void;
}) {
  const urgency = getRec(data.recommendations, "urgency", result.urgencyCode);
  const evidence = getRec(data.recommendations, "dengue_evidence", result.evidenceCode);
  const other = getRec(data.recommendations, "other_cause", "OTHER_CAUSES_POSSIBLE");
  const tone = result.urgencyCode === "EMERGENCY" || result.urgencyCode === "DENGUE_WARNING" ? "danger" : result.urgencyCode === "HYDRATION_REVIEW" || result.urgencyCode === "FEVER_REVIEW" ? "warning" : "info";
  const value = (key: string) => result.numericValues[key];
  const feverLabels: Record<string, string> = { fever_now: "มีไข้ในขณะนี้", fever_reduced: "ไข้ลดลงหรือหายแล้วภายใน 48 ชั่วโมง", no_fever_7d: "ไม่มีไข้ในช่วง 7 วันที่ผ่านมา" };
  const onsetLabels: Record<string, string> = { day1: "วันนี้ (วันที่ 1)", day2_3: "2–3 วันที่ผ่านมา", day4_5: "4–5 วันที่ผ่านมา", day6_7: "6–7 วันที่ผ่านมา", over7: "มากกว่า 7 วันที่ผ่านมา", unknown: "ไม่แน่ใจ" };
  const positiveTests = [result.naatPositive && "RT-PCR/NAAT", result.ns1Positive && "NS1", result.igmPositive && "IgM", result.iggPositive && "IgG"].filter(Boolean) as string[];

  return (
    <div className="assessment-results">
      <div className="results-heading"><div className="result-check-icon"><CheckCircle2 size={24} /></div><div><div className="eyebrow">ASSESSMENT COMPLETE</div><h2>ผลการประเมินเบื้องต้น</h2><p>แสดงผลแยกตามความเร่งด่วนและข้อมูลที่สนับสนุนไข้เลือดออก</p></div></div>

      {(result.unsupportedConditions.length > 0 || result.configurationIssues.length > 0) && (
        <div className="inline-callout warning">
          <Info size={16} />
          <span>
            {result.configurationIssues.length > 0 && <>กฎประเมินที่จำเป็นยังไม่ครบ: {result.configurationIssues.join(", ")}. </>}
            {result.unsupportedConditions.length > 0 && <>พบเงื่อนไขที่ระบบยังไม่รองรับ: {result.unsupportedConditions.join(", ")}</>}
          </span>
        </div>
      )}

      <section className="result-section"><div className="result-section-title"><span>A</span><h3>ความเร่งด่วนในการรับการประเมิน</h3></div><RecommendationCard item={urgency} tone={tone} />
        {result.emergency.length > 0 && <ResultList title="อาการฉุกเฉินที่เลือก" items={result.emergency} tone="danger" />}
        {result.warning.length > 0 && <ResultList title="สัญญาณเตือนที่เลือก" items={result.warning} tone="warning" />}
        {result.hydration.length > 0 && <ResultList title="ข้อมูลด้านการดื่มน้ำ/ปัสสาวะ" items={result.hydration} tone="info" />}
        {result.personal.length > 0 && <ResultList title="ปัจจัยสุขภาพที่ควรแจ้งบุคลากรทางการแพทย์" items={result.personal} tone="info" />}
      </section>

      <section className="result-section"><div className="result-section-title"><span>B</span><h3>ระดับข้อมูลที่สนับสนุนความสงสัยไข้เลือดออก</h3></div><RecommendationCard item={evidence} tone={result.evidenceCode.startsWith("LAB_SUPPORT") ? "success" : result.evidenceCode === "PRESUMPTIVE_RECENT" || result.evidenceCode === "CLINICAL_SUSPICION" ? "warning" : "info"} />
        {result.matchedEvidenceRules.filter((rule) => rule.output_code !== result.evidenceCode).map((rule) => (
          <div className="inline-callout info" key={rule.rule_id}>
            <Info size={16} />
            <span><strong>{rule.output_code}</strong> · {rule.logic_summary_th}</span>
          </div>
        ))}
        {positiveTests.length > 0 && <div className="result-detail-box"><strong>รายการตรวจที่เป็นบวก</strong><p>{positiveTests.join(" · ")}</p>{result.naatPositive && <small>NAAT/RT-PCR Positive เป็นหลักฐานตรวจพบสารพันธุกรรมของไวรัสเดงกีในตัวอย่างที่ตรวจ</small>}{result.ns1Positive && <small>NS1 Positive สนับสนุนการติดเชื้อเดงกีระยะเฉียบพลัน ควรตรวจสอบวิธีตรวจและชุดตรวจ</small>}{result.ns1Positive && (!answers.ns1_method || answers.ns1_method === "unknown") && <small>ยังไม่ระบุวิธีตรวจ NS1: ควรตรวจสอบชื่อชุดตรวจและวิธีตรวจจากใบรายงาน</small>}{result.igmPositive && <small>IgM Positive เป็นหลักฐานแบบ presumptive recent infection และอาจเกิดปฏิกิริยาข้ามกับ flavivirus อื่น</small>}{result.iggPositive && <small>IgG จากตัวอย่างเดียวไม่ยืนยันการติดเชื้อเฉียบพลัน</small>}</div>}
        {answers.lab_timing === "day1_3" && answers.igm_result === "negative" && <div className="inline-callout info"><Info size={16} /><span>IgM อาจยังตรวจไม่พบในช่วงต้นของการป่วย ผล IgM ลบในช่วงนี้จึงไม่สามารถตัดไข้เลือดออกได้</span></div>}
        {["day1_3", "day4_7"].includes(String(answers.lab_timing)) && answers.ns1_result === "negative" && answers.naat_result === "negative" && <div className="inline-callout info"><Info size={16} /><span>ผล NS1/NAAT ลบไม่สามารถตัดไข้เลือดออกได้ทั้งหมด ควรให้แพทย์พิจารณาระยะเวลาป่วยและการตรวจเพิ่มเติม</span></div>}
      </section>

      <section className="result-section"><div className="result-section-title"><span>C</span><h3>ข้อมูล CBC ประกอบการประเมิน</h3></div>
        <div className="cbc-grid">{[["Platelet ปัจจุบัน", value("platelet_current"), "cells/µL"], ["Hct ปัจจุบัน", value("hct_current"), "%"], ["WBC ปัจจุบัน", value("wbc_current"), "cells/µL"]].map(([label, number, unit]) => <div className="cbc-value" key={String(label)}><span>{label}</span><strong>{number === null ? "ไม่ได้ระบุ" : `${Number(number).toLocaleString("th-TH")} ${unit}`}</strong></div>)}</div>
        {result.cbcTrend && result.evidenceCode !== "CBC_CONTEXT" && (
          <RecommendationCard
            item={getRec(data.recommendations, "dengue_evidence", "CBC_CONTEXT")}
            tone="info"
          />
        )}
        {result.numericErrors.map((error) => <div className="form-error" key={error}><AlertCircle size={16}/>{error}</div>)}
        {value("platelet_current") !== null && value("platelet_previous") !== null && <p className="cbc-note">Platelet {Number(value("platelet_current")) < Number(value("platelet_previous")) ? "ลดลง" : Number(value("platelet_current")) > Number(value("platelet_previous")) ? "เพิ่มขึ้น" : "เท่าเดิม"} เมื่อเทียบกับครั้งก่อน ควรประเมินร่วมกับช่วงอ้างอิงและอาการ</p>}
        {value("hct_current") !== null && value("hct_previous") !== null && <p className="cbc-note">Hct {Number(value("hct_current")) > Number(value("hct_previous")) ? "เพิ่มขึ้น" : Number(value("hct_current")) < Number(value("hct_previous")) ? "ลดลง" : "เท่าเดิม"} เมื่อเทียบกับครั้งก่อน ควรให้แพทย์แปลผลร่วมกับภาวะสารน้ำและผล CBC อื่น</p>}
        {answers.leukopenia_reported && <div className="inline-callout info"><Info size={16}/><span>มีการระบุ Leukopenia ในใบรายงาน ซึ่งเป็นข้อมูลประกอบที่ไม่จำเพาะต่อไข้เลือดออก</span></div>}
        <p className="panel-note">ระบบแสดงค่าที่กรอกและเปรียบเทียบแนวโน้มเบื้องต้นเท่านั้น ไม่ใช้ค่า CBC เดี่ยว ๆ เพื่อวินิจฉัยหรือจัดระดับความรุนแรง</p>
      </section>

      <section className="result-section"><div className="result-section-title"><span>D</span><h3>ข้อควรพิจารณาเกี่ยวกับสาเหตุอื่น</h3></div>
        {result.naatPositive || result.ns1Positive
          ? <div className="result-card info"><strong>ผลตรวจสนับสนุนการติดเชื้อเดงกี</strong><p>แบบสอบถามไม่สามารถประเมินภาวะร่วม หรือสาเหตุอื่นทั้งหมดได้ หากมีอาการผิดปกติที่ไม่สอดคล้องหรือรุนแรงขึ้น ให้แพทย์ประเมินเพิ่มเติม</p></div>
          : result.hasGeneralSymptoms || ["fever_now", "fever_reduced"].includes(String(answers.fever_status))
            ? <RecommendationCard item={other} tone="info" />
            : <div className="result-card info"><strong>ยังไม่มีข้อมูลสนับสนุนเพียงพอ</strong><p>ผลนี้ไม่สามารถยืนยันว่าไม่มีการติดเชื้อไข้เลือดออกหรือโรคอื่นได้</p></div>}
      </section>

      <section className="result-section"><div className="result-section-title"><span>E</span><h3>สรุปข้อมูลที่ได้รับ</h3></div>
        <div className="summary-list"><div><span>สถานะไข้</span><strong>{feverLabels[String(answers.fever_status)] ?? "ไม่ได้ระบุ"}</strong></div><div><span>ระยะเวลาตั้งแต่เริ่มป่วย</span><strong>{onsetLabels[String(answers.illness_onset)] ?? "ไม่ได้ระบุ"}</strong></div><div><span>จำนวนกลุ่มอาการที่เข้าได้กับเกณฑ์ช่วยคัดกรอง</span><strong>{result.manifestations} กลุ่ม</strong></div><div><span>ประวัติอยู่/เดินทางในพื้นที่แพร่เชื้อภายใน 14 วัน</span><strong>{answers.endemic_area ? "มี" : "ไม่ได้เลือก"}</strong></div></div>
      </section>

      <section className="result-section">
        <div className="result-section-title"><span>F</span><h3>คำแนะนำทั่วไปหลังการประเมิน</h3></div>
        {result.emergency.length > 0 || result.warning.length > 0 ? (
          <div className="inline-callout danger">
            <ShieldAlert size={17} />
            <span>ให้ปฏิบัติตามคำแนะนำให้ไปโรงพยาบาลข้างต้นก่อน ไม่ควรใช้การดูแลตนเองแทนการรักษา หากมีอาการฉุกเฉินและเดินทางเองไม่ปลอดภัย โทร 1669</span>
          </div>
        ) : (
          <div className="result-detail-box">
            <p>• พักผ่อนและดื่มน้ำตามความเหมาะสม หากไม่มีข้อจำกัดน้ำจากแพทย์</p>
            <p>• หากมีไข้และสงสัยไข้เลือดออก ให้ปรึกษาแพทย์หรือเภสัชกรเรื่องยาลดไข้ และหลีกเลี่ยง aspirin กับยา NSAIDs เช่น ibuprofen จนกว่าจะได้รับคำแนะนำทางการแพทย์</p>
            <p>• ป้องกันไม่ให้ยุงกัด เพื่อลดการแพร่เชื้อหากเป็นไข้เลือดออก</p>
            <p>• หากมีสัญญาณเตือนหรืออาการรุนแรงขึ้น ให้ไปโรงพยาบาลทันที</p>
          </div>
        )}
      </section>

      <details className="rules-details">
        <summary>ดูหลักเกณฑ์และแหล่งอ้างอิงที่ใช้ในการออกแบบ</summary>
        <div className="rules-list">{[...data.rules].sort((a, b) => a.priority - b.priority).map((rule) => <div key={rule.rule_id}><strong>{rule.rule_id} · {rule.logic_summary_th}</strong><p>{rule.clinical_note_th}</p>{rule.reference_url && <a href={rule.reference_url} target="_blank" rel="noreferrer">อ่านแหล่งอ้างอิง</a>}</div>)}</div>
      </details>
      <div className="final-disclaimer"><Info size={17}/><span>ผลนี้เป็นการคัดกรอง ไม่ใช่การวินิจฉัยหรือคะแนนความน่าจะเป็น ควรให้แพทย์/ผู้เชี่ยวชาญประเมินร่วมกับอาการ ระยะเวลาป่วย และผลตรวจทางห้องปฏิบัติการ</span></div>
      <div className="wizard-actions result-actions"><span /><button className="button button-primary" onClick={onReset}><RotateCcw size={16}/> ทำแบบประเมินใหม่</button></div>
    </div>
  );
}

function ResultList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return <div className={`result-list-box ${tone}`}><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
