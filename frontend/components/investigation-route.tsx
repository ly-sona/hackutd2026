import { WorkspaceShell } from "./workspace-shell";
import { InvestigationWorkspace } from "./investigation-workspace";

// The existing incident layout owns authentication and all incident providers.
export function InvestigationRoute() {
  return (
    <WorkspaceShell section="overview">
      <InvestigationWorkspace />
    </WorkspaceShell>
  );
}
