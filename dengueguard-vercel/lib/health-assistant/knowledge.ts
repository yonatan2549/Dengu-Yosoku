export type KnowledgeCategory = "overview" | "warning-signs" | "testing" | "care" | "prevention";

export interface ProjectKnowledgeApproval {
  status: "approved";
  scope: "academic-demonstration-only";
  approvedAt: string;
  approvedBy: "project-owner";
}

export interface HealthKnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  sourceType: string;
  reviewStatus: "awaiting_clinical_review";
  projectApproval: ProjectKnowledgeApproval;
  keywords: string[];
  keyPoints: string[];
}

export interface HealthKnowledgeResult {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  keyPoints: string[];
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  sourceType: string;
  reviewStatus: "awaiting_clinical_review";
  projectApproval: ProjectKnowledgeApproval;
  relevance: number;
}

export const HEALTH_KNOWLEDGE: HealthKnowledgeDocument[] = [
  {
    id: "who-arboviral-guideline-2025",
    category: "overview",
    title: "WHO guidelines for clinical management of arboviral diseases (2025)",
    summary: "แนวทาง WHO ปี 2025 ครอบคลุมการดูแลผู้ป่วยที่สงสัยหรือยืนยันโรคจาก arbovirus รวมถึง Dengue โดยแยกบริบทผู้ป่วยที่ดูแลแบบผู้ป่วยนอกและผู้ป่วยที่ต้องรับไว้ในสถานพยาบาล ใช้เป็นเอกสารอ้างอิงสำหรับบุคลากรสุขภาพและผู้กำหนดแนวทาง ไม่ใช่เครื่องมือให้ประชาชนวินิจฉัยตนเอง",
    publisher: "World Health Organization",
    publishedAt: "2025-07-04",
    sourceUrl: "https://www.who.int/publications/i/item/9789240111110",
    sourceType: "Clinical guideline",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["ไข้เลือดออก", "เดงกี", "dengue", "แนวทาง", "การดูแล", "clinical management", "arboviral", "ผู้ป่วยนอก", "โรงพยาบาล"],
    keyPoints: [
      "เป็นแนวทางสำหรับบุคลากรสุขภาพในการดูแลผู้ป่วยที่สงสัยหรือยืนยันโรค arboviral รวมถึง Dengue",
      "ครอบคลุมการดูแลทั้งผู้ป่วยนอกและผู้ป่วยที่ต้องรับไว้ในสถานพยาบาล",
      "การนำไปใช้ในประเทศไทยควรอ่านร่วมกับแนวทางระดับชาติและการทบทวนโดยผู้เชี่ยวชาญในประเทศ",
    ],
  },
  {
    id: "cdc-clinical-care-2026",
    category: "warning-signs",
    title: "Clinical Care of Dengue (CDC, updated 15 April 2026)",
    summary: "CDC อธิบายสัญญาณเตือนของ Dengue และการดูแลตามกลุ่มความรุนแรง รวมถึงข้อควรระวังเมื่อมีอาการปวดท้องรุนแรง อาเจียนต่อเนื่อง เลือดออก ซึมหรือกระสับกระส่าย และภาวะหายใจลำบาก ข้อมูลนี้เป็นแนวทางสำหรับบุคลากรสุขภาพ ไม่ใช่การประเมินผู้ป่วยโดย AI",
    publisher: "US Centers for Disease Control and Prevention",
    publishedAt: "2026-04-15",
    sourceUrl: "https://www.cdc.gov/dengue/hcp/clinical-care/",
    sourceType: "Clinical guidance",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["สัญญาณเตือน", "อาการอันตราย", "ปวดท้อง", "อาเจียน", "เลือดออก", "ซึม", "กระสับกระส่าย", "หายใจลำบาก", "warning signs", "severe dengue", "clinical care"],
    keyPoints: [
      "สัญญาณเตือนที่ CDC ระบุรวมถึงปวดท้องรุนแรงหรือกดเจ็บ อาเจียนต่อเนื่อง เลือดออกจากเยื่อบุ และการเปลี่ยนแปลงของระดับความรู้สึกตัว",
      "ผู้ป่วยที่มีสัญญาณเตือนหรือสงสัยไข้เลือดออกรุนแรงควรได้รับการประเมินในสถานพยาบาลโดยเร่งด่วน",
      "การติดตามและการให้สารน้ำเป็นการตัดสินใจทางคลินิกที่ต้องอาศัยการประเมินผู้ป่วยและผลตรวจต่อเนื่อง",
    ],
  },
  {
    id: "cdc-dengue-testing-2025",
    category: "testing",
    title: "Clinical Testing Guidance for Dengue (CDC, 26 August 2025)",
    summary: "CDC สรุปการเลือกตรวจ Dengue ตามช่วงเวลาหลังเริ่มมีอาการ โดยแยกการตรวจระยะเฉียบพลันและระยะหลังจากนั้น พร้อมข้อจำกัดในการแปลผล NAAT, NS1, IgM และ IgG ผลตรวจแต่ละชนิดต้องตีความร่วมกับวันเริ่มป่วย ประวัติ และการประเมินโดยบุคลากรสุขภาพ",
    publisher: "US Centers for Disease Control and Prevention",
    publishedAt: "2025-08-26",
    sourceUrl: "https://www.cdc.gov/dengue/hcp/diagnosis-testing/",
    sourceType: "Laboratory testing guidance",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["ตรวจเลือด", "ผลเลือด", "NS1", "NAAT", "PCR", "IgM", "IgG", "CBC", "platelet", "เกล็ดเลือด", "hematocrit", "ฮีมาโตคริต", "laboratory", "diagnosis", "testing"],
    keyPoints: [
      "การเลือกตรวจขึ้นกับจำนวนวันหลังเริ่มมีอาการและบริบททางคลินิก",
      "การตรวจ NAAT หรือ NS1 ใช้ประกอบการตรวจระยะเฉียบพลัน ส่วนการตรวจ IgM มีบทบาทตามช่วงเวลาของโรค",
      "ผล IgG จากตัวอย่างเดียวไม่ควรใช้ยืนยันการติดเชื้อ Dengue เฉียบพลัน",
    ],
  },
  {
    id: "who-lab-testing-2025",
    category: "testing",
    title: "Laboratory testing for dengue virus: interim guidance (WHO, April 2025)",
    summary: "เอกสาร WHO ปี 2025 ให้กรอบการตรวจทางห้องปฏิบัติการเพื่อสนับสนุนการจำแนกการติดเชื้อ Dengue โดยกล่าวถึงการตรวจสารพันธุกรรมไวรัส แอนติเจน NS1 และการตรวจแอนติบอดี การแปลผลต้องคำนึงถึงช่วงเวลาการเก็บตัวอย่างและความเป็นไปได้ของการติดเชื้อ flavivirus อื่น",
    publisher: "World Health Organization",
    publishedAt: "2025-04",
    sourceUrl: "https://iris.who.int/bitstream/handle/10665/381187/B09394-eng.pdf?sequence=1",
    sourceType: "Interim laboratory guidance",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["ห้องปฏิบัติการ", "ตรวจวินิจฉัย", "NAAT", "NS1", "IgM", "IgG", "แอนติบอดี", "แอนติเจน", "laboratory", "serology", "PCR"],
    keyPoints: [
      "การเลือกวิธีตรวจควรสัมพันธ์กับระยะเวลาของการเจ็บป่วยและช่วงเวลาที่เก็บตัวอย่าง",
      "ต้องพิจารณาข้อจำกัดของการตรวจแอนติบอดีและการเกิดปฏิกิริยาข้ามกับ flavivirus อื่น",
      "ผลตรวจทางห้องปฏิบัติการต้องแปลผลร่วมกับอาการและประวัติทางระบาดวิทยา",
    ],
  },
  {
    id: "ddc-dengue-guidelines-portal",
    category: "overview",
    title: "แนวทางและคู่มือปฏิบัติงานโรคไข้เลือดออก (กรมควบคุมโรค)",
    summary: "หน้ารวมเอกสารทางการของกองโรคติดต่อนำโดยแมลง กรมควบคุมโรค รวมถึงแนวทางการวินิจฉัยและดูแลรักษาผู้ป่วยโรคไข้เลือดออกฉบับย่อ พ.ศ. 2566 และมาตรการเฝ้าระวัง ป้องกัน และควบคุมโรค เอกสารแต่ละฉบับมีปีและขอบเขตต่างกัน จึงต้องเปิดตรวจฉบับเต็มและเลือกใช้ฉบับที่เหมาะสมกับบริบท",
    publisher: "กรมควบคุมโรค กระทรวงสาธารณสุข",
    publishedAt: "หน้าแหล่งรวมเอกสาร · ตรวจสอบฉบับและวันที่จากต้นทาง",
    sourceUrl: "https://ddc.moph.go.th/dvb/pagecontent.php?page=17",
    sourceType: "Thai national guidelines directory",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["กรมควบคุมโรค", "ไทย", "แนวทางประเทศไทย", "คู่มือ", "แนวทาง", "DHF", "ระบาดวิทยา", "มาตรการ", "แนวทางดูแลรักษา", "คู่มือปฏิบัติงาน"],
    keyPoints: [
      "เป็นหน้ารวมเอกสารทางการเกี่ยวกับโรคไข้เลือดออกของกรมควบคุมโรค",
      "รายการเอกสารมีทั้งแนวทางฉบับย่อ พ.ศ. 2566 และมาตรการเฝ้าระวัง ป้องกัน และควบคุมโรคที่มีปีเผยแพร่แตกต่างกัน",
      "ก่อนนำไปใช้ต้องเปิดเอกสารต้นฉบับ ตรวจปีเผยแพร่ ขอบเขต และสถานะการปรับปรุง",
    ],
  },
  {
    id: "who-dengue-fact-sheet",
    category: "prevention",
    title: "Dengue and severe dengue (WHO fact sheet)",
    summary: "เอกสารภาพรวมของ WHO เกี่ยวกับการติดต่อ อาการ การป้องกัน และภาวะ Dengue รุนแรง เหมาะสำหรับความรู้พื้นฐานของประชาชน โดยรายละเอียดด้านการดูแลผู้ป่วยควรใช้แนวทางฉบับใหม่และคำแนะนำจากบุคลากรสุขภาพร่วมด้วย",
    publisher: "World Health Organization",
    publishedAt: "เว็บเพจ WHO · โปรดตรวจวันที่ปรับปรุงจากต้นทาง",
    sourceUrl: "https://www.who.int/news-room/questions-and-answers/item/dengue-and-severe-dengue",
    sourceType: "Public health information",
    reviewStatus: "awaiting_clinical_review",
    projectApproval: { status: "approved", scope: "academic-demonstration-only", approvedAt: "2026-11-21", approvedBy: "project-owner" },
    keywords: ["ความรู้พื้นฐาน", "การติดต่อ", "ยุงลาย", "ป้องกัน", "ไข้เลือดออก", "dengue", "severe dengue", "mosquito", "prevention"],
    keyPoints: [
      "Dengue ติดต่อผ่านยุงลายที่มีเชื้อไวรัส",
      "อาการรุนแรงและสัญญาณเตือนต้องได้รับการประเมินทางการแพทย์โดยเร็ว",
      "การป้องกันยุงกัดและลดแหล่งเพาะพันธุ์ยุงเป็นส่วนสำคัญของการป้องกันโรค",
    ],
  },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase("th-TH").normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}

