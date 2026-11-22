export type MigrationProbeStatus = "ready" | "missing" | "not_checked" | "unavailable";
export type AlertWorkflowReadinessStatus =
  | "ready"
  | "partial"
  | "blocked"
  | "signed_out"
  | "forbidden"
  | "unavailable";

export interface AlertWorkflowReadinessReport {
  status: AlertWorkflowReadinessStatus;
  migration005: MigrationProbeStatus;
  migration006: MigrationProbeStatus;
  role: string | null;
  note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function migrationStatus(value: unknown): MigrationProbeStatus {
  return value === "ready" || value === "missing" || value === "not_checked"
    ? value
    : "unavailable";
}

/** Interprets the read-only profile API response; it never grants or changes permissions. */
export function assessAlertWorkflowReadiness(
  httpStatus: number,
  payload: unknown,
): AlertWorkflowReadinessReport {
  if (httpStatus === 401) {
    return { status: "signed_out", migration005: "not_checked", migration006: "not_checked", role: null, note: "กรุณาเข้าสู่ระบบเพื่ออ่านสถานะ Workflow" };
  }
  if (httpStatus === 403) {
    return { status: "forbidden", migration005: "not_checked", migration006: "not_checked", role: null, note: "บัญชีนี้ไม่มีสิทธิ์อ่านสถานะ Draft/Review Workflow" };
  }
  if (!isRecord(payload)) {
    return { status: "unavailable", migration005: "unavailable", migration006: "unavailable", role: null, note: "API ไม่ส่งข้อมูล Workflow Readiness ที่ตรวจสอบได้" };
  }

  const rawMigrations = isRecord(payload.workflowMigrations) ? payload.workflowMigrations : null;
  if (!rawMigrations) {
    const note = typeof payload.error === "string" ? payload.error : "ยังไม่ได้รับผลตรวจ Migration 005/006";
    return { status: "unavailable", migration005: "unavailable", migration006: "unavailable", role: typeof payload.role === "string" ? payload.role : null, note };
  }

  const migration005 = migrationStatus(rawMigrations.migration005);
  const migration006 = migrationStatus(rawMigrations.migration006);
  const role = typeof payload.role === "string" ? payload.role : null;
  const bothReady = migration005 === "ready" && migration006 === "ready";
  const anyMissing = migration005 === "missing" || migration006 === "missing";
  const allNotChecked = migration005 === "not_checked" && migration006 === "not_checked";

  let status: AlertWorkflowReadinessStatus;
  let note: string;
  if (httpStatus >= 200 && httpStatus < 300 && payload.ok === true && bothReady) {
    status = "ready";
    note = "อ่าน Draft Change Log และ Expert Review Decision History จาก Supabase ได้";
  } else if (anyMissing) {
    status = migration005 === "missing" && migration006 === "missing" ? "blocked" : "partial";
    note = "ยังขาด Migration สำหรับ Draft หรือ Expert Review Workflow บางส่วน";
  } else if (allNotChecked) {
    status = "unavailable";
    note = "ยังไม่พบ Rule Profile จึงยังตรวจ Workflow Migration ไม่ได้";
  } else {
    status = "unavailable";
    note = typeof payload.error === "string" ? payload.error : "ตรวจ Workflow Migration ไม่สำเร็จ";
  }

  return { status, migration005, migration006, role, note };
}
