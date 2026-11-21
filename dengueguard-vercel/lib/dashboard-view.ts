export type DashboardDatasetView = "legacy" | "model";
export type DashboardDatasetPreference = "auto" | DashboardDatasetView;

/**
 * Select the national model whenever a validated 77-province snapshot exists.
 * Users can still explicitly switch back to the legacy ODPC4 dashboard.
 */
export function resolveDashboardDatasetView(
  preference: DashboardDatasetPreference,
  hasValidatedModel: boolean,
): DashboardDatasetView {
  if (preference === "legacy") return "legacy";
  return hasValidatedModel ? "model" : "legacy";
}

/**
 * Keep prevention guidance on the classic source until the validated model
 * snapshot targets the current epidemiological week. An explicit model choice
 * remains available for review, with staleness warnings in the page.
 */
export function resolvePreventionDatasetView(
  preference: DashboardDatasetPreference,
  hasValidatedModel: boolean,
  isCurrentModelWeek: boolean,
): DashboardDatasetView {
  if (preference === "legacy" || !hasValidatedModel) return "legacy";
  if (preference === "model") return "model";
  return isCurrentModelWeek ? "model" : "legacy";
}
