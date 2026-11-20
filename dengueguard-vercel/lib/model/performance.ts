export interface HoldoutMetricRow {
  province: string;
  week_start: string;
  actual_cases: number;
  prediction: number;
  persistence: number;
  seasonal_naive: number;
  climatology: number;
}

export interface ModelReferenceMetrics {
  mae?: unknown;
  rmse?: unknown;
  baseline_mae?: unknown;
}

export interface PerformanceAggregate {
  rows: number;
  weeks: number;
  mae: number;
  rmse: number;
  bias: number;
  persistenceMae: number;
  persistenceRmse: number;
  seasonalNaiveMae: number;
  climatologyMae: number;
  skillVsPersistencePct: number | null;
}

export interface ProvincePerformance extends PerformanceAggregate {
  province: string;
}

export interface WeeklyPerformance {
  weekStart: string;
  mae: number;
  persistenceMae: number;
  rmse: number;
  rows: number;
}

export interface MetricComparison {
  label: string;
  calculated: number;
  reported: number;
  difference: number;
  matches: boolean;
}

export interface ModelPerformanceReport {
  status: "valid" | "blocked";
  errors: string[];
  provinceCount: number;
  historyRows: number;
  historyWeeks: number;
  aggregate: PerformanceAggregate | null;
  provinces: ProvincePerformance[];
  weekly: WeeklyPerformance[];
  comparisons: MetricComparison[];
  metricsMatch: boolean | null;
}

const TOLERANCE = 0.01;

function isSundayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeRows(rows: HoldoutMetricRow[]): PerformanceAggregate {
  const errors = rows.map((row) => row.prediction - row.actual_cases);
  const absoluteErrors = errors.map(Math.abs);
  const persistenceErrors = rows.map((row) => Math.abs(row.persistence - row.actual_cases));
  const persistenceSquaredErrors = rows.map((row) => (row.persistence - row.actual_cases) ** 2);
  const seasonalErrors = rows.map((row) => Math.abs(row.seasonal_naive - row.actual_cases));
  const climatologyErrors = rows.map((row) => Math.abs(row.climatology - row.actual_cases));
  const mae = mean(absoluteErrors);
  const persistenceMae = mean(persistenceErrors);
  return {
    rows: rows.length,
    weeks: new Set(rows.map((row) => row.week_start)).size,
    mae,
    rmse: Math.sqrt(mean(errors.map((value) => value ** 2))),
    bias: mean(errors),
    persistenceMae,
    persistenceRmse: Math.sqrt(mean(persistenceSquaredErrors)),
    seasonalNaiveMae: mean(seasonalErrors),
    climatologyMae: mean(climatologyErrors),
    skillVsPersistencePct: persistenceMae > 0 ? (1 - mae / persistenceMae) * 100 : null,
  };
}

function readMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function compare(label: string, calculated: number, reported: unknown): MetricComparison | null {
  const expected = readMetric(reported);
  if (expected === null) return null;
  const difference = Math.abs(calculated - expected);
  return { label, calculated, reported: expected, difference, matches: difference <= TOLERANCE };
}

