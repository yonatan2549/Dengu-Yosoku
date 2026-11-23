export type TemporalMonitorStatus = "ready" | "warning" | "blocked";
export type MetricName = "prediction" | "persistence" | "seasonal_naive" | "climatology";

export interface TemporalHoldoutRow {
  province: string;
  week_start: string;
  actual_cases: number;
  prediction: number;
  persistence: number;
  seasonal_naive: number;
  climatology: number;
}

export interface TemporalMetricSet {
  sampleCount: number;
  mae: number;
  rmse: number;
  bias: number;
}

export interface TemporalWindowComparison {
  previousStartWeek: string;
  previousEndWeek: string;
  recentStartWeek: string;
  recentEndWeek: string;
  previous: Record<MetricName, TemporalMetricSet>;
  recent: Record<MetricName, TemporalMetricSet>;
  modelMaeDelta: number;
  modelMaeChangePercent: number | null;
  modelMaeDirection: "higher-error" | "lower-error" | "unchanged";
}

export interface ProvinceTemporalMetric extends TemporalMetricSet {
  province: string;
}

export interface WeeklyTemporalMetric extends TemporalMetricSet {
  weekStart: string;
}

export interface TemporalMonitorReport {
  status: TemporalMonitorStatus;
  modelRevision: string | null;
  repository: string | null;
  historyRowCount: number;
  completeWeekCount: number;
  incompleteWeekCount: number;
  firstCompleteWeek: string | null;
  lastCompleteWeek: string | null;
  comparison: TemporalWindowComparison | null;
  weekly: WeeklyTemporalMetric[];
  provincePerformance: ProvinceTemporalMetric[];
  issues: string[];
  note: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const REQUIRED_PROVINCES = 77;
const COMPARISON_WEEKS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSundayDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function computeMetrics(rows: TemporalHoldoutRow[], metric: MetricName): TemporalMetricSet {
  let absolute = 0;
  let squared = 0;
  let signed = 0;
  for (const row of rows) {
    const error = row[metric] - row.actual_cases;
    absolute += Math.abs(error);
    squared += error * error;
    signed += error;
  }
  const count = rows.length;
  return {
    sampleCount: count,
    mae: absolute / count,
    rmse: Math.sqrt(squared / count),
    bias: signed / count,
  };
}

function metricSet(rows: TemporalHoldoutRow[]): Record<MetricName, TemporalMetricSet> {
  return {
    prediction: computeMetrics(rows, "prediction"),
    persistence: computeMetrics(rows, "persistence"),
    seasonal_naive: computeMetrics(rows, "seasonal_naive"),
    climatology: computeMetrics(rows, "climatology"),
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function analyzeModelTemporalPerformance(input: unknown): TemporalMonitorReport {
  const issues: string[] = [];
  if (!isRecord(input)) {
    return {
      status: "blocked", modelRevision: null, repository: null, historyRowCount: 0,
      completeWeekCount: 0, incompleteWeekCount: 0, firstCompleteWeek: null, lastCompleteWeek: null,
      comparison: null, weekly: [], provincePerformance: [], issues: ["รูปแบบ Model Snapshot ไม่ถูกต้อง"],
      note: "รายงานนี้เป็นการเปรียบเทียบเชิงพรรณนาจาก Holdout ไม่ใช่เกณฑ์อนุมัติ Model หรือเกณฑ์แจ้งเตือนโรค",
    };
  }

  const rawProvinces = input.provinces;
  const rawHistory = input.history;
  const modelRevision = typeof input.model_revision === "string" && input.model_revision.trim() ? input.model_revision.trim() : null;
  const repository = typeof input.source_repository === "string" && /^https:\/\//i.test(input.source_repository) ? input.source_repository : null;
  if (!Array.isArray(rawProvinces) || rawProvinces.length !== REQUIRED_PROVINCES ||
      rawProvinces.some((name) => typeof name !== "string" || !name.trim()) ||
      new Set(rawProvinces).size !== REQUIRED_PROVINCES) {
    issues.push("รายชื่อจังหวัดหลักต้องครบ 77 จังหวัดและไม่ซ้ำ");
  }
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    issues.push("ไม่พบข้อมูล Holdout history");
  }
  if (!modelRevision) issues.push("ไม่พบ Model Revision ที่ตรวจสอบได้");
  if (!repository) issues.push("ไม่พบ HTTPS Source Repository ที่ตรวจสอบได้");

  const provinces = Array.isArray(rawProvinces) ? rawProvinces.filter((name): name is string => typeof name === "string") : [];
  const canonical = new Set(provinces);
  const rows: TemporalHoldoutRow[] = [];
  const seenPairs = new Set<string>();
  if (Array.isArray(rawHistory)) {
    for (let index = 0; index < rawHistory.length; index += 1) {
      const item = rawHistory[index];
      if (!isRecord(item)) {
        issues.push(`Holdout แถวที่ ${index + 1} ไม่ใช่ Object`);
        continue;
      }
      const { province, week_start, actual_cases, prediction, persistence, seasonal_naive, climatology } = item;
      if (typeof province !== "string" || !canonical.has(province)) {
        issues.push(`Holdout มีจังหวัดที่ไม่อยู่ในรายชื่อหลัก: ${String(province)}`);
        continue;
      }
      if (!isSundayDate(week_start)) {
        issues.push(`Holdout ของ ${province} มีวันที่ไม่ถูกต้องหรือไม่ใช่วันอาทิตย์`);
        continue;
      }
      const values = [actual_cases, prediction, persistence, seasonal_naive, climatology];
      if (!values.every(finiteNonNegative)) {
        issues.push(`Holdout ของ ${province} ในสัปดาห์ ${week_start} มีค่าที่ไม่ใช่ตัวเลขไม่ติดลบ`);
        continue;
      }
      const pair = `${week_start}::${province}`;
      if (seenPairs.has(pair)) {
        issues.push(`พบ Holdout ซ้ำสำหรับ ${province} สัปดาห์ ${week_start}`);
        continue;
      }
      seenPairs.add(pair);
      rows.push({
        province, week_start,
        actual_cases: actual_cases as number,
        prediction: prediction as number,
        persistence: persistence as number,
        seasonal_naive: seasonal_naive as number,
        climatology: climatology as number,
      });
    }
  }

  const grouped = new Map<string, TemporalHoldoutRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.week_start) ?? [];
    group.push(row);
    grouped.set(row.week_start, group);
  }
  const completeWeeks = Array.from(grouped.entries())
    .filter(([, weekRows]) => weekRows.length === REQUIRED_PROVINCES && new Set(weekRows.map((row) => row.province)).size === REQUIRED_PROVINCES)
    .sort(([left], [right]) => left.localeCompare(right));
  const incompleteWeekCount = grouped.size - completeWeeks.length;
  if (completeWeeks.length === 0) issues.push("ไม่มีสัปดาห์ Holdout ที่ครอบคลุม 77 จังหวัดครบถ้วน");

