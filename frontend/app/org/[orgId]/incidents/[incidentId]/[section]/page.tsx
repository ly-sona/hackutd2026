import { notFound } from 'next/navigation';
import { sections } from '@/lib/roles';
export default async function IncidentRoute({ params }: { params: Promise<{ orgId: string; incidentId: string; section: string }> }) {
  const { section } = await params;
  if (!sections.some(item => item === section)) notFound();
  // The shared incident layout owns the live workspace and selects its client view.
  return null;
}
