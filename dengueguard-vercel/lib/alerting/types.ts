export type AlertRuleStatus = "draft" | "approved";
export type AlertSignalLevel = "WATCH" | "ALERT";
export type AlertCheckStatus = "pass" | "warning" | "blocked";
export type AlertDryRunStatus = "blocked" | "evaluated";
export type ForecastFreshness = "current_or_future" | "stale" | "unknown";

export interface ProvinceAlertThreshold {
  watch: number;
  alert: number;
}

export interface AlertRuleProfile {
  profileId: string;
  version: string;
  status: AlertRuleStatus;
  scope: "national_77_provinces";
  metric: "weekly_predicted_cases";
  methodology: string;
  effectiveFromWeek: string | null;
  approvalReference: string | null;
  thresholdsByProvince: Record<string, ProvinceAlertThreshold>;
  externalNotificationsEnabled: boolean;
}

export interface AlertModelSnapshot {
  model_revision: string | null;
  source_repository: string;
  province_count: number;
  provinces: string[];
  forecast: Array<{
    province: string;
    week_start: string;
    prediction: number;
  }>;
  coverage: {
    forecast_rows: number;
    forecast_week: string;
    history_end_week: string;
  };
}

export interface AlertDryRunCheck {
  id: string;
  label: string;
  status: AlertCheckStatus;
  detail: string;
}

export interface AlertCandidateEvent {
  eventId: string;
  province: string;
  weekStart: string;
  level: AlertSignalLevel;
  signal: "predicted_cases_threshold";
  predictedCases: number;
  threshold: number;
  ruleProfileId: string;
  ruleProfileVersion: string;
  snapshotIsStale: boolean;
  delivery: "not_sent_dry_run_only";
}

export interface AlertDryRunResult {
  status: AlertDryRunStatus;
  mode: "dry_run_only";
  ruleProfileId: string;
  ruleProfileVersion: string;
  ruleProfileStatus: AlertRuleStatus;
  targetWeek: string | null;
  currentEpiWeek: string;
  freshness: ForecastFreshness;
  forecastLagWeeks: number | null;
  forecastProvinceCount: number;
  evaluatedProvinceCount: number;
  watchCandidateCount: number;
  alertCandidateCount: number;
  externalNotificationsEnabled: false;
  blockedReasons: string[];
  checks: AlertDryRunCheck[];
  candidateEvents: AlertCandidateEvent[];
}
