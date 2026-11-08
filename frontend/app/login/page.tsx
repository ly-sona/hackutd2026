import { Brand } from '@/components/brand';
import { LoginForm } from '@/components/login-form';
import { safeReturnPath } from '@/lib/auth-navigation';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; state?: string }> }) {
  const params = await searchParams;
  return <main className="flex min-h-screen flex-col"><header className="border-b border-border px-6 py-5"><Brand /></header>
    <div className="m-auto w-full max-w-sm px-6 py-16"><div className="mb-8"><p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Independent access</p><h1 className="text-2xl font-medium tracking-tight">Sign in to AEGIS</h1><p className="mt-2 text-sm text-muted-foreground">Independent incident response access</p></div><LoginForm returnTo={safeReturnPath(params.returnTo)} state={params.state} /></div>
    <footer className="px-6 py-6 text-center text-xs text-muted-foreground">HackUTD prototype · Independent accounts, not production-hardened authentication</footer></main>;
}
