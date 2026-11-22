import type { AlertDryRunResult } from "../alerting/types";

export type ModelCheckStatus = "pass" | "warning" | "blocked";
export interface ModelValidationCheck {
  id: string;
  label: string;
  status: ModelCheckStatus;
  detail: string;
}
export interface ModelValidationReport {
  status: "missing" | "blocked" | "warning" | "valid";
  summary: string;
  currentEpiWeek: string;
  freshness: "current_or_future" | "stale" | "unknown";
  forecastLagWeeks: number | null;
  forecastWeek: string | null;
  historyStartWeek: string | null;
  historyEndWeek: string | null;
  provinceCount: number;
  forecastRows: number;
  historyRows: number;
  historyWeeks: number;
  modelName: string | null;
  sourceRepository: string | null;
  modelRevision: string | null;
  generatedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  convertedAtUtc: string | null;
  metricsAvailable: boolean;
  metricsMatch: boolean;
  mae: number | null;
  rmse: number | null;
  evalCutoff: string | null;
  canUseForDryRun: boolean;
  canUseForCurrentAlerting: boolean;
  checks: ModelValidationCheck[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isSundayDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 0;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}
function addWeeks(week: string, current: string): number | null {
  if (!isSundayDate(week) || !isSundayDate(current)) return null;
  const delta = Date.parse(`${current}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`);
  return delta > 0 ? Math.floor(delta / (7 * 24 * 60 * 60 * 1000)) : 0;
}
function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function validateModelExports(
  predictionsInput: unknown,
  metricsInput: unknown,
  currentEpiWeek: string,
): ModelValidationReport {
  const checks: ModelValidationCheck[] = [];
  const push = (id: string, label: string, status: ModelCheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });

  const empty: Omit<ModelValidationReport,
    "status" | "summary" | "checks" | "canUseForDryRun" | "canUseForCurrentAlerting"> = {
    currentEpiWeek,
    freshness: "unknown",
    forecastLagWeeks: null,
    forecastWeek: null,
    historyStartWeek: null,
    historyEndWeek: null,
    provinceCount: 0,
    forecastRows: 0,
    historyRows: 0,
    historyWeeks: 0,
    modelName: null,
    sourceRepository: null,
    modelRevision: null,
    generatedAtUtc: null,
    sourceRetrievedAtUtc: null,
    convertedAtUtc: null,
    metricsAvailable: false,
    metricsMatch: false,
    mae: null,
    rmse: null,
    evalCutoff: null,
  };

  if (!isRecord(predictionsInput)) {
    push("predictions-file", "ไฟล์ผลพยากรณ์", "blocked", predictionsInput === null || predictionsInput === undefined
      ? "ไม่พบไฟล์ model_predictions.json"
      : "ไฟล์ผลพยากรณ์ไม่ใช่ JSON Object");
    if (metricsInput !== null && metricsInput !== undefined) {
      push("metrics-file", "ไฟล์ Metrics", "warning", "พบ Metrics แต่ไม่มีไฟล์ผลพยากรณ์ จึงไม่ใช้ Metrics ชุดนี้");
    }
    return {
      ...empty,
      status: "missing",
      summary: "ยังไม่มี Model Snapshot ที่ตรวจสอบได้",
      canUseForDryRun: false,
      canUseForCurrentAlerting: false,
      checks,
    };
  }

  const p = predictionsInput;
  const schemaVersion = p.schema_version;
  const provinces = Array.isArray(p.provinces) ? p.provinces : [];
  const forecast = Array.isArray(p.forecast) ? p.forecast : [];
  const history = Array.isArray(p.history) ? p.history : [];
  const coverage = isRecord(p.coverage) ? p.coverage : {};
  const freshnessMeta = isRecord(p.freshness) ? p.freshness : null;
  const provinceNames = provinces.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const provinceSet = new Set(provinceNames);
  const forecastWeek = typeof coverage.forecast_week === "string" ? coverage.forecast_week : null;
  const historyStartWeek = typeof coverage.history_start_week === "string" ? coverage.history_start_week : null;
  const historyEndWeek = typeof coverage.history_end_week === "string" ? coverage.history_end_week : null;

  const modelName = typeof p.model_name === "string" && p.model_name.trim() ? p.model_name : null;
  const sourceRepository = typeof p.source_repository === "string" && p.source_repository.trim() ? p.source_repository : null;
  const modelRevision = typeof p.model_revision === "string" ? p.model_revision.toLowerCase() : null;
  const generatedAtUtc = typeof p.generated_at_utc === "string" ? p.generated_at_utc : null;
  const sourceRetrievedAtUtc = typeof freshnessMeta?.source_retrieved_at_utc === "string" ? freshnessMeta.source_retrieved_at_utc : null;
  const convertedAtUtc = typeof freshnessMeta?.converted_at_utc === "string" ? freshnessMeta.converted_at_utc : null;

