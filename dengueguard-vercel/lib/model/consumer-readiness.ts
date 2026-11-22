import type { ModelValidationReport } from "./validation";
import type { ModelSnapshotConsistencyReport } from "./snapshot-consistency";
import type { RefreshObservabilityStatus } from "./refresh-observability";

export type DashboardModelUseStatus =
  | "current-forecast"
  | "historical-only"
  | "reload-required"
  | "legacy-fallback";
export type PreventionModelUseStatus =
  | "forecast-context"
  | "historical-context"
  | "general-guidance-only";
export type AlertModelGateStatus = "pass" | "blocked";

export interface ModelConsumerReadinessReport {
  dashboard: {
    status: DashboardModelUseStatus;
    label: string;
    detail: string;
  };
  prevention: {
    status: PreventionModelUseStatus;
    label: string;
    detail: string;
  };
  alerts: {
    status: AlertModelGateStatus;
    label: string;
    detail: string;
  };
  riskClassificationAllowed: false;
  note: string;
}

/**
 * Derives safe downstream-use states from the same model validation,
 * browser/server fingerprint, and refresh reports. This is not an Alert
 * profile approval: it only describes whether model data can pass its gate.
 */
export function deriveModelConsumerReadiness(input: {
  validation: Pick<ModelValidationReport,
    "status" | "freshness" | "canUseForDryRun" | "canUseForCurrentAlerting">;
  consistency: Pick<ModelSnapshotConsistencyReport, "status">;
  refreshStatus: RefreshObservabilityStatus | "unavailable";
}): ModelConsumerReadinessReport {
  const { validation, consistency, refreshStatus } = input;
  const canDisplayValidatedModel = validation.canUseForDryRun &&
    validation.status !== "missing" && validation.status !== "blocked";
  const fingerprintsMatch = consistency.status === "match";
  const fingerprintNeedsReload = consistency.status === "mismatch" || consistency.status === "unverifiable";
  const freshnessVerified = validation.freshness === "current_or_future" && refreshStatus === "ready";

  let dashboard: ModelConsumerReadinessReport["dashboard"];
  let prevention: ModelConsumerReadinessReport["prevention"];

  if (!canDisplayValidatedModel || consistency.status === "missing") {
    dashboard = {
      status: "legacy-fallback",
      label: "ใช้ Dashboard ข้อมูลเดิม",
      detail: "ยังไม่มี Model Snapshot ที่ผ่านการตรวจสอบและยืนยันความตรงกันได้ จึงใช้ชุดข้อมูลเดิมตามโหมดสำรอง",
    };
    prevention = {
      status: "general-guidance-only",
      label: "มาตรการป้องกันพื้นฐาน",
      detail: "ยังไม่มี Forecast ที่ยืนยันได้ จึงไม่ใช้ค่าพยากรณ์กำหนดคำแนะนำเฉพาะพื้นที่",
    };
  } else if (fingerprintNeedsReload) {
    dashboard = {
      status: "reload-required",
      label: "ต้องโหลด Snapshot ใหม่",
      detail: "ไฟล์บน Browser กับ Server ไม่ตรงกันหรือยืนยัน SHA-256 ไม่ได้ จึงควรโหลดหน้าและ Model Snapshot ใหม่ก่อนใช้งานต่อ",
    };
    prevention = {
      status: "general-guidance-only",
      label: "ใช้มาตรการพื้นฐานเท่านั้น",
      detail: "ระหว่างที่ Snapshot ยังไม่ตรงกัน ให้แสดงเฉพาะมาตรการป้องกันทั่วไปและงดใช้ Forecast เป็นข้อมูลประกอบการดำเนินงาน",
    };
  } else if (freshnessVerified && fingerprintsMatch) {
    dashboard = {
      status: "current-forecast",
      label: "Forecast ผ่านการตรวจสอบข้อมูล",
      detail: "โครงสร้าง ความใหม่ ลำดับเวลา และ SHA-256 ของ Snapshot ผ่านการตรวจสอบ; ยังต้องพิจารณาข้อจำกัดของโมเดลก่อนใช้งาน",
    };
    prevention = {
      status: "forecast-context",
      label: "ใช้ Forecast เป็นข้อมูลประกอบได้",
      detail: "แสดงจำนวนที่คาดการณ์ประกอบการวางแผนได้ แต่ยังไม่จัดระดับความเสี่ยงหรือสร้างคำเตือนหากไม่มี Threshold ที่ผ่านการรับรอง",
    };
  } else {
    dashboard = {
      status: "historical-only",
      label: "แสดงผลได้เฉพาะย้อนหลัง",
      detail: "Snapshot ผ่านการตรวจความตรงกัน แต่ Forecast Week หรือ Refresh Observability ยังไม่ผ่านเกณฑ์ความใหม่สำหรับสถานการณ์ปัจจุบัน",
    };
    prevention = {
      status: "historical-context",
      label: "Forecast ใช้อ้างอิงย้อนหลัง",
      detail: "ใช้ดูแนวโน้มย้อนหลังได้ แต่ไม่ใช้กำหนดมาตรการเฉพาะพื้นที่จากสถานการณ์ปัจจุบัน; คงมาตรการพื้นฐานไว้",
    };
  }

  const alertDataReady = validation.canUseForCurrentAlerting &&
    fingerprintsMatch && refreshStatus === "ready";

  return {
    dashboard,
    prevention,
    alerts: alertDataReady
      ? {
          status: "pass",
          label: "ผ่าน Model/Data Gate",
          detail: "ข้อมูลโมเดลผ่านเงื่อนไขสำหรับการประเมินปัจจุบัน แต่ยังต้องผ่าน Alert Profile Readiness, Reviewer และกติกาสิทธิ์แยกต่างหาก",
        }
      : {
          status: "blocked",
          label: "บล็อก Model/Data Gate",
          detail: "Forecast freshness, validation, refresh chronology หรือ Browser/Server fingerprint ยังไม่ครบเงื่อนไข จึงไม่ควรใช้สร้าง Alert Candidate",
        },
    riskClassificationAllowed: false,
    note: "รายงานนี้แยกสิทธิ์การแสดงข้อมูลออกจากสิทธิ์การประเมิน Alert; ไม่ได้อนุมัติ Threshold, Alert Profile หรือเปิด External Notifications",
  };
}
