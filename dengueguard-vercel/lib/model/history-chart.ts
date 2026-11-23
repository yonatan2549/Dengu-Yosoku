import type {
  ModelForecastRow,
  ModelHistoryRow,
  ProvinceHistoryRow,
} from "../types";

export interface ModelTrendRow {
  weekStart: string;
  actual: number | null;
  prediction: number | null;
  persistence: number | null;
}

interface ProvinceWeekValues {
  actual: number | null;
  prediction: number | null;
  persistence: number | null;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

/**
 * Builds a yearly time series by merging observed history with model Holdout
 * predictions and the target-week Forecast. Historical actuals remain visible
 * outside the Holdout window; model lines appear only where model outputs exist.
 *
 * Model History takes precedence over the historical snapshot for the same
 * province/week so observed cases are never double-counted.
 */
export function buildModelTrendRows(
  modelHistory: ModelHistoryRow[],
  historicalRows: ProvinceHistoryRow[],
  forecastRows: ModelForecastRow[],
  year: number,
  province?: string | null,
): ModelTrendRow[] {
  const byProvinceWeek = new Map<string, ProvinceWeekValues>();

  const getRow = (weekStart: string, provinceName: string): ProvinceWeekValues => {
    const key = weekStart + "|" + provinceName;
    const current = byProvinceWeek.get(key);
    if (current) return current;
    const created: ProvinceWeekValues = {
      actual: null,
      prediction: null,
      persistence: null,
    };
    byProvinceWeek.set(key, created);
    return created;
  };

  for (const row of historicalRows) {
    if (row.year !== year || (province && row.province !== province)) continue;
    getRow(row.week_start, row.province).actual = finiteOrNull(row.actual_cases);
  }

  for (const row of modelHistory) {
    if (row.year !== year || (province && row.province !== province)) continue;
    const values = getRow(row.week_start, row.province);
    values.actual = finiteOrNull(row.actual_cases);
    values.prediction = finiteOrNull(row.prediction);
    values.persistence = finiteOrNull(row.persistence);
  }

  for (const row of forecastRows) {
    if (row.year !== year || (province && row.province !== province)) continue;
    getRow(row.week_start, row.province).prediction = finiteOrNull(row.prediction);
  }

  const byWeek = new Map<string, ProvinceWeekValues[]>();
  for (const [key, values] of byProvinceWeek) {
    const separator = key.indexOf("|");
    const weekStart = key.slice(0, separator);
    const group = byWeek.get(weekStart) ?? [];
    group.push(values);
    byWeek.set(weekStart, group);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, group]) => ({
      weekStart,
      actual: sumOrNull(group.map((row) => row.actual)),
      prediction: sumOrNull(group.map((row) => row.prediction)),
      persistence: sumOrNull(group.map((row) => row.persistence)),
    }));
}
