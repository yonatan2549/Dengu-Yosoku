import type { AlertModelSnapshot } from "./types";

export interface AlertTransitionRequest {
  action: "acknowledge" | "resolve" | "reopen";
  note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isSundayDate(value: unknown): value is string {
  if (!isDateString(value)) return false;
  return new Date(value + "T00:00:00.000Z").getUTCDay() === 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  return Number.isFinite(new Date(value).getTime());
}

function isSafeCount(value: unknown, maximum = 100000): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

export function parseAlertModelSnapshot(value: unknown): AlertModelSnapshot | null {
  if (!isRecord(value)) return null;
  const revision = value.model_revision;
  if (revision !== null && (typeof revision !== "string" || !/^[a-f0-9]{40}$/i.test(revision))) return null;
  if (typeof value.source_repository !== "string" || value.source_repository.length < 1 || value.source_repository.length > 300) return null;
  if (!isIsoTimestamp(value.generated_at_utc)) return null;
  const retrievedAt = value.source_retrieved_at_utc;
  if (retrievedAt !== null && retrievedAt !== undefined && !isIsoTimestamp(retrievedAt)) return null;
  if (!isSafeCount(value.province_count, 77) || !Array.isArray(value.provinces) || value.provinces.length > 77) return null;
  if (!value.provinces.every((province) => typeof province === "string" && province.trim().length > 0 && province.length <= 100)) return null;
  const provinces = value.provinces as string[];
  if (new Set(provinces).size !== provinces.length) return null;
  if (!Array.isArray(value.forecast) || value.forecast.length > 77) return null;

  const forecast: AlertModelSnapshot["forecast"] = [];
  const forecastProvinceSet = new Set<string>();
  for (const row of value.forecast) {
    if (!isRecord(row) || typeof row.province !== "string" || !provinces.includes(row.province)) return null;
    if (forecastProvinceSet.has(row.province)) return null;
    if (!isDateString(row.week_start) || typeof row.prediction !== "number" || !Number.isFinite(row.prediction) || row.prediction < 0) return null;
    forecastProvinceSet.add(row.province);
    forecast.push({ province: row.province, week_start: row.week_start, prediction: row.prediction });
  }

  if (!isRecord(value.coverage)) return null;
  const coverage = value.coverage;
  if (!isSafeCount(coverage.forecast_rows, 77) || !isSundayDate(coverage.forecast_week) || !isDateString(coverage.history_end_week)) return null;
  if (coverage.forecast_rows !== forecast.length || forecast.some((row) => row.week_start !== coverage.forecast_week)) return null;

  return {
    model_revision: revision as string | null,
    source_repository: value.source_repository,
    generated_at_utc: value.generated_at_utc as string,
    source_retrieved_at_utc: (retrievedAt as string | null | undefined) ?? null,
    province_count: value.province_count,
    provinces,
    forecast,
    coverage: {
      forecast_rows: coverage.forecast_rows,
      forecast_week: coverage.forecast_week,
      history_end_week: coverage.history_end_week,
    },
  };
}

export function parseAlertTransitionRequest(value: unknown): AlertTransitionRequest | null {
  if (!isRecord(value)) return null;
  const action = value.action;
  if (action !== "acknowledge" && action !== "resolve" && action !== "reopen") return null;
  const note = value.note === undefined ? "" : value.note;
  if (typeof note !== "string" || note.length > 1000) return null;
  if (action === "resolve" && note.trim().length < 3) return null;
  return { action, note: note.trim() };
}

export function isDatabaseUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
