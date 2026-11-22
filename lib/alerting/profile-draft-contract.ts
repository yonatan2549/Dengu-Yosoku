export interface ProfileDraftThreshold {
  provinceName: string;
  watch: number;
  alert: number;
}

export interface ProfileDraftPayload {
  methodology: string;
  changeNote: string;
  submitForReview: boolean;
  thresholds: ProfileDraftThreshold[];
}

export interface ProfileDraftValidation {
  ok: boolean;
  errors: string[];
  value: ProfileDraftPayload | null;
  completeThresholdCount: number;
  expectedThresholdCount: number;
}

const EXPECTED_PROVINCE_COUNT = 77;
const MAX_THRESHOLD_VALUE = 99_999_999_999.999;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAtMostThreeDecimals(value: number): boolean {
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
}

export function validateProfileDraftPayload(
  input: unknown,
  expectedProvinces: string[],
): ProfileDraftValidation {
  const errors: string[] = [];
  const fail = (): ProfileDraftValidation => ({
    ok: false,
    errors,
    value: null,
    completeThresholdCount: 0,
    expectedThresholdCount: EXPECTED_PROVINCE_COUNT,
  });

  if (!Array.isArray(expectedProvinces) || expectedProvinces.length !== EXPECTED_PROVINCE_COUNT) {
    errors.push("รายชื่อจังหวัดอ้างอิงจาก Model Snapshot ต้องมี 77 จังหวัด");
    return fail();
  }
  const expected = new Set(expectedProvinces);
  if (expected.size !== EXPECTED_PROVINCE_COUNT || expectedProvinces.some((name) => typeof name !== "string" || !name.trim())) {
    errors.push("รายชื่อจังหวัดอ้างอิงมีข้อมูลซ้ำหรือไม่ถูกต้อง");
    return fail();
  }
  if (!isRecord(input)) {
    errors.push("รูปแบบข้อมูล Draft ไม่ถูกต้อง");
    return fail();
  }

  const methodology = typeof input.methodology === "string" ? input.methodology.trim() : "";
  const changeNote = typeof input.changeNote === "string" ? input.changeNote.trim() : "";
  const submitForReview = input.submitForReview === true;
  if (methodology.length < 20 || methodology.length > 4000) {
    errors.push("ระเบียบวิธีต้องมีความยาว 20–4,000 ตัวอักษร");
  }
  if (changeNote.length < 3 || changeNote.length > 500) {
    errors.push("บันทึกการเปลี่ยนแปลงต้องมีความยาว 3–500 ตัวอักษร");
  }
  if (input.submitForReview !== undefined && typeof input.submitForReview !== "boolean") {
    errors.push("สถานะการส่งทบทวนไม่ถูกต้อง");
  }
  if (!Array.isArray(input.thresholds) || input.thresholds.length > EXPECTED_PROVINCE_COUNT) {
    errors.push("Threshold ต้องเป็นรายการไม่เกิน 77 จังหวัด");
    return fail();
  }

  const seen = new Set<string>();
  const thresholds: ProfileDraftThreshold[] = [];
  for (const [index, raw] of input.thresholds.entries()) {
    if (!isRecord(raw)) {
      errors.push(`รายการ Threshold ลำดับ ${index + 1} ไม่ถูกต้อง`);
      continue;
    }
    const provinceName = typeof raw.provinceName === "string" ? raw.provinceName.trim() : "";
    if (!provinceName || !expected.has(provinceName)) {
      errors.push(`พบชื่อจังหวัดที่ไม่อยู่ใน Model Snapshot: ${provinceName || `รายการ ${index + 1}`}`);
      continue;
    }
    if (seen.has(provinceName)) {
      errors.push(`พบจังหวัดซ้ำ: ${provinceName}`);
      continue;
    }
    seen.add(provinceName);
    const watch = raw.watch;
    const alert = raw.alert;
    if (typeof watch !== "number" || typeof alert !== "number" || !Number.isFinite(watch) || !Number.isFinite(alert)) {
      errors.push(`ค่า Watch/Alert ของ ${provinceName} ต้องเป็นตัวเลขที่ทราบค่า`);
      continue;
    }
    if (watch < 0 || alert <= watch || watch > MAX_THRESHOLD_VALUE || alert > MAX_THRESHOLD_VALUE) {
      errors.push(`ค่า Watch/Alert ของ ${provinceName} ไม่ถูกต้อง (ต้องเป็น 0 ≤ Watch < Alert)`);
      continue;
    }
    if (!hasAtMostThreeDecimals(watch) || !hasAtMostThreeDecimals(alert)) {
      errors.push(`ค่า Threshold ของ ${provinceName} กำหนดทศนิยมได้ไม่เกิน 3 ตำแหน่ง`);
      continue;
    }
    thresholds.push({ provinceName, watch, alert });
  }

  if (submitForReview && thresholds.length !== EXPECTED_PROVINCE_COUNT) {
    errors.push("การส่งให้ผู้เชี่ยวชาญทบทวนต้องมี Threshold ที่ถูกต้องครบ 77 จังหวัด");
  }
  if (submitForReview && changeNote.length < 10) {
    errors.push("บันทึกสำหรับส่งทบทวนต้องมีอย่างน้อย 10 ตัวอักษร");
  }
  if (errors.length) return {
    ok: false,
    errors,
    value: null,
    completeThresholdCount: thresholds.length,
    expectedThresholdCount: EXPECTED_PROVINCE_COUNT,
  };

  return {
    ok: true,
    errors: [],
    value: { methodology, changeNote, submitForReview, thresholds },
    completeThresholdCount: thresholds.length,
    expectedThresholdCount: EXPECTED_PROVINCE_COUNT,
  };
}
