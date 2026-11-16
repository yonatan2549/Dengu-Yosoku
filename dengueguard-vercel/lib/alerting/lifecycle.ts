import type { AlertCandidateEvent, AlertSignalLevel } from "./types";

export const ALERT_LIFECYCLE_STORAGE_KEY = "dengueyosoku.alert-lifecycle.v1";
export const ALERT_LIFECYCLE_MAX_EVENTS = 200;
export const ALERT_LIFECYCLE_MAX_TRANSITIONS = 25;

export type AlertLifecycleStatus = "new" | "acknowledged" | "resolved" | "reopened";
export type AlertLifecycleAction = "acknowledge" | "resolve" | "reopen";
export type AlertLifecycleTransitionKind =
  | "created"
  | "acknowledged"
  | "resolved"
  | "reopened"
  | "level_changed";

export interface AlertLifecycleTransition {
  id: string;
  kind: AlertLifecycleTransitionKind;
  atUtc: string;
  note: string;
  fromStatus?: AlertLifecycleStatus;
  toStatus?: AlertLifecycleStatus;
  fromLevel?: AlertSignalLevel;
  toLevel?: AlertSignalLevel;
}

export interface AlertLifecycleEvent {
  eventId: string;
  province: string;
  weekStart: string;
  signal: AlertCandidateEvent["signal"];
  level: AlertSignalLevel;
  predictedCases: number;
  threshold: number;
  ruleProfileId: string;
  ruleProfileVersion: string;
  snapshotIsStale: boolean;
  delivery: "not_sent_dry_run_only";
  status: AlertLifecycleStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  lastSeenAtUtc: string;
  lastSeenModelRevision: string | null;
  transitions: AlertLifecycleTransition[];
}

export interface AlertLifecycleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function transition(
  eventId: string,
  kind: AlertLifecycleTransitionKind,
  atUtc: string,
  note: string,
  details: Pick<AlertLifecycleTransition, "fromStatus" | "toStatus" | "fromLevel" | "toLevel"> = {},
): AlertLifecycleTransition {
  return {
    id: eventId + ":" + atUtc + ":" + kind,
    kind,
    atUtc,
    note,
    ...details,
  };
}

function keepRecentTransitions(
  transitions: AlertLifecycleTransition[],
): AlertLifecycleTransition[] {
  return transitions.slice(-ALERT_LIFECYCLE_MAX_TRANSITIONS);
}

function sortAndLimit(events: AlertLifecycleEvent[]): AlertLifecycleEvent[] {
  return [...events]
    .sort((left, right) => Date.parse(right.updatedAtUtc) - Date.parse(left.updatedAtUtc))
    .slice(0, ALERT_LIFECYCLE_MAX_EVENTS);
}

/**
 * Reconcile only events that are present in the latest dry-run candidates.
 * Missing candidates are deliberately not auto-resolved: an absent model
 * signal is not proof that a real-world outbreak or response has ended.
 */
export function reconcileAlertLifecycle(
  previousEvents: AlertLifecycleEvent[],
  candidates: AlertCandidateEvent[],
  modelRevision: string | null,
  evaluatedAt: Date = new Date(),
): AlertLifecycleEvent[] {
  const atUtc = evaluatedAt.toISOString();
  const byId = new Map(previousEvents.map((event) => [event.eventId, event]));
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.eventId)) continue;
    seen.add(candidate.eventId);

    const existing = byId.get(candidate.eventId);
    if (!existing) {
      const created: AlertLifecycleEvent = {
        eventId: candidate.eventId,
        province: candidate.province,
        weekStart: candidate.weekStart,
        signal: candidate.signal,
        level: candidate.level,
        predictedCases: candidate.predictedCases,
        threshold: candidate.threshold,
        ruleProfileId: candidate.ruleProfileId,
        ruleProfileVersion: candidate.ruleProfileVersion,
        snapshotIsStale: candidate.snapshotIsStale,
        delivery: "not_sent_dry_run_only",
        status: "new",
        createdAtUtc: atUtc,
        updatedAtUtc: atUtc,
        lastSeenAtUtc: atUtc,
        lastSeenModelRevision: modelRevision,
        transitions: [
          transition(candidate.eventId, "created", atUtc, "Candidate event created in dry-run only", {
            toStatus: "new",
            toLevel: candidate.level,
          }),
        ],
      };
      byId.set(candidate.eventId, created);
      continue;
    }

    let status = existing.status;
    let transitions = [...existing.transitions];

    if (status === "resolved") {
      status = "reopened";
      transitions.push(transition(
        candidate.eventId,
        "reopened",
        atUtc,
        "The same signal appeared again in a later dry-run evaluation",
        { fromStatus: "resolved", toStatus: "reopened" },
      ));
    }

    if (existing.level !== candidate.level) {
      transitions.push(transition(
        candidate.eventId,
        "level_changed",
        atUtc,
        "The simulated signal level changed between model evaluations",
        { fromLevel: existing.level, toLevel: candidate.level },
      ));
    }

    byId.set(candidate.eventId, {
      ...existing,
      province: candidate.province,
      weekStart: candidate.weekStart,
      signal: candidate.signal,
      level: candidate.level,
      predictedCases: candidate.predictedCases,
      threshold: candidate.threshold,
      ruleProfileId: candidate.ruleProfileId,
      ruleProfileVersion: candidate.ruleProfileVersion,
      snapshotIsStale: candidate.snapshotIsStale,
      delivery: "not_sent_dry_run_only",
      status,
      updatedAtUtc: atUtc,
      lastSeenAtUtc: atUtc,
      lastSeenModelRevision: modelRevision,
      transitions: keepRecentTransitions(transitions),
    });
  }

  return sortAndLimit([...byId.values()]);
}