function categoryFromQuery(query: string): KnowledgeCategory[] {
  const text = query.toLocaleLowerCase("th-TH");
  const categories: KnowledgeCategory[] = [];
  if (/เตือน|อันตราย|ปวดท้อง|อาเจียน|เลือดออก|ซึม|shock|warning|severe/.test(text)) categories.push("warning-signs");
  if (/ns1|naat|pcr|igm|igg|cbc|platelet|เกล็ดเลือด|ฮีมาโตคริต|ตรวจ|ผลเลือด|laboratory/.test(text)) categories.push("testing");
  if (/ป้องกัน|ยุง|กัด|แหล่งเพาะพันธุ์|prevention/.test(text)) categories.push("prevention");
  if (/รักษา|ดูแล|ยา|care|management/.test(text)) categories.push("care");
  if (/ไข้เลือดออก|เดงกี|dengue|อาการ|ระยะ/.test(text)) categories.push("overview");
  return categories;
}

export function searchHealthKnowledge(query: string, limit = 5): HealthKnowledgeResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];
  const derivedCategories = categoryFromQuery(query);
  const phraseTerms = HEALTH_KNOWLEDGE.flatMap((document) => document.keywords)
    .map(normalize)
    .filter((keyword) => keyword.length >= 2 && normalizedQuery.includes(keyword));
  const words = Array.from(new Set([
    ...normalizedQuery.split(" ").filter((word) => word.length >= 2),
    ...phraseTerms,
  ]));
  const results = HEALTH_KNOWLEDGE.map((document) => {
    const title = normalize(document.title);
    const summary = normalize(document.summary);
    const keywords = document.keywords.map(normalize);
    const categoryBoost = derivedCategories.includes(document.category) ? 4 : 0;
    let score = categoryBoost;
    if (title.includes(normalizedQuery)) score += 8;
    if (summary.includes(normalizedQuery)) score += 4;
    for (const word of words) {
      if (keywords.some((keyword) => keyword.includes(word) || word.includes(keyword))) score += 3;
      if (title.includes(word)) score += 2;
      if (summary.includes(word)) score += 1;
    }
    return { document, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, "th"));

  return results.slice(0, Math.max(1, Math.min(limit, 8))).map(({ document, score }) => ({
    id: document.id,
    category: document.category,
    title: document.title,
    summary: document.summary,
    keyPoints: document.keyPoints,
    publisher: document.publisher,
    publishedAt: document.publishedAt,
    sourceUrl: document.sourceUrl,
    sourceType: document.sourceType,
    reviewStatus: document.reviewStatus,
    projectApproval: document.projectApproval,
    relevance: score,
  }));
}

export function validateKnowledgeQuery(value: unknown): { ok: true; query: string } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "รูปแบบคำขอไม่ถูกต้อง" };
  }
  const query = (value as { query?: unknown }).query;
  if (typeof query !== "string") return { ok: false, error: "กรุณาระบุคำค้นหา" };
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: false, error: "คำค้นหาต้องมีอย่างน้อย 2 ตัวอักษร" };
  if (trimmed.length > 500) return { ok: false, error: "คำค้นหาต้องไม่เกิน 500 ตัวอักษร" };
  return { ok: true, query: trimmed };
}
