export type RefreshCheckStatus = "pass" | "warning" | "blocked";
export type RefreshObservabilityStatus = "ready" | "warning" | "blocked";

export interface RefreshObservabilityCheck {
  id: string;
  label: string;
  status: RefreshCheckStatus;
  detail: string;
}

export interface ModelRefreshObservabilityReport {
  status: RefreshObservabilityStatus;
  forecastWeek: string | null;
  currentWeekStart: string;
  forecastLagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  generatedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  convertedAtUtc: string | null;
  currentWeekAtConversion: string | null;
  snapshotAgeHours: number | null;
  sourceAgeHours: number | null;
  sourceToConversionMinutes: number | null;
  storedForecastLagWeeks: number | null;
  generationCurrentButForecastStale: boolean;
  diagnosis: string[];
  checks: RefreshObservabilityCheck[];
  observedAt: string;
  note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSundayDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getUTCDay() === 0;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function differenceInWeeks(fromWeek: string, toWeek: string): number {
  return Math.round((Date.parse(`${toWeek}T00:00:00.000Z`) - Date.parse(`${fromWeek}T00:00:00.000Z`)) / (7 * 24 * 60 * 60 * 1000));
}

export function analyzeModelRefreshObservability(
  input: unknown,
  now = new Date(),
): ModelRefreshObservabilityReport {
  const checks: RefreshObservabilityCheck[] = [];
  const diagnosis: string[] = [];
  let blocked = false;
  let warning = false;
  const add = (id: string, label: string, status: RefreshCheckStatus, detail: string) => {
    checks.push({ id, label, status, detail });
    if (status === "blocked") blocked = true;
    if (status === "warning") warning = true;
  };

  const fallback = (detail: string): ModelRefreshObservabilityReport => ({
    status: "blocked", forecastWeek: null, currentWeekStart: "", forecastLagWeeks: null,
    modelRevision: null, repository: null, generatedAtUtc: null, sourceRetrievedAtUtc: null,
    convertedAtUtc: null, currentWeekAtConversion: null, snapshotAgeHours: null,
    sourceAgeHours: null, sourceToConversionMinutes: null, storedForecastLagWeeks: null,
    generationCurrentButForecastStale: false, diagnosis: [detail], checks: [{
      id: "input", label: "รูปแบบข้อมูล", status: "blocked", detail,
    }], observedAt: now.toISOString(),
    note: "รายงานนี้ตรวจลำดับเวลาของ Model Artifacts แบบอ่านอย่างเดียว ไม่ได้ดึงหรือสร้าง Forecast ใหม่ และไม่เปลี่ยน Alert Rules",
  });

  if (!isRecord(input) || !isRecord(input.predictions) || !isRecord(input.metrics)) {
    return fallback("รูปแบบ Predictions หรือ Metrics ไม่ถูกต้อง");
  }
  const predictions = input.predictions;
  const metrics = input.metrics;
  const freshness = isRecord(predictions.freshness) ? predictions.freshness : {};
  const coverage = isRecord(predictions.coverage) ? predictions.coverage : {};
  const currentWeekStart = input.currentWeekStart;
  if (!isSundayDate(currentWeekStart)) return fallback("สัปดาห์ปัจจุบันต้องเป็นวันอาทิตย์ตามสัปดาห์ระบาดวิทยา");

  const forecastWeek = typeof coverage.forecast_week === "string" ? coverage.forecast_week : null;
  const forecastWeekValid = isSundayDate(forecastWeek);
  add("forecast-week", "สัปดาห์ของ Forecast", forecastWeekValid ? "pass" : "blocked",
    forecastWeekValid ? `Forecast week ${forecastWeek}` : "ไม่พบ Forecast week ที่เป็นวันที่วันอาทิตย์ถูกต้อง");

  let forecastLagWeeks: number | null = null;
  if (forecastWeekValid) {
    forecastLagWeeks = differenceInWeeks(forecastWeek!, currentWeekStart);
    const fresh = forecastLagWeeks <= 0;
    add("forecast-freshness", "ความใหม่เชิงระบาดวิทยา", fresh ? "pass" : "blocked",
      forecastLagWeeks > 0 ? `Forecast ล่าช้า ${forecastLagWeeks} สัปดาห์และไม่ควรใช้ประเมินสถานการณ์ปัจจุบัน`
        : forecastLagWeeks < 0 ? `Forecast ล่วงหน้า ${Math.abs(forecastLagWeeks)} สัปดาห์`
          : "Forecast ตรงกับสัปดาห์ปัจจุบัน");
  } else {
    add("forecast-freshness", "ความใหม่เชิงระบาดวิทยา", "blocked", "ไม่สามารถคำนวณความใหม่ของ Forecast ได้");
  }

  const modelRevision = typeof predictions.model_revision === "string" && predictions.model_revision.trim()
    ? predictions.model_revision.trim() : null;
  const metricsRevision = typeof metrics.model_revision === "string" && metrics.model_revision.trim()
    ? metrics.model_revision.trim() : null;
  const revisionMatches = Boolean(modelRevision && metricsRevision && modelRevision === metricsRevision);
  add("revision-match", "Model Revision", revisionMatches ? "pass" : "blocked",
    revisionMatches ? `Revision ${modelRevision} ตรงกับ Metrics` : "Model Revision ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน");

  const repository = typeof predictions.source_repository === "string" ? predictions.source_repository.trim() : null;
  const metricsRepository = typeof metrics.source_repository === "string" ? metrics.source_repository.trim() : null;
  const repositoryMatches = Boolean(repository && metricsRepository && repository === metricsRepository && /^https:\/\//i.test(repository));
  add("repository-match", "แหล่งที่มาของ Model", repositoryMatches ? "pass" : "blocked",
    repositoryMatches ? repository! : "Source Repository ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน");

  const generatedAtUtc = typeof predictions.generated_at_utc === "string" ? predictions.generated_at_utc : null;
  const sourceRetrievedAtUtc = typeof freshness.source_retrieved_at_utc === "string" ? freshness.source_retrieved_at_utc : null;
  const convertedAtUtc = typeof freshness.converted_at_utc === "string" ? freshness.converted_at_utc : null;
  const currentWeekAtConversion = typeof freshness.current_week_start_at_conversion === "string"
    ? freshness.current_week_start_at_conversion : null;
  const storedForecastLagWeeks = typeof freshness.forecast_lag_weeks_at_conversion === "number" && Number.isInteger(freshness.forecast_lag_weeks_at_conversion)
    ? freshness.forecast_lag_weeks_at_conversion : null;

  const generatedMs = parseTimestamp(generatedAtUtc);
  const sourceMs = parseTimestamp(sourceRetrievedAtUtc);
  const convertedMs = parseTimestamp(convertedAtUtc);
  const nowMs = now.getTime();

  add("generated-at", "เวลา Model Artifact", generatedMs !== null ? "pass" : "warning",
    generatedMs !== null ? `generated_at_utc ${generatedAtUtc}` : "ไม่มี generated_at_utc ที่เป็น ISO timestamp พร้อม timezone");
  add("source-retrieved-at", "เวลาที่ดึงข้อมูลต้นทาง", sourceMs !== null ? "pass" : "warning",
    sourceMs !== null ? `source_retrieved_at_utc ${sourceRetrievedAtUtc}` : "ไม่มีเวลา Source Retrieval; ไม่สามารถตรวจช่วงเวลาต้นทางได้");
  add("converted-at", "เวลาแปลง Snapshot", convertedMs !== null ? "pass" : "warning",
    convertedMs !== null ? `converted_at_utc ${convertedAtUtc}` : "ไม่มี converted_at_utc; ไม่สามารถตรวจลำดับการแปลง Snapshot ได้");

  let sourceToConversionMinutes: number | null = null;
  if (sourceMs !== null && convertedMs !== null) {
    sourceToConversionMinutes = round((convertedMs - sourceMs) / 60_000);
    add("source-conversion-order", "ลำดับ Source → Conversion", sourceToConversionMinutes >= 0 ? "pass" : "blocked",
      sourceToConversionMinutes >= 0 ? `ใช้เวลา ${sourceToConversionMinutes} นาทีระหว่างดึงข้อมูลและแปลง Snapshot`
        : "เวลา Conversion เกิดก่อน Source Retrieval; Metadata ตามลำดับเวลาไม่สอดคล้องกัน");
  } else {
    add("source-conversion-order", "ลำดับ Source → Conversion", "warning", "ข้อมูลเวลาไม่ครบ จึงยังตรวจลำดับ Source → Conversion ไม่ได้");
  }

  const snapshotTimestamp = convertedMs ?? generatedMs;
  const snapshotAgeHours = snapshotTimestamp === null ? null : round((nowMs - snapshotTimestamp) / 3_600_000);
  const sourceAgeHours = sourceMs === null ? null : round((nowMs - sourceMs) / 3_600_000);
  if (snapshotAgeHours !== null && snapshotAgeHours < -0.1) {
    add("snapshot-time-not-future", "เวลาของ Snapshot", "blocked", "เวลา Snapshot อยู่ในอนาคตเมื่อเทียบกับเวลาตรวจสอบ");
  } else if (snapshotAgeHours !== null) {
    add("snapshot-time-not-future", "เวลาของ Snapshot", "pass", `อายุ Snapshot ประมาณ ${Math.max(0, snapshotAgeHours)} ชั่วโมง; เป็นข้อมูลประกอบ ไม่ใช่เกณฑ์ freshness อัตโนมัติ`);
  } else {
    add("snapshot-time-not-future", "เวลาของ Snapshot", "warning", "ยังคำนวณอายุ Snapshot ไม่ได้");
  }
  if (sourceAgeHours !== null && sourceAgeHours < -0.1) {
    add("source-time-not-future", "เวลา Source Retrieval", "blocked", "เวลา Source Retrieval อยู่ในอนาคตเมื่อเทียบกับเวลาตรวจสอบ");
  }

  let conversionLagMatches: boolean | null = null;
  if (forecastWeekValid && isSundayDate(currentWeekAtConversion) && storedForecastLagWeeks !== null) {
    const computedAtConversion = differenceInWeeks(forecastWeek!, currentWeekAtConversion!);
    conversionLagMatches = computedAtConversion === storedForecastLagWeeks;
    add("conversion-lag-agreement", "Forecast Lag ใน Metadata", conversionLagMatches ? "pass" : "blocked",
      conversionLagMatches ? `Metadata ${storedForecastLagWeeks} สัปดาห์ตรงกับวันที่ต้นทาง`
        : `Metadata ระบุ ${storedForecastLagWeeks} สัปดาห์ แต่วันที่คำนวณได้ ${computedAtConversion} สัปดาห์`);
  } else {
    add("conversion-lag-agreement", "Forecast Lag ใน Metadata", "warning", "ไม่มีข้อมูลครบสำหรับตรวจ Lag ณ เวลา Conversion");
  }

  const generationCurrentButForecastStale = Boolean(
    forecastLagWeeks !== null && forecastLagWeeks > 0 && generatedMs !== null &&
    generatedMs >= Date.parse(`${currentWeekStart}T00:00:00+07:00`),
  );
  if (generationCurrentButForecastStale) {
    diagnosis.push("Artifact ถูกสร้างในหรือหลังสัปดาห์ปัจจุบัน แต่ Forecast target ยังเป็นสัปดาห์ย้อนหลัง; ควรตรวจ upstream model refresh และขั้นตอนเลือก target week");
  } else if (forecastLagWeeks !== null && forecastLagWeeks > 0 && sourceMs !== null && sourceMs >= Date.parse(`${currentWeekStart}T00:00:00+07:00`)) {
    diagnosis.push("มีการดึงข้อมูลต้นทางในหรือหลังสัปดาห์ปัจจุบัน แต่ Forecast target ยังย้อนหลัง; ควรตรวจ artifact ต้นทางและการแปลง Snapshot");
  } else if (forecastLagWeeks !== null && forecastLagWeeks > 0) {
    diagnosis.push("Forecast target เก่ากว่าสัปดาห์ปัจจุบัน; ต้องรอ Model Pipeline ส่ง Forecast สัปดาห์ใหม่ก่อนประเมินสถานการณ์ปัจจุบัน");
  } else {
    diagnosis.push("ไม่พบความล่าช้าของ Forecast เชิงระบาดวิทยาจากวันที่ที่ได้รับ; รายงานนี้ไม่ได้รับรองคุณภาพเชิงคลินิกหรือประสิทธิภาพของ Model");
  }

  const status: RefreshObservabilityStatus = blocked ? "blocked" : warning ? "warning" : "ready";
  return {
    status,
    forecastWeek,
    currentWeekStart,
    forecastLagWeeks,
    modelRevision,
    repository,
    generatedAtUtc,
    sourceRetrievedAtUtc,
    convertedAtUtc,
    currentWeekAtConversion,
    snapshotAgeHours,
    sourceAgeHours,
    sourceToConversionMinutes,
    storedForecastLagWeeks,
    generationCurrentButForecastStale,
    diagnosis,
    checks,
    observedAt: now.toISOString(),
    note: "รายงานนี้แยกเวลา Artifact, Source Retrieval, Conversion และสัปดาห์ Forecast; อายุ Artifact เป็นข้อมูลประกอบเท่านั้น ไม่มี SLA อายุไฟล์ที่ตั้งขึ้นเอง และไม่ดึงหรือสร้าง Forecast ใหม่",
  };
}
