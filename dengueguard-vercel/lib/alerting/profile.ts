import type { AlertRuleProfile } from "./types";

/**
 * Draft configuration only. No nationwide Watch/Alert threshold has been
 * approved yet, so the thresholds map intentionally remains empty.
 *
 * The dry-run engine must not infer thresholds from prediction counts,
 * historical quantiles, or the legacy ODPC4 rule set.
 */
export const ALERT_RULE_PROFILE: AlertRuleProfile = {
  profileId: "dengueyosoku-national-alerts",
  version: "0.1.0-draft",
  status: "draft",
  scope: "national_77_provinces",
  metric: "weekly_predicted_cases",
  methodology: "รอการกำหนดและทบทวนร่วมกับผู้เชี่ยวชาญด้านระบาดวิทยา",
  effectiveFromWeek: null,
  approvalReference: null,
  thresholdsByProvince: {},
  externalNotificationsEnabled: false,
};
