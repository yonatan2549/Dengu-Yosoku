import type {
  AlertCandidateEvent,
  AlertDryRunCheck,
  AlertDryRunResult,
  AlertRuleProfile,
} from "./types";
import type { AlertLifecycleAction, AlertLifecycleEvent } from "./lifecycle";

/**
 * Persistence boundary for a future authenticated server-side Alert Center.
 * No database client is implemented or enabled by this contract alone.
 */
export const ALERT_DATABASE_SCHEMA_VERSION = 1;
export const ALERT_DATABASE_ENVIRONMENT_VARIABLES = [
  "DENGUEYOSOKU_ALERT_DATABASE_URL",
  "DENGUEYOSOKU_ALERT_DATABASE_BACKEND_SECRET",
] as const;

export interface AlertEvaluationPersistenceInput {
  runFingerprint: string;
  result: AlertDryRunResult;
  modelRepository: string | null;
  modelRevision: string | null;
  modelGeneratedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  historyEndWeek: string | null;
  thresholdsSnapshot: Record<string, { watch: number; alert: number }>;
  actorId: string | null;
}

export interface AlertEventTransitionInput {
  eventId: string;
  action: AlertLifecycleAction;
  note: string;
  actorId: string;
  occurredAtUtc: string;
}

export interface AlertEventListFilter {
  query?: string;
  status?: AlertLifecycleEvent["status"] | "all";
  level?: AlertCandidateEvent["level"] | "all";
  province?: string;
  targetWeekFrom?: string;
  targetWeekTo?: string;
  limit?: number;
  offset?: number;
}

export interface AlertEventListResult {
  events: AlertLifecycleEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlertPersistenceHealth {
  mode: "disabled" | "ready" | "unavailable";
  schemaVersion: number;
  reason: string;
}

export interface AlertEventRepository {
  getHealth(): Promise<AlertPersistenceHealth>;
  saveEvaluation(
    input: AlertEvaluationPersistenceInput,
    profile: AlertRuleProfile,
    checks: AlertDryRunCheck[],
  ): Promise<{ runId: string; duplicate: boolean }>;
  reconcileCandidates(
    runId: string,
    candidates: AlertCandidateEvent[],
    modelRevision: string | null,
  ): Promise<AlertLifecycleEvent[]>;
  listEvents(filter: AlertEventListFilter): Promise<AlertEventListResult>;
  transitionEvent(input: AlertEventTransitionInput): Promise<AlertLifecycleEvent>;
}

/**
 * Configuration is considered complete only when both server-side secrets are
 * present. This checks presence, not connectivity, database permissions, or
 * authentication correctness. It must only be evaluated on the server.
 */
export function hasAlertDatabaseConfiguration(
  environment: Record<string, string | undefined>,
): boolean {
  return Boolean(
    environment.DENGUEYOSOKU_ALERT_DATABASE_URL?.trim() &&
    environment.DENGUEYOSOKU_ALERT_DATABASE_BACKEND_SECRET?.trim(),
  );
}
