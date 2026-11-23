export type AlertPresentationScenario =
  | "mixed"
  | "alert-heavy"
  | "watch-only"
  | "normal"
  | "partial";

export type AlertPresentationLevel = "ALERT" | "WATCH" | "NORMAL";
export type AlertPresentationEventStatus = "open" | "acknowledged" | "resolved";

export interface AlertPresentationRow {
  province: string;
  prediction: number;
  watchThreshold: number;
  alertThreshold: number;
  level: AlertPresentationLevel;
}

export interface AlertPresentationEvent {
  id: string;
  province: string;
  level: Exclude<AlertPresentationLevel, "NORMAL">;
  prediction: number;
  threshold: number;
  status: AlertPresentationEventStatus;
}

export interface AlertPresentationRun {
  id: string;
  scenario: AlertPresentationScenario;
  generatedAt: string;
  requestedProvinceCount: number;
  evaluatedProvinceCount: number;
  rows: AlertPresentationRow[];
  events: AlertPresentationEvent[];
}

export interface CreateAlertPresentationRunInput {
  provinces: string[];
  scenario: AlertPresentationScenario;
  watchThreshold: number;
  alertThreshold: number;
  generatedAt: string;
  id: string;
}

export interface AlertPresentationSummary {
  provinceCount: number;
  evaluatedProvinceCount: number;
  missingProvinceCount: number;
  alertCount: number;
  watchCount: number;
  normalCount: number;
  openCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
}

export function createAlertPresentationRun(
  input: CreateAlertPresentationRunInput,
): AlertPresentationRun {
  const { provinces, scenario, watchThreshold, alertThreshold, generatedAt, id } = input;

  if (!Number.isFinite(watchThreshold) || !Number.isFinite(alertThreshold) ||
      watchThreshold < 0 || alertThreshold <= watchThreshold + 8) {
    throw new Error("เกณฑ์สาธิตต้องเป็น 0 ≤ Watch และ Alert ต้องสูงกว่า Watch อย่างน้อย 9");
  }

  const uniqueProvinces = [...new Set(
    provinces.map((province) => province.trim()).filter(Boolean),
  )];

  if (uniqueProvinces.length !== 77) {
    throw new Error("ข้อมูลรายชื่อจังหวัดสำหรับการสาธิตต้องมี 77 จังหวัดไม่ซ้ำกัน");
  }

  const evaluatedProvinceCount = scenario === "partial" ? 54 : 77;
  const rows = uniqueProvinces.slice(0, evaluatedProvinceCount).map((province, index) => {
    let level: AlertPresentationLevel = "NORMAL";

    if (scenario === "mixed") {
      level = index < 8 ? "ALERT" : index < 26 ? "WATCH" : "NORMAL";
    } else if (scenario === "alert-heavy") {
      level = index < 18 ? "ALERT" : index < 34 ? "WATCH" : "NORMAL";
    } else if (scenario === "watch-only") {
      level = index < 26 ? "WATCH" : "NORMAL";
    } else if (scenario === "partial") {
      level = index < 6 ? "ALERT" : index < 18 ? "WATCH" : "NORMAL";
    }

    const prediction = level === "ALERT"
      ? alertThreshold + 4 + (index % 6) * 2
      : level === "WATCH"
        ? watchThreshold + 1 + (index % 4) * 2
        : Math.max(0, watchThreshold - 2 - (index % 5));

    return {
      province,
      prediction: Number(prediction.toFixed(1)),
      watchThreshold,
      alertThreshold,
      level,
    };
  });

  const events: AlertPresentationEvent[] = rows
    .filter((row): row is AlertPresentationRow & { level: "ALERT" | "WATCH" } => row.level !== "NORMAL")
    .map((row) => ({
      id: `${id}:${row.province}`,
      province: row.province,
      level: row.level,
      prediction: row.prediction,
      threshold: row.level === "ALERT" ? row.alertThreshold : row.watchThreshold,
      status: "open",
    }));

  return {
    id,
    scenario,
    generatedAt,
    requestedProvinceCount: uniqueProvinces.length,
    evaluatedProvinceCount,
    rows,
    events,
  };
}

export function transitionAlertPresentationEvent(
  events: AlertPresentationEvent[],
  eventId: string,
  action: "acknowledge" | "resolve" | "reopen",
): AlertPresentationEvent[] {
  return events.map((event) => {
    if (event.id !== eventId) return event;

    if (action === "acknowledge" && event.status === "open") {
      return { ...event, status: "acknowledged" };
    }
    if (action === "resolve" && event.status !== "resolved") {
      return { ...event, status: "resolved" };
    }
    if (action === "reopen" && event.status === "resolved") {
      return { ...event, status: "open" };
    }
    return event;
  });
}

export function summarizeAlertPresentationRun(
  run: AlertPresentationRun,
): AlertPresentationSummary {
  return {
    provinceCount: run.requestedProvinceCount,
    evaluatedProvinceCount: run.evaluatedProvinceCount,
    missingProvinceCount: Math.max(0, run.requestedProvinceCount - run.evaluatedProvinceCount),
    alertCount: run.rows.filter((row) => row.level === "ALERT").length,
    watchCount: run.rows.filter((row) => row.level === "WATCH").length,
    normalCount: run.rows.filter((row) => row.level === "NORMAL").length,
    openCount: run.events.filter((event) => event.status === "open").length,
    acknowledgedCount: run.events.filter((event) => event.status === "acknowledged").length,
    resolvedCount: run.events.filter((event) => event.status === "resolved").length,
  };
}
