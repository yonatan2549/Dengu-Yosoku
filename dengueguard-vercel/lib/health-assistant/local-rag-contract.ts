export type PublicRagStatus = "ok" | "no_evidence" | "blocked";

export interface PublicRagResult {
  rank: number;
  sourceId: string;
  title: string;
  authority: string;
  pageStart: number | null;
  pageEnd: number | null;
  pageLabel: string;
  audience: "general";
  accessPolicy: "public_general";
  extractionMethod: string;
  qualityStatus: "ok";
  replacementChars: 0;
  language: string;
  retrievedAt: string | null;
  sourceUrl: string;
  text: string;
  scores: {
    combined: number;
    semantic: number;
    lexical: number;
    intentAdjustment: number;
  };
}

export interface PublicRagPayload {
  schemaVersion: "1.0";
  status: PublicRagStatus;
  query: string;
  audience: "public";
  safety: {
    blocked: boolean;
    gateReasons: string[];
    message?: string;
  };
  retrieval: {
    engine: string;
    version: string;
    indexedChunks: number;
    eligibleChunks: number;
    resultCount: number;
    semanticWeight: number;
    queryIntent: string | null;
    withheld: {
      sourcePolicy: number;
      audiencePolicy: number;
      textQuality: number;
    };
  };
  results: PublicRagResult[];
  warnings: string[];
}

