import { CoordinationDataProvider } from "./coordination-data";
import { IncidentDataProvider } from "./incident-data";
import { requireAccess } from "@/lib/server/session";
import { AccessError } from "@/lib/server/gateway";
import { WorkspaceProvider } from "./workspace-provider";
import { WorkspaceShell, type Section } from "./workspace-shell";
import { AccessState } from "./access-state";
import { IncidentPage } from "./incident-pages";
import { MembersPage, InvitationsPage } from "./member-administration";
export async function WorkspaceRoute({
  organizationId,
  incidentId,
  section,
}: {
  organizationId: string;
  incidentId: string;
  section: Section;
}) {
  const path = ["members", "invitations"].includes(section)
    ? `/org/${organizationId}/${section}`
    : `/org/${organizationId}/incidents/${incidentId}/${section}`;
  let account;
  try {
    account = await requireAccess(
      path,
      organizationId,
      incidentId,
      section === "members"
        ? "members:edit"
        : section === "invitations"
          ? "members:invite"
          : "incident:view",
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
          <WorkspaceShell section={section}>
            {section === "members" ? (
              <MembersPage />
            ) : section === "invitations" ? (
              <InvitationsPage />
            ) : (
              <IncidentPage section={section} />
            )}
          </WorkspaceShell>
        </CoordinationDataProvider>
      </IncidentDataProvider>
    </WorkspaceProvider>
  );
}
