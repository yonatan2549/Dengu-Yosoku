export interface DraftSourcePolicyCheck {
  id: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
}

export interface DraftSourcePolicyReport {
  allowed: boolean;
  checks: DraftSourcePolicyCheck[];
  sourceCount: number;
  passageCount: number;
  pendingClinicalReview: number;
  projectApprovalFailures: number;
  note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoDate(value: unknown): boolean {
  if (!nonEmpty(value) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasAcademicDemoApproval(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.status === "approved" &&
    value.scope === "academic-demonstration-only" &&
    value.approvedBy === "project-owner" &&
    isValidIsoDate(value.approvedAt);
}

function isHttpsUrl(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Checks provenance before a local draft answer is sent to an AI Provider.
 * Pending clinical review remains allowed only for the explicitly labelled
 * local preview path; this function never authorizes production generation.
 */
export function evaluateDraftSourcePolicy(
  sourcesInput: unknown,
  passagesInput: unknown,
): DraftSourcePolicyReport {
  const sources = Array.isArray(sourcesInput) ? sourcesInput : [];
  const passages = Array.isArray(passagesInput) ? passagesInput : [];
  const checks: DraftSourcePolicyCheck[] = [];
  const add = (id: string, status: DraftSourcePolicyCheck["status"], detail: string) => {
    checks.push({ id, status, detail });
  };
  const ids = new Set<string>();
  let duplicateIds = 0;
  let invalidSourceMetadata = 0;
  let pendingClinicalReview = 0;
  let projectApprovalFailures = 0;

  if (sources.length === 0) {
    add("sources-present", "blocked", "ไม่มีเอกสารหลักฐานให้ตรวจสอบ");
  } else {
    add("sources-present", "pass", `พบเอกสารอ้างอิง ${sources.length} รายการ`);
  }

  for (const raw of sources) {
    if (!isRecord(raw)) {
      invalidSourceMetadata += 1;
      continue;
    }
    const id = raw.id;
    if (!nonEmpty(id) || ids.has(id)) duplicateIds += 1;
    if (nonEmpty(id)) ids.add(id);

    const metadataValid = nonEmpty(raw.title) && nonEmpty(raw.publisher) &&
      nonEmpty(raw.publishedAt) && isHttpsUrl(raw.sourceUrl) &&
      (raw.reviewStatus === "awaiting_clinical_review" || raw.reviewStatus === "clinically_reviewed");
    if (!metadataValid) invalidSourceMetadata += 1;
    if (raw.reviewStatus === "awaiting_clinical_review") pendingClinicalReview += 1;
    if (!hasAcademicDemoApproval(raw.projectApproval)) projectApprovalFailures += 1;
  }

  add("unique-source-ids", duplicateIds === 0 ? "pass" : "blocked",
    duplicateIds === 0 ? "Document IDs ไม่ซ้ำและมีค่า" : `พบ ID ที่ว่างหรือซ้ำ ${duplicateIds} รายการ`);
  add("source-metadata", invalidSourceMetadata === 0 ? "pass" : "blocked",
    invalidSourceMetadata === 0
      ? "ชื่อ ผู้เผยแพร่ วันที่ URL HTTPS และสถานะทบทวนครบ"
      : `พบเอกสารที่ Metadata ไม่ครบหรือไม่ถูกต้อง ${invalidSourceMetadata} รายการ`);

  add("project-owner-approval", projectApprovalFailures === 0 ? "pass" : "blocked",
    projectApprovalFailures === 0
      ? "ทุกเอกสารได้รับอนุมัติจากเจ้าของโครงการสำหรับการศึกษา/สาธิตเท่านั้น"
      : `พบเอกสารที่ไม่มีการอนุมัติเพื่อการศึกษา/สาธิตครบถ้วน ${projectApprovalFailures} รายการ`);

  let invalidPassages = 0;
  for (const raw of passages) {
    if (!isRecord(raw)) {
      invalidPassages += 1;
      continue;
    }
    const documentId = raw.documentId;
    const matchingSource = nonEmpty(documentId)
      ? sources.find((source) => isRecord(source) && source.id === documentId)
      : undefined;
    const passageValid = Boolean(matchingSource && isRecord(matchingSource)) &&
      nonEmpty(raw.text) && nonEmpty(raw.sectionLabel) &&
      isHttpsUrl(raw.sourceUrl) &&
      isRecord(matchingSource) && raw.sourceUrl === matchingSource.sourceUrl &&
      raw.publisher === matchingSource.publisher &&
      raw.title === matchingSource.title &&
      raw.reviewStatus === matchingSource.reviewStatus;
    if (!passageValid) invalidPassages += 1;
  }
  add("passage-provenance", invalidPassages === 0 ? "pass" : "blocked",
    invalidPassages === 0
      ? `ข้อความที่ค้นคืน ${passages.length} รายการเชื่อมกับเอกสารต้นทางได้`
      : `พบข้อความ ${invalidPassages} รายการที่ไม่มีเอกสารต้นทางตรงกันหรือ Metadata ไม่ครบ`);

  if (pendingClinicalReview > 0) {
    add("clinical-review", "warning",
      `เอกสาร ${pendingClinicalReview}/${sources.length} รายการยังรอผู้เชี่ยวชาญทบทวน; ใช้ได้เฉพาะร่างเพื่อการศึกษาใน Local Preview`);
  } else if (sources.length > 0) {
    add("clinical-review", "pass", "ทุกเอกสารมีสถานะ clinically_reviewed; การเปิด Production ยังต้องผ่านนโยบายอนุมัติแยกต่างหาก");
  } else {
    add("clinical-review", "blocked", "ยังไม่มีเอกสารให้ตรวจสถานะทบทวน");
  }

  const allowed = sources.length > 0 && duplicateIds === 0 &&
    invalidSourceMetadata === 0 && invalidPassages === 0 && projectApprovalFailures === 0;
  return {
    allowed,
    checks,
    sourceCount: sources.length,
    passageCount: passages.length,
    pendingClinicalReview,
    projectApprovalFailures,
    note: "Source Policy ตรวจเฉพาะความครบถ้วนและความเชื่อมโยงของ Metadata ไม่ได้รับรองความถูกต้องทางคลินิก และไม่อนุญาตให้เปิด Production AI",
  };
}
