import { HEALTH_KNOWLEDGE } from "./knowledge";

export type KnowledgeGovernanceCheckStatus = "pass" | "warning" | "blocked";
export interface KnowledgeGovernanceCheck {
  id: string;
  label: string;
  status: KnowledgeGovernanceCheckStatus;
  detail: string;
}
export interface KnowledgeGovernanceDocument {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  sourceUrl: string;
  reviewStatus: string;
  reviewMetadataComplete: boolean;
  projectApprovalComplete: boolean;
}
export interface KnowledgeGovernanceReport {
  status: "ready-for-academic-demo" | "ready-for-review" | "blocked";
  productionAnswersAllowed: false;
  totalDocuments: number;
  projectOwnerApproved: number;
  awaitingClinicalReview: number;
  clinicallyReviewed: number;
  metadataIssues: number;
  duplicateIds: number;
  documents: KnowledgeGovernanceDocument[];
  checks: KnowledgeGovernanceCheck[];
  summary: string;
  note: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validHttpsUrl(value: unknown): boolean {
  if (!hasText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function completeProjectOwnerApproval(document: Record<string, unknown>): boolean {
  const approval = document.projectApproval;
  return record(approval) && approval.status === "approved" && approval.scope === "academic-demonstration-only" && approval.approvedBy === "project-owner" && validDate(approval.approvedAt);
}

function completeReviewMetadata(document: Record<string, unknown>): boolean {
  return document.reviewStatus === "clinically_reviewed" &&
    validDate(document.reviewedAt) && hasText(document.reviewedBy) && hasText(document.reviewReference);
}

export function evaluateHealthKnowledgeGovernance(input: unknown = HEALTH_KNOWLEDGE): KnowledgeGovernanceReport {
  const documents = Array.isArray(input) ? input : [];
  const checks: KnowledgeGovernanceCheck[] = [];
  const add = (id: string, label: string, status: KnowledgeGovernanceCheckStatus, detail: string) => checks.push({ id, label, status, detail });
  const ids = documents.map((item) => record(item) ? item.id : null).filter(hasText);
  const duplicateIds = ids.length - new Set(ids).size;
  const validDocumentRecords = documents.filter(record);
  const reviewed = validDocumentRecords.filter(completeReviewMetadata).length;
  const projectApproved = validDocumentRecords.filter(completeProjectOwnerApproval).length;
  const awaiting = validDocumentRecords.length - reviewed;
  let metadataIssues = 0;
  const mapped = documents.map((item) => {
    if (!record(item)) {
      metadataIssues += 1;
      return null;
    }
    const urlValid = validHttpsUrl(item.sourceUrl);
    const requiredText = [item.id, item.title, item.summary, item.publisher, item.sourceType].every(hasText);
    const keywordsValid = Array.isArray(item.keywords) && item.keywords.length > 0 && item.keywords.every(hasText);
    const pointsValid = Array.isArray(item.keyPoints) && item.keyPoints.length > 0 && item.keyPoints.every(hasText);
    if (!urlValid || !requiredText || !keywordsValid || !pointsValid) metadataIssues += 1;
    const reviewMetadataComplete = completeReviewMetadata(item);
    const projectApprovalComplete = completeProjectOwnerApproval(item);
    return {
      id: hasText(item.id) ? item.id : "unknown",
      title: hasText(item.title) ? item.title : "ไม่มีชื่อเอกสาร",
      publisher: hasText(item.publisher) ? item.publisher : "ไม่ทราบผู้เผยแพร่",
      publishedAt: hasText(item.publishedAt) ? item.publishedAt : "ไม่ระบุวันที่",
      sourceUrl: urlValid ? String(item.sourceUrl) : "",
      reviewStatus: hasText(item.reviewStatus) ? item.reviewStatus : "missing-review-status",
      reviewMetadataComplete,
      projectApprovalComplete,
    } satisfies KnowledgeGovernanceDocument;
  }).filter((item): item is KnowledgeGovernanceDocument => item !== null);

  add("registry-nonempty", "Knowledge registry", documents.length > 0 ? "pass" : "blocked", `พบเอกสาร ${documents.length} รายการ`);
  add("unique-ids", "Document IDs", duplicateIds === 0 ? "pass" : "blocked", duplicateIds === 0 ? "ไม่มี ID ซ้ำ" : `พบ ID ซ้ำ ${duplicateIds} รายการ`);
  add("source-metadata", "Source metadata", metadataIssues === 0 ? "pass" : "blocked", metadataIssues === 0 ? "ชื่อ ผู้เผยแพร่ URL, keywords และ key points ครบ" : `มีเอกสาร ${metadataIssues} รายการที่ Metadata ไม่ครบหรือ URL ไม่ใช่ HTTPS`);
  add("project-owner-approval", "Project owner approval", projectApproved === documents.length && documents.length > 0 ? "pass" : "warning", "เจ้าของโครงงานอนุมัติใช้เพื่อการศึกษา/สาธิต " + projectApproved + "/" + documents.length);
  add("clinical-review", "Clinical review", reviewed === documents.length && documents.length > 0 ? "pass" : "warning", `ผ่านการทบทวนพร้อมผู้ทบทวน/วันที่/หลักฐาน ${reviewed}/${documents.length} · รอทบทวน ${awaiting}`);
  add("academic-demo-generation", "Academic demonstration", projectApproved === documents.length && documents.length > 0 ? "pass" : "warning", "ใช้ร่างคำตอบ AI เพื่อการศึกษา/สาธิตภายใต้ runtime gate และ safety gate");
  add("production-generation", "Production answer generation", "blocked", "การอนุมัติจากเจ้าของโครงงานไม่ใช่การรับรองทางคลินิก; Production AI ยังคงปิด");

  const blocked = documents.length === 0 || duplicateIds > 0 || metadataIssues > 0;
  const readyForDemo = !blocked && projectApproved === documents.length && documents.length > 0;
  return {
    status: blocked ? "blocked" : readyForDemo ? "ready-for-academic-demo" : "ready-for-review",
    productionAnswersAllowed: false,
    totalDocuments: documents.length,
    projectOwnerApproved: projectApproved,
    awaitingClinicalReview: awaiting,
    clinicallyReviewed: reviewed,
    metadataIssues,
    duplicateIds,
    documents: mapped,
    checks,
    summary: blocked
      ? "คลังความรู้มีปัญหา Metadata หรือ ID; ต้องแก้ก่อนส่งเข้ากระบวนการทบทวน"
      : readyForDemo
        ? `คลังความรู้ ${documents.length} เอกสารได้รับอนุมัติจากเจ้าของโครงงานสำหรับการศึกษา/สาธิตแล้ว; ยังไม่ถือว่าผ่านการทบทวนทางคลินิก`
        : `คลังความรู้มี ${documents.length} เอกสารและ Metadata ผ่านเบื้องต้น แต่คำตอบ AI ใน Production ยังคงปิด`,
    note: "รายงานนี้ตรวจ Metadata และการอนุมัติจากเจ้าของโครงงานเพื่อการศึกษา/สาธิตเท่านั้น ไม่ยืนยันความถูกต้องทางคลินิก ไม่ดึงเนื้อหาเต็มจาก URL และไม่อ้างว่าได้รับการรับรองจากแพทย์",
  };
}
