import { Providers } from '../providers';
import { HealthCheck } from '@/components/health-check';
import { PageHelp } from '@/components/page-help';
export default function DevelopmentPage() { return <main className="mx-auto max-w-2xl px-6 py-20"><div className="mb-3 flex items-center justify-between"><h1 className="text-3xl font-semibold">AEGIS</h1><PageHelp /></div><p className="mb-8 text-sm text-muted-foreground">Public synthetic connection diagnostics</p><Providers><HealthCheck /></Providers></main>; }