  const completeRows = completeWeeks.flatMap(([, weekRows]) => weekRows);
  const weekly = completeWeeks.slice(-12).map(([weekStart, weekRows]) => ({
    weekStart,
    ...computeMetrics(weekRows, "prediction"),
    mae: round(computeMetrics(weekRows, "prediction").mae),
    rmse: round(computeMetrics(weekRows, "prediction").rmse),
    bias: round(computeMetrics(weekRows, "prediction").bias),
  }));

  const provincePerformance = provinces.map((province) => {
    const provinceRows = completeRows.filter((row) => row.province === province);
    const metrics = computeMetrics(provinceRows, "prediction");
    return {
      province,
      sampleCount: metrics.sampleCount,
      mae: round(metrics.mae),
      rmse: round(metrics.rmse),
      bias: round(metrics.bias),
    };
  }).filter((item) => item.sampleCount > 0).sort((left, right) => right.mae - left.mae || left.province.localeCompare(right.province, "th"));

  let comparison: TemporalWindowComparison | null = null;
  if (completeWeeks.length >= COMPARISON_WEEKS * 2) {
    const previousWeeks = completeWeeks.slice(-(COMPARISON_WEEKS * 2), -COMPARISON_WEEKS);
    const recentWeeks = completeWeeks.slice(-COMPARISON_WEEKS);
    const previousRows = previousWeeks.flatMap(([, weekRows]) => weekRows);
    const recentRows = recentWeeks.flatMap(([, weekRows]) => weekRows);
    const previous = metricSet(previousRows);
    const recent = metricSet(recentRows);
    const maeDelta = recent.prediction.mae - previous.prediction.mae;
    const changePercent = previous.prediction.mae === 0 ? null : (maeDelta / previous.prediction.mae) * 100;
    comparison = {
      previousStartWeek: previousWeeks[0][0],
      previousEndWeek: previousWeeks[previousWeeks.length - 1][0],
      recentStartWeek: recentWeeks[0][0],
      recentEndWeek: recentWeeks[recentWeeks.length - 1][0],
      previous: Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, { ...value, mae: round(value.mae), rmse: round(value.rmse), bias: round(value.bias) }])) as Record<MetricName, TemporalMetricSet>,
      recent: Object.fromEntries(Object.entries(recent).map(([key, value]) => [key, { ...value, mae: round(value.mae), rmse: round(value.rmse), bias: round(value.bias) }])) as Record<MetricName, TemporalMetricSet>,
      modelMaeDelta: round(maeDelta),
      modelMaeChangePercent: changePercent === null ? null : round(changePercent),
      modelMaeDirection: maeDelta > 1e-9 ? "higher-error" : maeDelta < -1e-9 ? "lower-error" : "unchanged",
    };
  }

  if (incompleteWeekCount > 0) issues.push(`มี ${incompleteWeekCount} สัปดาห์ที่ข้อมูลจังหวัดไม่ครบ จึงไม่นำมาเปรียบเทียบ`);
  if (completeWeeks.length < COMPARISON_WEEKS * 2) issues.push(`ต้องมีอย่างน้อย ${COMPARISON_WEEKS * 2} สัปดาห์ที่ครบ 77 จังหวัดเพื่อเปรียบเทียบช่วงล่าสุดกับช่วงก่อนหน้า`);

  const hardIssues = issues.some((issue) =>
    issue.includes("ไม่ถูกต้อง") || issue.includes("ไม่อยู่ในรายชื่อหลัก") || issue.includes("ซ้ำ") ||
    issue.includes("ไม่พบข้อมูล Holdout") || issue.includes("รายชื่อจังหวัดหลัก") ||
    issue.includes("ไม่พบ Model Revision") || issue.includes("ไม่พบ HTTPS") || issue.includes("ไม่มีสัปดาห์ Holdout") ||
    issue.includes("ไม่ใช่ตัวเลข") || issue.includes("ไม่ใช่ Object"),
  );
  const status: TemporalMonitorStatus = hardIssues ? "blocked" : issues.length > 0 ? "warning" : "ready";
  return {
    status,
    modelRevision,
    repository,
    historyRowCount: rows.length,
    completeWeekCount: completeWeeks.length,
    incompleteWeekCount,
    firstCompleteWeek: completeWeeks[0]?.[0] ?? null,
    lastCompleteWeek: completeWeeks.at(-1)?.[0] ?? null,
    comparison,
    weekly,
    provincePerformance: provincePerformance.slice(0, 10),
    issues,
    note: "การเปรียบเทียบ MAE/RMSE/Bias เป็นการติดตามเชิงพรรณนาของ Holdout ไม่ใช้เกณฑ์ drift อัตโนมัติ ไม่อนุมัติ Model และไม่สร้าง Alert Candidate",
  };
}
