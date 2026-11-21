import { evaluateAlertDryRun } from "./engine";
import type { AlertDryRunResult, AlertModelSnapshot, AlertRuleProfile } from "./types";

export type ProvinceRiskLevel = "ปกติ" | "เฝ้าระวัง" | "เตือนระบาด";

export interface ProvinceRiskRow {
  province: string;
  weekStart: string;
  prediction: number;
  watchThreshold: number;
  alertThreshold: number;
  level: ProvinceRiskLevel;
}

export type NationwideRiskClassification =
  | {
      status: "classified";
      targetWeek: string;
      rows: ProvinceRiskRow[];
      evaluation: AlertDryRunResult;
      reason: null;
    }
  | {
      status: "unclassified";
      targetWeek: string | null;
      rows: [];
      evaluation: AlertDryRunResult;
      reason: string;
    };

/**
 * Reuses the Alert Dry-run gates for map/table/prevention classification.
 * No colour is emitted unless the model is complete, fresh and the
 * nationwide Rule Profile is approved with all 77 valid province thresholds.
 */
export function classifyNationwideRisk(
  model: AlertModelSnapshot | null,
  profile: AlertRuleProfile,
  currentEpiWeek: string,
): NationwideRiskClassification {
  const evaluation = evaluateAlertDryRun(model, profile, currentEpiWeek);
  if (evaluation.status !== "evaluated" || !model || !evaluation.targetWeek) {
    return {
      status: "unclassified",
      targetWeek: evaluation.targetWeek,
      rows: [],
      evaluation,
      reason: evaluation.blockedReasons.length
        ? evaluation.blockedReasons.join(" · ")
        : "ข้อมูลยังไม่ผ่านเงื่อนไขสำหรับจำแนกระดับความเสี่ยง",
    };
  }

  const rows = model.forecast.map((row): ProvinceRiskRow => {
    const threshold = profile.thresholdsByProvince[row.province];
    const level: ProvinceRiskLevel = row.prediction >= threshold.alert
      ? "เตือนระบาด"
      : row.prediction >= threshold.watch
        ? "เฝ้าระวัง"
        : "ปกติ";
    return {
      province: row.province,
      weekStart: row.week_start,
      prediction: row.prediction,
      watchThreshold: threshold.watch,
      alertThreshold: threshold.alert,
      level,
    };
  });

  return {
    status: "classified",
    targetWeek: evaluation.targetWeek,
    rows,
    evaluation,
    reason: null,
  };
}