  const shapeValid = typeof schemaVersion === "number" && Number.isInteger(schemaVersion) && schemaVersion >= 1 &&
    Boolean(modelName && sourceRepository && generatedAtUtc) && isTimestamp(generatedAtUtc) &&
    typeof coverage.history_rows === "number" && Number.isInteger(coverage.history_rows) &&
    typeof coverage.history_week_count === "number" && Number.isInteger(coverage.history_week_count) &&
    typeof coverage.forecast_rows === "number" && Number.isInteger(coverage.forecast_rows);
  push("payload-shape", "โครงสร้าง Model Snapshot", shapeValid ? "pass" : "blocked",
    shapeValid ? `Schema ${String(schemaVersion)} · ${modelName}` : "ขาดฟิลด์สำคัญหรือชนิดข้อมูลไม่ถูกต้อง");

  const provinceListValid = provinceNames.length === 77 && provinces.length === 77 && provinceSet.size === 77;
  push("province-master", "รายชื่อจังหวัดหลัก", provinceListValid ? "pass" : "blocked",
    `พบ ${provinceSet.size}/77 จังหวัดไม่ซ้ำ`);

  const forecastKeys = new Set<string>();
  const forecastWeeks = new Set<string>();
  let forecastRowsValid = forecast.length === 77;
  for (const raw of forecast) {
    if (!isRecord(raw)) { forecastRowsValid = false; continue; }
    const province = raw.province;
    const week = raw.week_start;
    const prediction = raw.prediction;
    if (typeof province !== "string" || !provinceSet.has(province) || forecastKeys.has(province) ||
        !isSundayDate(week) || week !== forecastWeek || !finiteNonNegative(prediction)) {
      forecastRowsValid = false;
    }
    if (typeof province === "string") forecastKeys.add(province);
    if (typeof week === "string") forecastWeeks.add(week);
  }
  const forecastCoverageValid = forecastRowsValid && forecast.length === 77 && forecastKeys.size === 77 &&
    coverage.forecast_rows === 77 && isSundayDate(forecastWeek) && forecastWeeks.size === 1 && forecastWeeks.has(forecastWeek);
  push("forecast-integrity", "ผลพยากรณ์รายจังหวัด", forecastCoverageValid ? "pass" : "blocked",
    `ตรวจ ${forecast.length}/77 แถว · จังหวัดไม่ซ้ำ ${forecastKeys.size}/77 · สัปดาห์ ${forecastWeek ?? "ไม่ระบุ"}`);

  const historySeen = new Set<string>();
  const weekProvinces = new Map<string, Set<string>>();
  let historyRowsValid = history.length > 0 && history.length === coverage.history_rows;
  for (const raw of history) {
    if (!isRecord(raw)) { historyRowsValid = false; continue; }
    const province = raw.province;
    const week = raw.week_start;
    const key = `${String(week)}|${String(province)}`;
    const numericValid = finiteNonNegative(raw.actual_cases) && finiteNonNegative(raw.prediction) &&
      finiteNonNegative(raw.persistence) && typeof raw.seasonal_naive === "number" && Number.isFinite(raw.seasonal_naive) &&
      typeof raw.climatology === "number" && Number.isFinite(raw.climatology) &&
      typeof raw.residual === "number" && Number.isFinite(raw.residual);
    if (typeof province !== "string" || !provinceSet.has(province) || !isSundayDate(week) || !numericValid || historySeen.has(key)) {
      historyRowsValid = false;
    }
    if (typeof week === "string" && typeof province === "string") {
      const weekSet = weekProvinces.get(week) ?? new Set<string>();
      weekSet.add(province);
      weekProvinces.set(week, weekSet);
    }
    historySeen.add(key);
  }
  const historyWeekKeys = [...weekProvinces.keys()].sort();
  const historyCoverageValid = historyRowsValid && historyWeekKeys.length === coverage.history_week_count &&
    historyWeekKeys.length > 0 && historyWeekKeys.every((week) => weekProvinces.get(week)?.size === 77) &&
    historyWeekKeys[0] === historyStartWeek && historyWeekKeys.at(-1) === historyEndWeek &&
    isSundayDate(historyStartWeek) && isSundayDate(historyEndWeek);
  push("holdout-integrity", "ข้อมูล Holdout ย้อนหลัง", historyCoverageValid ? "pass" : "blocked",
    `ตรวจ ${history.length}/${String(coverage.history_rows ?? 0)} แถว · ${historyWeekKeys.length}/${String(coverage.history_week_count ?? 0)} สัปดาห์ · จังหวัดครบทุกสัปดาห์ ${historyCoverageValid ? "ผ่าน" : "ไม่ผ่าน"}`);

