export type ArtifactCheckStatus = "pass" | "warning" | "blocked";
export type ArtifactIntegrityStatus = "intact" | "warning" | "blocked";

export interface ModelArtifactDescriptor {
  fileName: string;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  modifiedAt: string | null;
}

export interface ModelArtifactIntegrityInput {
  predictions: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  predictionArtifact: ModelArtifactDescriptor;
  metricsArtifact: ModelArtifactDescriptor;
  currentWeekStart: string;
}

export interface ArtifactIntegrityCheck {
  id: string;
  label: string;
  status: ArtifactCheckStatus;
  detail: string;
}

export interface ModelArtifactIntegrityReport {
  status: ArtifactIntegrityStatus;
  eligibleForCurrentEvaluation: boolean;
  forecastWeek: string | null;
  currentWeekStart: string;
  lagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  checks: ArtifactIntegrityCheck[];
  summary: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isSunday(value: string): boolean {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay() === 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: unknown[]): boolean {
  return values.every((value) => typeof value === "string" && value.trim().length > 0) &&
    new Set(values.map((value) => String(value).trim())).size === values.length;
}

export function evaluateModelArtifactIntegrity(
  input: ModelArtifactIntegrityInput,
): ModelArtifactIntegrityReport {
  const checks: ArtifactIntegrityCheck[] = [];
  let blocked = false;
  let warning = false;
  const add = (id: string, label: string, status: ArtifactCheckStatus, detail: string) => {
    checks.push({ id, label, status, detail });
    if (status === "blocked") blocked = true;
    if (status === "warning") warning = true;
  };

  const predictions = isRecord(input.predictions) ? input.predictions : null;
  const metrics = isRecord(input.metrics) ? input.metrics : null;
  const predictionFile = input.predictionArtifact;
  const metricsFile = input.metricsArtifact;

  const predictionAvailable = Boolean(predictions && predictionFile.exists && predictionFile.bytes > 0 && predictionFile.bytes <= MAX_ARTIFACT_BYTES);
  add(
    "predictions-artifact",
    "Prediction artifact",
    predictionAvailable ? "pass" : "blocked",
    predictionAvailable
      ? `${predictionFile.fileName} · ${predictionFile.bytes.toLocaleString("en-US")} bytes`
      : "ไม่พบไฟล์ Predictions หรือขนาดไฟล์ไม่ถูกต้อง/เกินขีดจำกัด 50 MB",
  );

  const metricsAvailable = Boolean(metrics && metricsFile.exists && metricsFile.bytes > 0 && metricsFile.bytes <= MAX_ARTIFACT_BYTES);
  add(
    "metrics-artifact",
    "Metrics artifact",
    metricsAvailable ? "pass" : "blocked",
    metricsAvailable
      ? `${metricsFile.fileName} · ${metricsFile.bytes.toLocaleString("en-US")} bytes`
      : "ไม่พบไฟล์ Metrics หรือขนาดไฟล์ไม่ถูกต้อง/เกินขีดจำกัด 50 MB",
  );

  const predictionHashValid = predictionFile.exists && isSha256(predictionFile.sha256);
  const metricsHashValid = metricsFile.exists && isSha256(metricsFile.sha256);
  add(
    "artifact-hashes",
    "SHA-256 fingerprints",
    predictionHashValid && metricsHashValid ? "pass" : "blocked",
    predictionHashValid && metricsHashValid
      ? "คำนวณ SHA-256 ของ Predictions และ Metrics ได้ครบ"
      : "ไม่สามารถยืนยัน SHA-256 ของ Artifact ทั้งสองไฟล์",
  );

  const predictionRevision = safeString(predictions?.model_revision);
  const metricsRevision = safeString(metrics?.model_revision);
  const revisionMatch = Boolean(predictionRevision && metricsRevision && predictionRevision === metricsRevision);
  add(
    "revision-match",
    "Model revision agreement",
    revisionMatch ? "pass" : "blocked",
    revisionMatch ? `Revision ${predictionRevision} ตรงกัน` : "Model Revision ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน",
  );

  const predictionRepository = safeString(predictions?.source_repository);
  const metricsRepository = safeString(metrics?.source_repository);
  const repositoryMatch = Boolean(
    predictionRepository && metricsRepository && predictionRepository === metricsRepository && /^https:\/\//i.test(predictionRepository),
  );
  add(
    "repository-match",
    "Source repository agreement",
    repositoryMatch ? "pass" : "blocked",
    repositoryMatch ? predictionRepository! : "Source Repository ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน",
  );

  const provinces = Array.isArray(predictions?.provinces) ? predictions.provinces : [];
  const forecast = Array.isArray(predictions?.forecast) ? predictions.forecast : [];
  const provinceCoverage = predictions?.province_count === 77 && provinces.length === 77 && uniqueStrings(provinces);
  const forecastProvinceNames = forecast.map((row) => isRecord(row) ? row.province : null);
  const forecastCoverage = forecast.length === 77 && uniqueStrings(forecastProvinceNames) &&
    provinces.every((province) => forecastProvinceNames.includes(province));
  add(
    "province-coverage",
    "77-province release coverage",
    provinceCoverage && forecastCoverage ? "pass" : "blocked",
    `รายชื่อจังหวัด ${provinces.length}/77 · Forecast ${forecast.length}/77 แถว`,
  );

  const forecastWeek = safeString(isRecord(predictions?.coverage) ? predictions.coverage.forecast_week : null);
  const weekValid = Boolean(forecastWeek && validDate(forecastWeek) && isSunday(forecastWeek));
  const rowsMatchWeek = weekValid && forecast.length === 77 && forecast.every((row) =>
    isRecord(row) && row.week_start === forecastWeek && typeof row.prediction === "number" &&
    Number.isFinite(row.prediction) && row.prediction >= 0,
  );
  add(
    "forecast-row-integrity",
    "Forecast row integrity",
    rowsMatchWeek ? "pass" : "blocked",
    rowsMatchWeek ? `ทุกแถวตรงกับสัปดาห์ ${forecastWeek} และค่าพยากรณ์ไม่ติดลบ` : "พบสัปดาห์ไม่ตรงกัน แถวไม่ครบ หรือค่าพยากรณ์ไม่ถูกต้อง",
  );

  const currentWeekValid = validDate(input.currentWeekStart) && isSunday(input.currentWeekStart);
  const forecastWeekValue = weekValid ? forecastWeek : null;
  let lagWeeks: number | null = null;
  if (currentWeekValid && forecastWeekValue) {
    lagWeeks = Math.floor((Date.parse(`${input.currentWeekStart}T00:00:00Z`) - Date.parse(`${forecastWeekValue}T00:00:00Z`)) / WEEK_MS);
    add(
      "freshness",
      "Current forecast freshness",
      lagWeeks > 0 ? "blocked" : "pass",
      lagWeeks > 0
        ? `Forecast เก่ากว่าสัปดาห์ปัจจุบัน ${lagWeeks} สัปดาห์ · ห้ามใช้ประเมินเหตุการณ์ปัจจุบัน`
        : lagWeeks < 0
          ? `Forecast ล่วงหน้า ${Math.abs(lagWeeks)} สัปดาห์`
          : "Forecast ตรงกับสัปดาห์ปัจจุบัน",
    );
  } else {
    add("freshness", "Current forecast freshness", "blocked", "ไม่สามารถยืนยันสัปดาห์ปัจจุบันหรือสัปดาห์ Forecast ได้");
  }

  const generatedAt = safeString(predictions?.generated_at_utc);
  const generatedAtValid = Boolean(generatedAt && Number.isFinite(Date.parse(generatedAt)));
  add(
    "generated-at",
    "Snapshot generation timestamp",
    generatedAtValid ? "pass" : "warning",
    generatedAtValid ? `สร้าง Snapshot ${generatedAt}` : "ไม่มี generated_at_utc ที่ตรวจสอบได้; ต้องตรวจแหล่งที่มาด้วยตนเอง",
  );

  const status: ArtifactIntegrityStatus = blocked ? "blocked" : warning ? "warning" : "intact";
  const eligibleForCurrentEvaluation = status === "intact";
  const summary = eligibleForCurrentEvaluation
    ? "Artifact fingerprints, provenance, coverage และ freshness ผ่านการตรวจสอบ"
    : lagWeeks !== null && lagWeeks > 0
      ? `บล็อกการใช้ Snapshot ปัจจุบัน: Forecast ล่าช้า ${lagWeeks} สัปดาห์`
      : "ยังไม่ผ่านเงื่อนไข Release Integrity; ตรวจรายการที่ถูกบล็อกหรือคำเตือน";

  return {
    status,
    eligibleForCurrentEvaluation,
    forecastWeek: forecastWeekValue,
    currentWeekStart: input.currentWeekStart,
    lagWeeks,
    modelRevision: predictionRevision,
    repository: predictionRepository,
    checks,
    summary,
  };
}
