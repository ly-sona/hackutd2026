import { InvestigationRoute } from "@/components/investigation-route";
export default async function Page({
  params,
}: {
  params: Promise<{ orgId: string; incidentId: string }>;
}) {
  const { orgId, incidentId } = await params;
  return <InvestigationRoute organizationId={orgId} incidentId={incidentId} />;
}
