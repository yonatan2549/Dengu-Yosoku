import { searchHealthKnowledge, type HealthKnowledgeResult, validateKnowledgeQuery } from "./knowledge";

export type HealthQueryIntent = "emergency-warning" | "personal-medical" | "general-education";
export type HealthSafetyLevel = "urgent" | "caution" | "education" | "no-evidence";

export interface HealthEvidencePackage {
  mode: "evidence-only";
  generatedAnswer: false;
  intent: HealthQueryIntent;
  safetyLevel: HealthSafetyLevel;
  safetyMessage: string;
  abstained: boolean;
  query: string;
  results: HealthKnowledgeResult[];
  citations: Array<{
    id: string;
    title: string;
    publisher: string;
    publishedAt: string;
    sourceUrl: string;
    reviewStatus: "awaiting_clinical_review";
  }>;
  message: string;
}

const EMERGENCY_PATTERNS = [
  /ปวดท้อง(?:รุนแรง|มาก|อย่างรุนแรง)|ท้อง(?:ปวด|เจ็บ)รุนแรง|severe abdominal pain/i,
  /อาเจียน(?:ต่อเนื่อง|ไม่หยุด|หลายครั้ง)|vomit(?:ing)? persistently|persistent vomiting/i,
  /(?:เลือดออกจาก(?:จมูก|เหงือก|ช่องคลอด|ทางเดินอาหาร)|เลือดออกตามไรฟัน|เลือดกำเดา|อาเจียนเป็นเลือด|ถ่าย(?:เป็น)?เลือด|เลือดในอาเจียน|เลือดในอุจจาระ|mucosal bleeding|blood in (?:vomit|stool)|nose or gum bleeding)/i,
  /หายใจ(?:เร็ว|ลำบาก|ไม่ออก)|หอบเหนื่อย|rapid breathing|respiratory distress|difficulty breathing/i,
  /ซึมมาก|สับสน|ปลุกไม่ตื่น|กระสับกระส่ายมาก|ผิว(?:ซีด|เย็น)|ตัวเย็นซีด|cold clammy|altered mental status/i,
];

const PERSONAL_MEDICAL_PATTERNS = [
  // Do not use JavaScript \b around Thai pronouns: Thai letters are non-word
  // characters to the ASCII-oriented \w/\b boundary rules.
  /(?:ฉัน|ผม|ดิฉัน|หนู|เรา|ลูก(?:ของฉัน)?|ลูกชาย|ลูกสาว|แม่(?:ของฉัน)?|พ่อ(?:ของฉัน)?|คุณแม่|คุณพ่อ|สามี|ภรรยา|แฟน(?:ของฉัน)?).{0,45}(?:มีอาการ|มีไข้|ไข้สูง|เริ่มมีไข้|เป็นไข้|ป่วย|ผลเลือด|ผลตรวจ|platelet|เกล็ดเลือด|hct|hematocrit)/i,
  /(?:ฉัน|ผม|ดิฉัน|หนู|เรา).{0,30}(?:ควร|ต้อง)กินยา|ยาอะไรดี|กินยาอะไร|ขนาดยา|ปริมาณยา|dosage|dose for me/i,
  /(?:ผลเลือด|ผลตรวจ|platelet|เกล็ดเลือด|hct|hematocrit).{0,35}(?:ของฉัน|ของผม|ของหนู|ของลูก)|(?:ของฉัน|ของผม|ของหนู|ของลูก).{0,35}(?:ผลเลือด|ผลตรวจ|platelet|เกล็ดเลือด|hct|hematocrit)/i,
  /วินิจฉัย(?:ให้|ว่า)?|(?:เป็น|มี)ไข้เลือดออก(?:ไหม|หรือไม่)|ฉันเป็น(?:ไข้เลือดออก|dengue)|ผลตรวจของฉัน|ช่วยแปลผลเลือด|รักษา(?:ฉัน|ลูก|ผู้ป่วย)/i,
  /(?:my|my child|my baby|my patient).{0,35}(?:symptom|fever|platelet|hematocrit|test result|medicine|medication)/i,
];

