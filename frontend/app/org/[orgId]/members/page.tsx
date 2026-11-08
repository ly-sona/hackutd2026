import { WorkspaceRoute } from '@/components/workspace-route';
export default async function MembersRoute({ params }: { params: Promise<{ orgId: string }> }) { return <WorkspaceRoute organizationId={(await params).orgId} incidentId="IR-2041" section="members" />; }
