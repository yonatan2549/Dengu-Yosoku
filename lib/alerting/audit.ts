import type {
  AlertCandidateEvent,
  AlertDryRunCheck,
  AlertDryRunResult,
  AlertRuleProfile,
  AlertRuleStatus,
  ForecastFreshness,
  ProvinceAlertThreshold,
} from "./types";
import type { AlertModelSnapshot } from "./types";

export const ALERT_AUDIT_STORAGE_KEY = "dengueyosoku.alert-audit.v1";
export const ALERT_AUDIT_MAX_RECORDS = 30;

export interface AlertAuditRecord {
  id: string;
  runFingerprint: string;
  evaluatedAtUtc: string;
  ruleProfileId: string;
  ruleProfileVersion: string;
  ruleProfileStatus: AlertRuleStatus;
  ruleProfileMethodology: string;
  ruleProfileApprovalReference: string | null;
  ruleProfileEffectiveFromWeek: string | null;
  thresholdsByProvince: Record<string, ProvinceAlertThreshold>;
  sourceRepository: string | null;
  modelRevision: string | null;
  modelGeneratedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  historyEndWeek: string | null;
  targetWeek: string | null;
  currentEpiWeek: string;
  freshness: ForecastFreshness;
  forecastLagWeeks: number | null;
  status: AlertDryRunResult["status"];
  forecastProvinceCount: number;
  evaluatedProvinceCount: number;
  watchCandidateCount: number;
  alertCandidateCount: number;
  externalNotificationsEnabled: false;
  blockedReasons: string[];
  checks: AlertDryRunCheck[];
  candidateEvents: AlertCandidateEvent[];
}

export interface AlertAuditStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function hashFingerprint(value: string): string {
  // FNV-1a is only a compact display identifier. De-duplication always uses
  // the complete fingerprint, so hash collisions cannot merge audit records.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function copyThresholds(
  thresholds: AlertRuleProfile["thresholdsByProvince"],
): Record<string, ProvinceAlertThreshold> {
  return Object.fromEntries(
    Object.entries(thresholds ?? {})
      .sort(([left], [right]) => left.localeCompare(right, "th"))
      .map(([province, value]) => [
        province,
        { watch: value.watch, alert: value.alert },
      ]),
  );
}

export function createAlertAuditRecord(
  model: AlertModelSnapshot | null,
  profile: AlertRuleProfile,
  result: AlertDryRunResult,
  evaluatedAt: Date = new Date(),
): AlertAuditRecord {
  const thresholdsByProvince = copyThresholds(profile.thresholdsByProvince);
  const snapshot = {
    ruleProfileId: profile.profileId,
    ruleProfileVersion: profile.version,
    ruleProfileStatus: profile.status,
    ruleProfileMethodology: profile.methodology,
    ruleProfileApprovalReference: profile.approvalReference,
    ruleProfileEffectiveFromWeek: profile.effectiveFromWeek,
    thresholdsByProvince,
    sourceRepository: model?.source_repository ?? null,
    modelRevision: model?.model_revision ?? null,
    modelGeneratedAtUtc: model?.generated_at_utc ?? null,
    sourceRetrievedAtUtc: model?.source_retrieved_at_utc ?? null,
    historyEndWeek: model?.coverage.history_end_week ?? null,
    targetWeek: result.targetWeek,
    currentEpiWeek: result.currentEpiWeek,
    freshness: result.freshness,
    forecastLagWeeks: result.forecastLagWeeks,
    status: result.status,
    forecastProvinceCount: result.forecastProvinceCount,
    evaluatedProvinceCount: result.evaluatedProvinceCount,
    watchCandidateCount: result.watchCandidateCount,
    alertCandidateCount: result.alertCandidateCount,
    externalNotificationsEnabled: false as const,
    blockedReasons: [...result.blockedReasons],
    checks: result.checks.map((check) => ({ ...check })),
    candidateEvents: result.candidateEvents.map((event) => ({ ...event })),
  };

  const runFingerprint = JSON.stringify(snapshot);
  const evaluatedAtUtc = evaluatedAt.toISOString();

  return {
    id: `dry-run-${evaluatedAtUtc}-${hashFingerprint(runFingerprint)}`,
    runFingerprint,
    evaluatedAtUtc,
    ...snapshot,
  };
}

function isAuditRecord(value: unknown): value is AlertAuditRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AlertAuditRecord>;
  return typeof record.id === "string" &&
    typeof record.runFingerprint === "string" &&
    typeof record.evaluatedAtUtc === "string" &&
    typeof record.ruleProfileId === "string" &&
    typeof record.ruleProfileVersion === "string" &&
    typeof record.ruleProfileMethodology === "string" &&
    (record.ruleProfileStatus === "draft" || record.ruleProfileStatus === "approved") &&
    (record.status === "blocked" || record.status === "evaluated") &&
    typeof record.currentEpiWeek === "string" &&
    Array.isArray(record.blockedReasons) &&
    record.blockedReasons.every((reason) => typeof reason === "string") &&
    Array.isArray(record.checks) &&
    record.checks.every((check) =>
      Boolean(check) &&
      typeof check.id === "string" &&
      typeof check.label === "string" &&
      (check.status === "pass" || check.status === "warning" || check.status === "blocked")
    ) &&
    Array.isArray(record.candidateEvents) &&
    record.externalNotificationsEnabled === false;
}

export function readAlertAuditRecords(storage: AlertAuditStorage): AlertAuditRecord[] {
  try {
    const raw = storage.getItem(ALERT_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isAuditRecord)
      .slice(0, ALERT_AUDIT_MAX_RECORDS);
  } catch {
    return [];
  }
}

export function appendAlertAuditRecord(
  records: AlertAuditRecord[],
  record: AlertAuditRecord,
): AlertAuditRecord[] {
  if (records.some((existing) => existing.runFingerprint === record.runFingerprint)) {
    return records;
  }
  return [record, ...records].slice(0, ALERT_AUDIT_MAX_RECORDS);
}

export function writeAlertAuditRecords(
  storage: AlertAuditStorage,
  records: AlertAuditRecord[],
): boolean {
  try {
    storage.setItem(
      ALERT_AUDIT_STORAGE_KEY,
      JSON.stringify(records.slice(0, ALERT_AUDIT_MAX_RECORDS)),
    );
    return true;
  } catch {
    return false;
  }
}