export function transitionAlertLifecycleEvent(
  events: AlertLifecycleEvent[],
  eventId: string,
  action: AlertLifecycleAction,
  note: string,
  at: Date = new Date(),
): AlertLifecycleEvent[] {
  const current = events.find((event) => event.eventId === eventId);
  if (!current) return events;

  const atUtc = at.toISOString();
  const cleanNote = note.trim();
  let nextStatus: AlertLifecycleStatus | null = null;
  let kind: AlertLifecycleTransitionKind | null = null;

  if (action === "acknowledge" && (current.status === "new" || current.status === "reopened")) {
    nextStatus = "acknowledged";
    kind = "acknowledged";
  } else if (action === "resolve" && current.status !== "resolved" && cleanNote.length >= 3) {
    nextStatus = "resolved";
    kind = "resolved";
  } else if (action === "reopen" && current.status === "resolved") {
    nextStatus = "reopened";
    kind = "reopened";
  }

  if (!nextStatus || !kind) return events;

  const updated: AlertLifecycleEvent = {
    ...current,
    status: nextStatus,
    updatedAtUtc: atUtc,
    transitions: keepRecentTransitions([
      ...current.transitions,
      transition(eventId, kind, atUtc, cleanNote || "เปลี่ยนสถานะโดยผู้ทบทวน", {
        fromStatus: current.status,
        toStatus: nextStatus,
      }),
    ]),
  };

  return sortAndLimit(events.map((event) => event.eventId === eventId ? updated : event));
}

function isLifecycleTransition(value: unknown): value is AlertLifecycleTransition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AlertLifecycleTransition>;
  return typeof item.id === "string" &&
    typeof item.atUtc === "string" &&
    typeof item.note === "string" &&
    ["created", "acknowledged", "resolved", "reopened", "level_changed"].includes(String(item.kind));
}

function isLifecycleEvent(value: unknown): value is AlertLifecycleEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AlertLifecycleEvent>;
  return typeof item.eventId === "string" &&
    typeof item.province === "string" &&
    typeof item.weekStart === "string" &&
    (item.level === "WATCH" || item.level === "ALERT") &&
    typeof item.predictedCases === "number" &&
    Number.isFinite(item.predictedCases) &&
    typeof item.threshold === "number" &&
    Number.isFinite(item.threshold) &&
    typeof item.ruleProfileId === "string" &&
    typeof item.ruleProfileVersion === "string" &&
    typeof item.createdAtUtc === "string" &&
    typeof item.updatedAtUtc === "string" &&
    typeof item.lastSeenAtUtc === "string" &&
    (item.status === "new" || item.status === "acknowledged" || item.status === "resolved" || item.status === "reopened") &&
    item.delivery === "not_sent_dry_run_only" &&
    Array.isArray(item.transitions) &&
    item.transitions.every(isLifecycleTransition);
}

export function readAlertLifecycleEvents(storage: AlertLifecycleStorage): AlertLifecycleEvent[] {
  try {
    const raw = storage.getItem(ALERT_LIFECYCLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortAndLimit(parsed.filter(isLifecycleEvent));
  } catch {
    return [];
  }
}

export function writeAlertLifecycleEvents(
  storage: AlertLifecycleStorage,
  events: AlertLifecycleEvent[],
): boolean {
  try {
    storage.setItem(
      ALERT_LIFECYCLE_STORAGE_KEY,
      JSON.stringify(sortAndLimit(events)),
    );
    return true;
  } catch {
    return false;
  }
}
