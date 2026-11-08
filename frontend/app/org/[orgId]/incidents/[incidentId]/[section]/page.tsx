import { notFound } from 'next/navigation';
import { WorkspaceRoute } from '@/components/workspace-route';
import { sections } from '@/lib/roles';
export default async function IncidentRoute({ params }: { params: Promise<{ orgId: string; incidentId: string; section: string }> }) {
  const { orgId, incidentId, section } = await params;
  if (!sections.some(item => item === section)) notFound();
  return <WorkspaceRoute organizationId={orgId} incidentId={incidentId} section={section as typeof sections[number]} />;
}
