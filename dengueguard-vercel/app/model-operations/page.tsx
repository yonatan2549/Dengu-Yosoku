import { ModelOperationsPanel } from "@/components/ModelOperationsPanel";
import { ModelReleaseIntegrityPanel } from "@/components/ModelReleaseIntegrityPanel";
import { ModelTemporalMonitorPanel } from "@/components/ModelTemporalMonitorPanel";
import { ModelRefreshObservabilityPanel } from "@/components/ModelRefreshObservabilityPanel";

export const dynamic = "force-dynamic";

export default function ModelOperationsPage() {
  return (
    <>
      <ModelOperationsPanel />
      <ModelReleaseIntegrityPanel />
      <ModelTemporalMonitorPanel />
      <ModelRefreshObservabilityPanel />
    </>
  );
}