  const chronologyValid = isSundayDate(forecastWeek) && isSundayDate(historyEndWeek) &&
    forecastWeek > historyEndWeek && coverage.forecast_is_after_history === true;
  push("forecast-chronology", "ลำดับ Holdout → Forecast", chronologyValid ? "pass" : "blocked",
    chronologyValid ? `${historyEndWeek} → ${forecastWeek}` : "Forecast ต้องอยู่หลังสัปดาห์สุดท้ายของ Holdout และ metadata ต้องระบุว่าผ่าน");

  const revisionValid = /^[a-f0-9]{40}$/.test(modelRevision ?? "");
  const provenanceStatus: ModelCheckStatus = revisionValid ? "pass" : Number(schemaVersion) >= 2 ? "blocked" : "warning";
  push("model-revision", "Model Commit SHA", provenanceStatus,
    revisionValid ? `ยืนยัน Revision ${modelRevision?.slice(0, 12)}` : "ไม่มี Commit SHA รูปแบบ 40 ตัวอักษร");

  const repositoryValid = Boolean(sourceRepository && /^https:\/\//i.test(sourceRepository));
  push("repository", "แหล่งที่มาของโมเดล", repositoryValid ? "pass" : "blocked",
    repositoryValid ? sourceRepository! : "Source Repository ต้องเป็น HTTPS URL");

  const freshnessMetaValid = freshnessMeta?.timezone === "Asia/Bangkok" &&
    isTimestamp(sourceRetrievedAtUtc) && isTimestamp(convertedAtUtc);
  const freshnessMetaStatus: ModelCheckStatus = freshnessMetaValid ? "pass" : Number(schemaVersion) >= 2 ? "blocked" : "warning";
  push("freshness-metadata", "Metadata เวลาและเขตเวลา", freshnessMetaStatus,
    freshnessMetaValid ? `Asia/Bangkok · ดึงข้อมูล ${sourceRetrievedAtUtc}` : "ขาด timezone หรือ timestamp สำหรับตรวจสอบแหล่งข้อมูล");

  const lag = forecastWeek ? addWeeks(forecastWeek, currentEpiWeek) : null;
  const freshnessStatus = lag === null ? "unknown" : lag > 0 ? "stale" : "current_or_future";
  push("forecast-freshness", "ความใหม่ของ Forecast", freshnessStatus === "current_or_future" ? "pass" : "warning",
    freshnessStatus === "stale" ? `Forecast เก่ากว่าสัปดาห์ปัจจุบัน ${lag} สัปดาห์` : freshnessStatus === "current_or_future" ? "Forecast ไม่เก่ากว่าสัปดาห์ปัจจุบัน" : "ไม่สามารถคำนวณความใหม่ของ Forecast ได้");

  let metricsAvailable = isRecord(metricsInput) && isRecord(metricsInput.metrics);
  let metricsMatch = false;
  let mae: number | null = null;
  let rmse: number | null = null;
  let evalCutoff: string | null = null;
  let metricStatus: ModelCheckStatus = "warning";
  let metricDetail = "ไม่พบ Model Metrics ที่อ่านได้";
  if (metricsAvailable && isRecord(metricsInput)) {
    const m = metricsInput.metrics as Record<string, unknown>;
    mae = finiteNonNegative(m.mae) ? m.mae : null;
    rmse = finiteNonNegative(m.rmse) ? m.rmse : null;
    evalCutoff = typeof m.eval_cutoff === "string" ? m.eval_cutoff : null;
    const revisionMatches = typeof metricsInput.model_revision === "string" && metricsInput.model_revision.toLowerCase() === modelRevision;
    const repositoryMatches = metricsInput.source_repository === p.source_repository;
    const cutoffValid = isIsoDate(evalCutoff) && isSundayDate(historyEndWeek) && evalCutoff >= historyEndWeek;
    const sampleCountValid = m.n_test === undefined || m.n_test === coverage.history_rows;
    metricsMatch = revisionMatches && repositoryMatches && mae !== null && rmse !== null && cutoffValid && sampleCountValid;
    metricStatus = metricsMatch ? "pass" : "warning";
    metricDetail = metricsMatch
      ? `MAE ${mae} · RMSE ${rmse} · eval cutoff ${evalCutoff}`
      : "Metrics ไม่ตรงกับ Revision/Repository หรือค่า MAE, RMSE, eval_cutoff, n_test ไม่สอดคล้องกับ Holdout";
  }
  push("metrics-integrity", "Metrics และ Model Revision", metricStatus, metricDetail);

  const blocked = checks.some((check) => check.status === "blocked");
  const warned = checks.some((check) => check.status === "warning");
  const status: ModelValidationReport["status"] = blocked ? "blocked" : warned ? "warning" : "valid";
  const coreCheckIds = ["payload-shape", "province-master", "forecast-integrity", "holdout-integrity", "forecast-chronology", "model-revision", "repository", "freshness-metadata"];
  const coreValid = coreCheckIds.every((id) => checks.find((item) => item.id === id)?.status === "pass");
  const canUseForDryRun = !blocked && coreValid;
  const canUseForCurrentAlerting = canUseForDryRun && !warned && metricsMatch && freshnessStatus === "current_or_future" && freshnessMetaValid;

  return {
    ...empty,
    status,
    summary: blocked ? "Model Snapshot ไม่ผ่านการตรวจสอบ จึงไม่ควรใช้เป็นข้อมูลอ้างอิงสำหรับ Alert Evaluation" : warned ? "Model Snapshot ผ่านโครงสร้างหลัก แต่มีข้อควรระวัง ต้องพิจารณาความใหม่และ Metrics ก่อนใช้งาน" : "Model Snapshot และ Metrics ผ่านการตรวจสอบตาม Contract",
    currentEpiWeek,
    freshness: freshnessStatus,
    forecastLagWeeks: lag,
    forecastWeek,
    historyStartWeek,
    historyEndWeek,
    provinceCount: provinceSet.size,
    forecastRows: forecast.length,
    historyRows: history.length,
    historyWeeks: historyWeekKeys.length,
    modelName,
    sourceRepository,
    modelRevision,
    generatedAtUtc,
    sourceRetrievedAtUtc,
    convertedAtUtc,
    metricsAvailable,
    metricsMatch,
    mae,
    rmse,
    evalCutoff,
    canUseForDryRun,
    canUseForCurrentAlerting,
    checks,
  };
}

export function toAlertModelSnapshot(value: unknown): {
  model_revision: string | null;
  source_repository: string;
  generated_at_utc: string;
  source_retrieved_at_utc: string | null;
  province_count: number;
  provinces: string[];
  forecast: Array<{ province: string; week_start: string; prediction: number }>;
  coverage: { forecast_rows: number; forecast_week: string; history_end_week: string };
} | null {
  if (!isRecord(value) || !Array.isArray(value.provinces) || !Array.isArray(value.forecast) || !isRecord(value.coverage)) return null;
  if (typeof value.source_repository !== "string" || typeof value.generated_at_utc !== "string" ||
      typeof value.province_count !== "number" || typeof value.coverage.forecast_rows !== "number" ||
      typeof value.coverage.forecast_week !== "string" || typeof value.coverage.history_end_week !== "string") return null;
  const forecast = value.forecast.filter((row): row is Record<string, unknown> => isRecord(row));
  if (forecast.length !== value.forecast.length || !forecast.every((row) => typeof row.province === "string" && typeof row.week_start === "string" && typeof row.prediction === "number")) return null;
  return {
    model_revision: typeof value.model_revision === "string" ? value.model_revision.toLowerCase() : null,
    source_repository: value.source_repository,
    generated_at_utc: value.generated_at_utc,
    source_retrieved_at_utc: isRecord(value.freshness) && typeof value.freshness.source_retrieved_at_utc === "string" ? value.freshness.source_retrieved_at_utc : null,
    province_count: value.province_count,
    provinces: value.provinces.filter((item): item is string => typeof item === "string"),
    forecast: forecast.map((row) => ({ province: row.province as string, week_start: row.week_start as string, prediction: row.prediction as number })),
    coverage: {
      forecast_rows: value.coverage.forecast_rows,
      forecast_week: value.coverage.forecast_week,
      history_end_week: value.coverage.history_end_week,
    },
  };
}


/**
 * Apply model release eligibility to an evaluated alert report. A structurally
 * valid snapshot may still be ineligible for current alerting when it is stale
 * or its Metrics do not match the exact model revision/repository.
 */
export function enforceCurrentAlertEligibility(
  result: AlertDryRunResult,
  allowed: boolean,
  reason: string,
): AlertDryRunResult {
  if (allowed) return result;
  const detail = reason.trim() || "Model Snapshot ยังไม่ผ่านเงื่อนไขข้อมูลสำหรับการประเมิน Alert ปัจจุบัน";
  return {
    ...result,
    status: "blocked",
    evaluatedProvinceCount: 0,
    watchCandidateCount: 0,
    alertCandidateCount: 0,
    candidateEvents: [],
    externalNotificationsEnabled: false,
    blockedReasons: [...new Set([...result.blockedReasons, detail])],
    checks: [
      ...result.checks.filter((check) => check.id !== "model-current-alert-eligibility"),
      {
        id: "model-current-alert-eligibility",
        label: "สิทธิ์ใช้ Model Snapshot สำหรับ Alert ปัจจุบัน",
        status: "blocked",
        detail,
      },
    ],
  };
}