export type PublicRagValidation =
  | { ok: true; value: PublicRagPayload }
  | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown, maxLength = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullablePage(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 1);
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (!isText(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateResult(value: unknown, index: number): PublicRagResult | null {
  if (!isRecord(value) || !isRecord(value.scores)) return null;
  const scores = value.scores;
  if (!Number.isSafeInteger(value.rank) || value.rank !== index + 1) return null;
  if (!isText(value.source_id, 160) || !isText(value.title, 500) || !isText(value.authority, 300)) return null;
  if (!nullablePage(value.page_start) || !nullablePage(value.page_end)) return null;
  if (!isText(value.page_label, 120)) return null;
  if (value.audience !== "general" || value.access_policy !== "public_general") return null;
  if (!isText(value.extraction_method, 80) || value.quality_status !== "ok" || value.replacement_chars !== 0) return null;
  if (!isText(value.language, 20)) return null;
  if (value.retrieved_at !== null && !isText(value.retrieved_at, 80)) return null;
  if (!isSafeHttpsUrl(value.source_url) || !isText(value.text, 1000)) return null;
  if (!isFiniteNumber(scores.combined) || !isFiniteNumber(scores.semantic) ||
      !isFiniteNumber(scores.lexical) || !isFiniteNumber(scores.intent_adjustment)) return null;

  return {
    rank: Number(value.rank),
    sourceId: value.source_id.trim(),
    title: value.title.trim(),
    authority: value.authority.trim(),
    pageStart: value.page_start,
    pageEnd: value.page_end,
    pageLabel: value.page_label.trim(),
    audience: "general",
    accessPolicy: "public_general",
    extractionMethod: value.extraction_method.trim(),
    qualityStatus: "ok",
    replacementChars: 0,
    language: value.language.trim(),
    retrievedAt: typeof value.retrieved_at === "string" ? value.retrieved_at : null,
    sourceUrl: value.source_url,
    text: value.text.trim(),
    scores: {
      combined: scores.combined,
      semantic: scores.semantic,
      lexical: scores.lexical,
      intentAdjustment: scores.intent_adjustment,
    },
  };
}

export function validatePublicRagPayload(input: unknown): PublicRagValidation {
  if (!isRecord(input) || input.schema_version !== "1.0" || input.audience !== "public") {
    return { ok: false, error: "รูปแบบหรือ Audience ของผลค้น RAG ไม่ถูกต้อง" };
  }
  if (input.status !== "ok" && input.status !== "no_evidence" && input.status !== "blocked") {
    return { ok: false, error: "สถานะผลค้น RAG ไม่รองรับ" };
  }
  if (!isText(input.query, 500) || !isRecord(input.safety) || !isRecord(input.retrieval)) {
    return { ok: false, error: "ข้อมูลความปลอดภัยหรือ Retrieval ไม่ครบ" };
  }

  const safety = input.safety;
  const retrieval = input.retrieval;
  if (typeof safety.blocked !== "boolean" || !Array.isArray(safety.gate_reasons) ||
      !safety.gate_reasons.every((reason) => isText(reason, 100))) {
    return { ok: false, error: "ข้อมูล Safety Gate ไม่ถูกต้อง" };
  }
  if (safety.message !== undefined && !isText(safety.message, 1000)) {
    return { ok: false, error: "ข้อความ Safety Gate ไม่ถูกต้อง" };
  }

  const blockedInput = input.status === "blocked";
  const indexedChunks = retrieval.indexed_chunks ?? (blockedInput ? 0 : undefined);
  const eligibleChunks = retrieval.eligible_chunks ?? (blockedInput ? 0 : undefined);
  const semanticWeight = retrieval.semantic_weight ?? (blockedInput ? 0 : undefined);
  const queryIntent = retrieval.query_intent ?? null;
  const withheld = isRecord(retrieval.withheld) ? retrieval.withheld : (blockedInput ? {} : null);

  if (!isText(retrieval.engine, 120) || !isText(retrieval.version, 40) ||
      !isCount(indexedChunks) || !isCount(eligibleChunks) ||
      !isCount(retrieval.result_count) || !isFiniteNumber(semanticWeight) ||
      semanticWeight < 0 || semanticWeight > 1 ||
      !(queryIntent === null || isText(queryIntent, 80)) ||
      !withheld) {
    return { ok: false, error: "ข้อมูลสถิติ Retrieval ไม่ถูกต้อง" };
  }
  const withheldSourcePolicy = withheld.source_policy ?? (blockedInput ? 0 : undefined);
  const withheldAudiencePolicy = withheld.audience_policy ?? (blockedInput ? 0 : undefined);
  const withheldTextQuality = withheld.text_quality ?? (blockedInput ? 0 : undefined);
  if (!isCount(withheldSourcePolicy) || !isCount(withheldAudiencePolicy) || !isCount(withheldTextQuality)) {
    return { ok: false, error: "ข้อมูลจำนวนรายการที่ถูกกักกันไม่ถูกต้อง" };
  }

  if (!Array.isArray(input.results) || input.results.length > 5 ||
      !input.results.every((item, index) => validateResult(item, index) !== null)) {
    return { ok: false, error: "ผลลัพธ์มีรายการที่ไม่ผ่าน Public Evidence Policy" };
  }
  const results = input.results.map((item, index) => validateResult(item, index) as PublicRagResult);
  if (retrieval.result_count !== results.length) {
    return { ok: false, error: "จำนวนผลลัพธ์ไม่ตรงกับรายการหลักฐาน" };
  }

  if (input.status === "ok" && (safety.blocked || results.length === 0)) {
    return { ok: false, error: "สถานะ OK ขัดแย้งกับ Safety Gate หรือจำนวนหลักฐาน" };
  }
  if (input.status === "no_evidence" && (safety.blocked || results.length !== 0)) {
    return { ok: false, error: "สถานะ no_evidence ขัดแย้งกับผลค้น" };
  }
  if (input.status === "blocked" && (!safety.blocked || results.length !== 0 || safety.gate_reasons.length === 0)) {
    return { ok: false, error: "สถานะ blocked ไม่มีเหตุผล Safety Gate ที่ยืนยันได้" };
  }

  const warnings = input.warnings === undefined ? [] : input.warnings;
  if (!Array.isArray(warnings) || !warnings.every((warning) => isText(warning, 500))) {
    return { ok: false, error: "รูปแบบคำเตือนจาก Retrieval ไม่ถูกต้อง" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: "1.0",
      status: input.status,
      query: input.query.trim(),
      audience: "public",
      safety: {
        blocked: safety.blocked,
        gateReasons: safety.gate_reasons.map((reason) => reason.trim()),
        ...(typeof safety.message === "string" ? { message: safety.message.trim() } : {}),
      },
      retrieval: {
        engine: retrieval.engine.trim(),
        version: retrieval.version.trim(),
        indexedChunks,
        eligibleChunks,
        resultCount: retrieval.result_count,
        semanticWeight,
        queryIntent: typeof queryIntent === "string" ? queryIntent : null,
        withheld: {
          sourcePolicy: withheldSourcePolicy,
          audiencePolicy: withheldAudiencePolicy,
          textQuality: withheldTextQuality,
        },
      },
      results,
      warnings: warnings.map((warning) => warning.trim()),
    },
  };
}
