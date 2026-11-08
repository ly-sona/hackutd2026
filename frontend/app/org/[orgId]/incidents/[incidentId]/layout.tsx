import { WorkspaceRoute } from '@/components/workspace-route';
import { IncidentWorkspace } from '@/components/incident-workspace';

export default async function IncidentLayout({ params, children }: {
  params: Promise<{ orgId: string; incidentId: string }>;
  children: React.ReactNode;
}) {
  const { orgId, incidentId } = await params;
  return (
    <WorkspaceRoute organizationId={orgId} incidentId={incidentId} section="overview">
      <IncidentWorkspace>{children}</IncidentWorkspace>
    </WorkspaceRoute>
  );
}
