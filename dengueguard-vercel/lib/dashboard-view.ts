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
