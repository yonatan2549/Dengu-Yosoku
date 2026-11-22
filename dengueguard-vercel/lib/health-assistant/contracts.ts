export type AssistantStatus =
  | "evidence"
  | "no_evidence"
  | "blocked"
  | "emergency";

export interface EvidenceItem {
  rank: number;
  source: string;
  authority: string;
  page: string;
  language: string;
  url: string;
  excerpt: string;
}

export interface ParsedRagResult {
  status: AssistantStatus;
  message: string;
  evidence: EvidenceItem[];
  blockedReason?: string;
}

const EMERGENCY_SIGNALS: Array<{ label: string; pattern: RegExp }> = [
  { label: "หายใจเร็วหรือหายใจลำบาก", pattern: /หายใจ(?:เร็ว|ลำบาก|ไม่ออก)/u },
  { label: "หมดสติหรือปลุกไม่ตื่น", pattern: /หมดสติ|ปลุกไม่ตื่น|ไม่รู้สึกตัว/u },
  { label: "ชัก", pattern: /ชัก/u },
  { label: "อาเจียนเป็นเลือด", pattern: /อาเจียนเป็นเลือด/u },
  { label: "ถ่ายเป็นเลือดหรือถ่ายดำ", pattern: /(?:ถ่าย|อุจจาระ)(?:เป็นเลือด|ดำ)|ถ่ายดำคล้ายยางมะตอย/u },
  { label: "มือเท้าเย็นหรือผิวซีดเย็น", pattern: /มือเท้าเย็น|ผิวซีดเย็น|ตัวซีดเย็น/u },
  { label: "ปวดท้องรุนแรง", pattern: /ปวดท้องรุนแรง/u },
  { label: "อาเจียนต่อเนื่อง", pattern: /อาเจียนต่อเนื่อง|อาเจียนไม่หยุด/u },
  { label: "เลือดออกผิดปกติ", pattern: /เลือดออกมาก|เลือดออกไม่หยุด/u },
];

function isNegatedMention(question: string, matchIndex: number): boolean {
  const prefix = question.slice(Math.max(0, matchIndex - 18), matchIndex);
  return /(?:ไม่มี|ไม่พบ|ไม่เคย|ไม่ได้มี)\s*$/u.test(prefix);
}

export function detectEmergencySignals(question: string): string[] {
  const normalized = question.normalize("NFC").toLowerCase();
  const found: string[] = [];

  for (const signal of EMERGENCY_SIGNALS) {
    const match = signal.pattern.exec(normalized);
    if (!match || isNegatedMention(normalized, match.index)) continue;
    found.push(signal.label);
  }

  return [...new Set(found)];
}

function readField(block: string, field: string): string {
  const prefix = field.toLowerCase() + ":";
  for (const line of block.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (normalized.startsWith(prefix)) {
      return line.trim().slice(prefix.length).trim();
    }
  }
  return "";
}

function safeHttpsUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function parseSearchOutput(stdout: string): ParsedRagResult {
  const output = stdout.trim();

  if (/PUBLIC CLINICAL SAFETY GATE/i.test(output) && /REQUEST BLOCKED:/i.test(output)) {
    const blockedReason = readField(output, "REQUEST BLOCKED");
    return {
      status: "blocked",
      blockedReason,
      message:
        "คำถามนี้เข้าข่ายข้อมูลการรักษา การใช้ยา การวินิจฉัย หรือการแปลผลตรวจที่ระบบค้นคืนสาธารณะไม่ให้คำแนะนำแทนบุคลากรทางการแพทย์ กรุณาปรึกษาบุคลากรทางการแพทย์",
      evidence: [],
    };
  }

  const blocks = output.split(/\r?\n-{40,}\r?\n/);
  const evidence: EvidenceItem[] = [];

  for (const block of blocks) {
    const rankMatch = block.match(/^\s*\[(\d+)\]\s+Rank:/m);
    if (!rankMatch) continue;

    const source = readField(block, "Source");
    const authority = readField(block, "Authority");
    const page = readField(block, "Page") || "ไม่ระบุหน้า";
    const language = readField(block, "Language") || "ไม่ระบุภาษา";
    const url = safeHttpsUrl(readField(block, "URL"));
    const excerptMatch = block.match(/^[ \t]*Excerpt:[ \t]*\r?\n([\s\S]*)$/mi);
    const excerpt = (excerptMatch?.[1] ?? "").trim().slice(0, 1600);

    if (!source || !url || !excerpt) continue;

    evidence.push({
      rank: Number(rankMatch[1]),
      source,
      authority: authority || "ไม่ระบุหน่วยงาน",
      page,
      language,
      url,
      excerpt,
    });
  }

  if (evidence.length > 0) {
    return {
      status: "evidence",
      message:
        "พบข้อความจากฐานความรู้ที่ผ่านตัวกรองความปลอดภัย ด้านล่างเป็นหลักฐานจากเอกสารต้นฉบับ ไม่ใช่คำวินิจฉัยหรือคำแนะนำเฉพาะบุคคล",
      evidence,
    };
  }

  return {
    status: "no_evidence",
    message:
      "ไม่พบหลักฐานที่ผ่านนโยบายการเข้าถึงสำหรับคำถามนี้ ระบบจะไม่แต่งคำตอบจากความจำของโมเดล กรุณาลองถามใหม่ในหัวข้อการป้องกันหรือความรู้ทั่วไป หรือปรึกษาบุคลากรทางการแพทย์",
    evidence: [],
  };
}
