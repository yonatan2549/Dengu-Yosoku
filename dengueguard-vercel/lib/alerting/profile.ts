import type { AlertRuleProfile } from "./types";
import thresholdCandidate from "@/public/data/alert_threshold_candidates_77.json";

const candidateThresholds = Object.fromEntries(
  thresholdCandidate.thresholds.map((item) => [
    item.province,
    { watch: item.watch, alert: item.alert },
  ]),
);

const draftMethodology = [
  thresholdCandidate.methodology,
  "วิธีคำนวณ: P75/P90 แบบ Hyndman–Fan Type 7 จากจำนวนผู้ป่วยจริงรายสัปดาห์ 26 สัปดาห์ต่อจังหวัด",
  "ตรวจเชิงคำนวณ: 77/77 จังหวัด, quantile implementation อิสระตรงกัน, temporal split 18/8 สัปดาห์ และ leave-one-week-out sensitivity",
  "ข้อจำกัด: ข้อมูลเพียง 26 สัปดาห์, ยังไม่ normalize ด้วยประชากร/coverage และ Snapshot ต้นทางเป็น review_only",
  "Candidate นี้ใช้เป็นข้อมูลตั้งต้นใน Draft เท่านั้น ไม่ใช่เกณฑ์ระบาดวิทยาที่รับรองแล้ว",
].join(" · ");

/**
 * Application-side Draft candidate. Thresholds are available for inspection
 * and authorized administrator editing, but the profile remains unapproved.
 * The engine's approval, freshness and release gates must continue to block
 * public-health classification and alert candidates.
 */
export const ALERT_RULE_PROFILE: AlertRuleProfile = {
  profileId: "dengueyosoku-national-alerts",
  version: "0.1.0-draft",
  status: "draft",
  scope: "national_77_provinces",
  metric: "weekly_predicted_cases",
  methodology: draftMethodology,
  effectiveFromWeek: null,
  approvalReference: null,
  thresholdsByProvince: candidateThresholds,
  externalNotificationsEnabled: false,
};