export function classifyHealthQuery(query: string): HealthQueryIntent {
  if (EMERGENCY_PATTERNS.some((pattern) => pattern.test(query))) return "emergency-warning";
  if (PERSONAL_MEDICAL_PATTERNS.some((pattern) => pattern.test(query))) return "personal-medical";
  return "general-education";
}

export function buildHealthEvidencePackage(query: string): HealthEvidencePackage {
  const validation = validateKnowledgeQuery({ query });
  if (!validation.ok) throw new Error(validation.error);

  const normalizedQuery = validation.query;
  const intent = classifyHealthQuery(normalizedQuery);
  const results = searchHealthKnowledge(normalizedQuery, 5);
  const citations = results.map((result) => ({
    id: result.id,
    title: result.title,
    publisher: result.publisher,
    publishedAt: result.publishedAt,
    sourceUrl: result.sourceUrl,
    reviewStatus: result.reviewStatus,
  }));

  if (intent === "emergency-warning") {
    return {
      mode: "evidence-only",
      generatedAnswer: false,
      intent,
      safetyLevel: "urgent",
      safetyMessage: "หากคุณหรือคนใกล้ชิดกำลังมีอาการรุนแรงตามที่ค้นหา ให้ไปโรงพยาบาลหรือห้องฉุกเฉินทันที อย่ารอคำตอบจากระบบนี้ การแจ้งเตือนนี้เป็นข้อความเพื่อความปลอดภัย ไม่ใช่การวินิจฉัย",
      abstained: true,
      query: normalizedQuery,
      results,
      citations,
      message: results.length
        ? "แสดงเอกสารอ้างอิงเพื่ออ่านเพิ่มเติม แต่ไม่ใช้ผลค้นหาแทนการเข้ารับการประเมินฉุกเฉิน"
        : "ไม่พบเอกสารตรงคำค้น แต่คำแนะนำเพื่อความปลอดภัยยังคงมีผลเมื่อมีอาการรุนแรง",
    };
  }

  if (intent === "personal-medical") {
    return {
      mode: "evidence-only",
      generatedAnswer: false,
      intent,
      safetyLevel: "caution",
      safetyMessage: "ระบบนี้ไม่สามารถวินิจฉัย แปลผลตรวจเฉพาะบุคคล เลือกยา หรือกำหนดขนาดยาได้ โปรดปรึกษาบุคลากรทางการแพทย์ และนำผลตรวจฉบับเต็มพร้อมวันเริ่มอาการไปประกอบการประเมิน",
      abstained: true,
      query: normalizedQuery,
      results,
      citations,
      message: results.length
        ? "พบเอกสารความรู้ทั่วไป แต่ระบบงดสรุปคำแนะนำเฉพาะบุคคล"
        : "ยังไม่พบหลักฐานในคลังความรู้ที่ตรงกับคำค้น จึงงดให้ข้อสรุป",
    };
  }

  if (results.length === 0) {
    return {
      mode: "evidence-only",
      generatedAnswer: false,
      intent,
      safetyLevel: "no-evidence",
      safetyMessage: "ยังไม่พบเอกสารอ้างอิงที่ตรงกับคำค้น ระบบจึงงดสร้างหรือคาดเดาคำตอบ",
      abstained: true,
      query: normalizedQuery,
      results,
      citations,
      message: "ลองใช้คำค้นเกี่ยวกับไข้เลือดออก อาการเตือน การตรวจ NS1/IgM/IgG หรือการป้องกันยุงลาย",
    };
  }

  return {
    mode: "evidence-only",
    generatedAnswer: false,
    intent,
    safetyLevel: "education",
    safetyMessage: "แสดงเฉพาะเอกสารและประเด็นจากคลังความรู้ ยังไม่มีการสังเคราะห์เป็นคำตอบโดย AI และเอกสารทั้งหมดรอผู้เชี่ยวชาญทบทวน",
    abstained: true,
    query: normalizedQuery,
    results,
    citations,
    message: "พบเอกสารที่เกี่ยวข้อง โปรดเปิดอ่านต้นฉบับ ตรวจวันที่ และพิจารณาขอบเขตการใช้งาน",
  };
}