export function buildModelPerformanceReport(
  rowsInput: unknown,
  expectedProvincesInput: unknown,
  expectedRowsInput: unknown,
  expectedWeeksInput: unknown,
  referenceMetricsInput?: ModelReferenceMetrics | null,
): ModelPerformanceReport {
  const errors: string[] = [];
  const rows = Array.isArray(rowsInput) ? rowsInput as HoldoutMetricRow[] : [];
  const expectedProvinces = Array.isArray(expectedProvincesInput)
    ? expectedProvincesInput.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const provinceSet = new Set(expectedProvinces);

  if (expectedProvinces.length !== 77 || provinceSet.size !== 77) {
    errors.push("รายชื่อจังหวัดอ้างอิงต้องครบ 77 จังหวัดและไม่ซ้ำกัน");
  }
  if (!Number.isInteger(expectedRowsInput) || (expectedRowsInput as number) <= 0) {
    errors.push("Metadata จำนวน Holdout rows ไม่ถูกต้อง");
  }
  if (!Number.isInteger(expectedWeeksInput) || (expectedWeeksInput as number) <= 0) {
    errors.push("Metadata จำนวนสัปดาห์ Holdout ไม่ถูกต้อง");
  }
  if (!Array.isArray(rowsInput) || rows.length === 0) {
    errors.push("ไม่พบข้อมูล Holdout สำหรับคำนวณ Performance");
  }
  if (Number.isInteger(expectedRowsInput) && rows.length !== expectedRowsInput) {
    errors.push(`จำนวน Holdout rows ไม่ตรงกับ Metadata (${rows.length}/${expectedRowsInput})`);
  }

  const seen = new Set<string>();
  const seenProvinces = new Set<string>();
  const weeks = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      errors.push("พบแถว Holdout ที่ไม่ใช่ Object");
      continue;
    }
    if (typeof row.province !== "string" || !provinceSet.has(row.province)) {
      errors.push("พบจังหวัดที่ไม่อยู่ในรายชื่อจังหวัดหลัก");
      continue;
    }
    if (typeof row.week_start !== "string" || !isSundayDate(row.week_start)) {
      errors.push("พบสัปดาห์ Holdout ที่ไม่ใช่วันอาทิตย์หรือรูปแบบวันที่ไม่ถูกต้อง");
      continue;
    }
    const key = `${row.week_start}|${row.province}`;
    if (seen.has(key)) errors.push(`พบข้อมูลซ้ำ: ${row.province} ${row.week_start}`);
    seen.add(key);
    seenProvinces.add(row.province);
    const provinceWeekSet = weeks.get(row.week_start) ?? new Set<string>();
    provinceWeekSet.add(row.province);
    weeks.set(row.week_start, provinceWeekSet);
    if (
      !finiteNonNegative(row.actual_cases) ||
      !finiteNonNegative(row.prediction) ||
      !finiteNonNegative(row.persistence) ||
      !finiteNonNegative(row.seasonal_naive) ||
      !finiteNonNegative(row.climatology)
    ) {
      errors.push(`พบค่าตัวเลขผิดรูปแบบใน ${row.province} ${row.week_start}`);
    }
  }

  if (seenProvinces.size !== 77) errors.push(`ข้อมูล Holdout มีจังหวัดไม่ครบ (${seenProvinces.size}/77)`);
  if (Number.isInteger(expectedWeeksInput) && weeks.size !== expectedWeeksInput) {
    errors.push(`จำนวนสัปดาห์ Holdout ไม่ตรงกับ Metadata (${weeks.size}/${expectedWeeksInput})`);
  }
  for (const [week, provinceNames] of weeks) {
    if (provinceNames.size !== 77) errors.push(`สัปดาห์ ${week} มีจังหวัดไม่ครบ 77 จังหวัด (${provinceNames.size}/77)`);
  }

  const validRows = rows.filter((row) =>
    row && typeof row.province === "string" && provinceSet.has(row.province) &&
    typeof row.week_start === "string" && isSundayDate(row.week_start) &&
    finiteNonNegative(row.actual_cases) && finiteNonNegative(row.prediction) &&
    finiteNonNegative(row.persistence) && finiteNonNegative(row.seasonal_naive) &&
    finiteNonNegative(row.climatology),
  );

  if (errors.length) {
    return {
      status: "blocked",
      errors: [...new Set(errors)],
      provinceCount: seenProvinces.size,
      historyRows: rows.length,
      historyWeeks: weeks.size,
      aggregate: null,
      provinces: [],
      weekly: [],
      comparisons: [],
      metricsMatch: null,
    };
  }

  const aggregate = summarizeRows(validRows);
  const provinceGroups = new Map<string, HoldoutMetricRow[]>();
  const weekGroups = new Map<string, HoldoutMetricRow[]>();
  for (const row of validRows) {
    provinceGroups.set(row.province, [...(provinceGroups.get(row.province) ?? []), row]);
    weekGroups.set(row.week_start, [...(weekGroups.get(row.week_start) ?? []), row]);
  }

  const provinces = [...provinceGroups.entries()]
    .map(([province, items]) => ({ province, ...summarizeRows(items) }))
    .sort((a, b) => b.mae - a.mae || a.province.localeCompare(b.province, "th"));
  const weekly = [...weekGroups.entries()]
    .map(([weekStart, items]) => {
      const summary = summarizeRows(items);
      return {
        weekStart,
        mae: summary.mae,
        persistenceMae: summary.persistenceMae,
        rmse: summary.rmse,
        rows: summary.rows,
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const ref = referenceMetricsInput && typeof referenceMetricsInput === "object"
    ? referenceMetricsInput as Record<string, unknown>
    : {};
  const baseline = ref.baseline_mae && typeof ref.baseline_mae === "object"
    ? ref.baseline_mae as Record<string, unknown>
    : {};
  const comparisons = [
    compare("MAE", aggregate.mae, ref.mae),
    compare("RMSE", aggregate.rmse, ref.rmse),
    compare("Persistence MAE", aggregate.persistenceMae, baseline.persistence),
    compare("Seasonal Naive MAE", aggregate.seasonalNaiveMae, baseline.seasonal_naive),
    compare("Climatology MAE", aggregate.climatologyMae, baseline.climatology),
  ].filter((item): item is MetricComparison => item !== null);
  const requiredMetricComparisons = comparisons.filter((item) =>
    item.label === "MAE" || item.label === "RMSE" || item.label === "Persistence MAE",
  );
  const hasReferenceMetrics = requiredMetricComparisons.length === 3;
  const metricsMatch = hasReferenceMetrics
    ? comparisons.every((item) => item.matches)
    : null;
  if (metricsMatch === false) errors.push("Metrics ที่คำนวณจาก Holdout ไม่ตรงกับค่าอ้างอิงใน metrics.json");

  return {
    status: metricsMatch === false ? "blocked" : "valid",
    errors,
    provinceCount: seenProvinces.size,
    historyRows: validRows.length,
    historyWeeks: weeks.size,
    aggregate,
    provinces,
    weekly,
    comparisons,
    metricsMatch,
  };
}
