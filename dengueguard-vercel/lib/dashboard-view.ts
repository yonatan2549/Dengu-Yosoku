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
 * Prevention defaults to the legacy dataset unless a model snapshot is both
 * approved and current. A review-only model can still be opened explicitly
 * for inspection, where its review status and limitations are displayed.
 */
export function resolvePreventionDatasetView(
  preference: DashboardDatasetPreference,
  hasValidatedModel: boolean,
  isCurrentModelWeek: boolean,
  isApprovedModel: boolean,
): DashboardDatasetView {
  if (preference === "legacy" || !hasValidatedModel) return "legacy";
  if (preference === "model") return "model";
  return isApprovedModel && isCurrentModelWeek ? "model" : "legacy";
}
