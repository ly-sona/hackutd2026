import { requireAccess } from "@/lib/server/session";
import { AccessError } from "@/lib/server/gateway";
import { AccessState } from "./access-state";
import { WorkspaceProvider } from "./workspace-provider";
import { IncidentDataProvider } from "./incident-data";
import { CoordinationDataProvider } from "./coordination-data";
import { RecoveryDataProvider } from "./recovery-data";
import { WorkspaceShell } from "./workspace-shell";
import { InvestigationWorkspace } from "./investigation-workspace";
export async function InvestigationRoute({
  organizationId,
  incidentId,
}: {
  organizationId: string;
  incidentId: string;
}) {
  let account;
  try {
    account = await requireAccess(
      `/org/${organizationId}/incidents/${incidentId}/investigation`,
      organizationId,
      incidentId,
      "incident:view",
    );
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <AccessState message={error.message} />;
  }
  return (
    <WorkspaceProvider
      organizationId={organizationId}
      incidentId={incidentId}
      expectedUserId={account.user.id}
    >
      <IncidentDataProvider>
        <CoordinationDataProvider>
          <RecoveryDataProvider>
            <WorkspaceShell section="overview">
              <InvestigationWorkspace />
            </WorkspaceShell>
          </RecoveryDataProvider>
        </CoordinationDataProvider>
      </IncidentDataProvider>
    </WorkspaceProvider>
  );
}
