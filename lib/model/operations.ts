export type ModelOperationsStatus = "ready" | "stale" | "blocked";

export interface ModelOperationsInput {
  predictions: {
    schema_version?: number;
    model_name?: string;
    source_repository?: string;
    model_revision?: string | null;
    generated_at_utc?: string;
    province_count?: number;
    provinces?: string[];
    forecast?: Array<{ province?: string; week_start?: string; prediction?: number }>;
    history?: unknown[];
    coverage?: {
      forecast_rows?: number;
      forecast_week?: string;
      history_rows?: number;
      history_week_count?: number;
    };
    freshness?: {
      timezone?: string;
      source_retrieved_at_utc?: string | null;
      converted_at_utc?: string;
      forecast_lag_weeks_at_conversion?: number;
    };
  };
  metrics: {
    model_name?: string;
    source_repository?: string;
    model_revision?: string | null;
    generated_at_utc?: string;
    metrics?: Record<string, unknown>;
  };
  currentWeekStart: string;
}

export interface ModelOperationsCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
}

export interface ModelOperationsReport {
  status: ModelOperationsStatus;
  eligibleForCurrentEvaluation: boolean;
  forecastWeek: string | null;
  currentWeekStart: string;
  lagWeeks: number | null;
  modelRevision: string | null;
  repository: string | null;
  checks: ModelOperationsCheck[];
  summary: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isSunday(value: string): boolean {
  return new Date(`${value}T00:00:00Z`).getUTCDay() === 0;
}

function uniqueNonEmpty(values: unknown[]): boolean {
  return values.every((item) => typeof item === "string" && item.trim().length > 0) &&
    new Set(values.map((item) => String(item).trim())).size === values.length;
}

export function getCurrentEpiWeekStartBangkok(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function evaluateModelOperations(input: ModelOperationsInput): ModelOperationsReport {
  const { predictions, metrics, currentWeekStart } = input;
  const checks: ModelOperationsCheck[] = [];
  let blocking = false;
  let warning = false;
  const add = (id: string, label: string, status: ModelOperationsCheck["status"], detail: string) => {
    checks.push({ id, label, status, detail });
    if (status === "blocked") blocking = true;
    if (status === "warning") warning = true;
  };

  const provinces = Array.isArray(predictions.provinces) ? predictions.provinces : [];
  const forecast = Array.isArray(predictions.forecast) ? predictions.forecast : [];
  const provinceListValid = predictions.province_count === 77 && provinces.length === 77 && uniqueNonEmpty(provinces);
  add(
    "province-coverage",
    "รายชื่อจังหวัด",
    provinceListValid ? "pass" : "blocked",
    `พบ ${provinces.length}/77 จังหวัดไม่ซ้ำ`,
  );

  const forecastProvinces = forecast.map((row) => row?.province);
  const forecastRowsValid = predictions.coverage?.forecast_rows === 77 && forecast.length === 77 &&
    uniqueNonEmpty(forecastProvinces) && provinces.every((province) => forecastProvinces.includes(province));
  add(
    "forecast-coverage",
    "Forecast coverage",
    forecastRowsValid ? "pass" : "blocked",
    `พบ ${forecast.length}/77 แถว และต้องมีจังหวัดครบทุกจังหวัด`,
  );

  const forecastWeek = predictions.coverage?.forecast_week ?? null;
  const forecastValuesValid = forecast.length === 77 && forecast.every((row) =>
    typeof row?.province === "string" && typeof row?.week_start === "string" &&
    row.week_start === forecastWeek && typeof row.prediction === "number" &&
    Number.isFinite(row.prediction) && row.prediction >= 0,
  );
  add(
    "forecast-values",
    "ความถูกต้องของแถว Forecast",
    forecastValuesValid ? "pass" : "blocked",
    forecastValuesValid ? "วันที่และค่าพยากรณ์ครบ ถูกต้อง และไม่ติดลบ" : "พบวันที่ไม่ตรงกับ Snapshot หรือค่าพยากรณ์ไม่ถูกต้อง",
  );
  const forecastWeekValid = isValidDate(forecastWeek) && isSunday(forecastWeek);
  add(
    "forecast-week",
    "สัปดาห์พยากรณ์",
    forecastWeekValid ? "pass" : "blocked",
    forecastWeekValid ? `สัปดาห์เริ่มต้น ${forecastWeek}` : "ไม่พบวันที่ถูกต้องหรือไม่ใช่วันอาทิตย์ตามสัปดาห์ระบาดวิทยา",
  );

  const currentWeekValid = isValidDate(currentWeekStart) && isSunday(currentWeekStart);
  add(
    "current-week",
    "สัปดาห์ปัจจุบัน",
    currentWeekValid ? "pass" : "blocked",
    currentWeekValid ? `Asia/Bangkok · ${currentWeekStart}` : "คำนวณสัปดาห์ปัจจุบันไม่ถูกต้อง",
  );

  let lagWeeks: number | null = null;
  if (forecastWeekValid && currentWeekValid) {
    lagWeeks = Math.floor((Date.parse(`${currentWeekStart}T00:00:00Z`) - Date.parse(`${forecastWeek}T00:00:00Z`)) / WEEK_MS);
    const fresh = lagWeeks <= 0;
    add(
      "freshness",
      "ความสดของ Forecast",
      fresh ? "pass" : "blocked",
      lagWeeks > 0
        ? `Forecast เก่ากว่าสัปดาห์ปัจจุบัน ${lagWeeks} สัปดาห์ · ไม่อนุญาตให้ใช้ประเมินเหตุการณ์ปัจจุบัน`
        : lagWeeks < 0
          ? `Forecast ล่วงหน้า ${Math.abs(lagWeeks)} สัปดาห์`
          : "Forecast ตรงกับสัปดาห์ปัจจุบัน",
    );
  } else {
    add("freshness", "ความสดของ Forecast", "blocked", "ไม่สามารถคำนวณความใหม่ได้เพราะวันที่ไม่ถูกต้อง");
  }

  const predictionRevision = predictions.model_revision?.trim() || null;
  const metricsRevision = metrics.model_revision?.trim() || null;
  const revisionMatch = Boolean(predictionRevision && metricsRevision && predictionRevision === metricsRevision);
  add(
    "revision-match",
    "Model Revision",
    revisionMatch ? "pass" : "blocked",
    revisionMatch ? `Revision ${predictionRevision} ตรงกับ Metrics` : "Model Revision ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน",
  );

  const predictionRepository = predictions.source_repository?.trim() || null;
  const metricsRepository = metrics.source_repository?.trim() || null;
  const repositoryMatch = Boolean(
    predictionRepository && metricsRepository && predictionRepository === metricsRepository &&
    /^https:\/\//i.test(predictionRepository),
  );
  add(
    "repository-match",
    "แหล่งที่มาของ Model",
    repositoryMatch ? "pass" : "blocked",
    repositoryMatch ? predictionRepository! : "Source Repository ของ Predictions และ Metrics ไม่มีหรือไม่ตรงกัน",
  );

  const generatedAtValid = typeof predictions.generated_at_utc === "string" &&
    Number.isFinite(Date.parse(predictions.generated_at_utc));
  add(
    "generated-at",
    "เวลา Snapshot",
    generatedAtValid ? "pass" : "warning",
    generatedAtValid ? `สร้างข้อมูล ${predictions.generated_at_utc}` : "ไม่มีเวลา generated_at_utc ที่ถูกต้อง",
  );

  if (warning && !blocking) {
    // Missing timestamp is a quality warning; it does not override the hard freshness/revision gates.
  }
  const status: ModelOperationsStatus = blocking ? "blocked" : warning ? "stale" : "ready";
  const eligibleForCurrentEvaluation = status === "ready";
  const summary = eligibleForCurrentEvaluation
    ? "Model Snapshot ผ่าน operational gates สำหรับการประเมินสัปดาห์ปัจจุบัน"
    : lagWeeks !== null && lagWeeks > 0
      ? `บล็อกการประเมินปัจจุบัน: Forecast ล่าช้า ${lagWeeks} สัปดาห์`
      : "Model Snapshot ยังไม่ผ่านเงื่อนไข Operational Readiness";

  return {
    status,
    eligibleForCurrentEvaluation,
    forecastWeek,
    currentWeekStart,
    lagWeeks,
    modelRevision: predictionRevision,
    repository: predictionRepository,
    checks,
    summary,
  };
}
