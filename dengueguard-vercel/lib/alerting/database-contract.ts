import type {
  AlertCandidateEvent,
  AlertDryRunCheck,
  AlertDryRunResult,
  AlertRuleProfile,
} from "./types";
import type { AlertLifecycleAction, AlertLifecycleEvent } from "./lifecycle";

/**
 * Persistence boundary for a future authenticated server-side Alert Center.
 * Supabase Auth is scaffolded; the Alert database adapter is not connected.
 */
export const ALERT_DATABASE_SCHEMA_VERSION = 1;
export const ALERT_DATABASE_ENVIRONMENT_VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
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
 * Supabase project configuration is considered present only when its URL and
 * anon key exist. This does not establish database connectivity, RLS behavior,
 * or authorization correctness. It must only be evaluated on the server.
 */
export function hasAlertDatabaseConfiguration(
  environment: Record<string, string | undefined>,
): boolean {
  return Boolean(
    environment.SUPABASE_URL?.trim() &&
    environment.SUPABASE_ANON_KEY?.trim(),
  );
}
