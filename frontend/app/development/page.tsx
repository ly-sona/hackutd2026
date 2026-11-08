import { Providers } from '../providers';
import { HealthCheck } from '@/components/health-check';
export default function DevelopmentPage() { return <main className="mx-auto max-w-2xl px-6 py-20"><h1 className="mb-3 text-3xl font-semibold">AEGIS</h1><p className="mb-8 text-sm text-muted-foreground">Public synthetic connection diagnostics</p><Providers><HealthCheck /></Providers></main>; }
