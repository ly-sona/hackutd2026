import { Brand } from '@/components/brand';
import { PageHelp } from '@/components/page-help';
import { InvitationAcceptance, type InvitationPreview } from '@/components/invitation-acceptance';
import { tokenHash } from '@/lib/server/password';
import { withGateway, snapshot } from '@/lib/server/gateway';
import { sessionHash } from '@/lib/server/session';
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let invitation: InvitationPreview = { status: 'invalid' }; let accountName: string | undefined;
  try {
    if (/^[a-zA-Z0-9_-]{43}$/.test(token)) invitation = await withGateway(async conn => JSON.parse(await conn.procedures.invitationPreview({ tokenHash: tokenHash(token) })) as InvitationPreview);
    const hash = await sessionHash(); if (hash) { try { accountName = (await snapshot(hash)).user.name; } catch { /* A valid invitation remains usable after signing in again. */ } }
  } catch { return <main className="mx-auto max-w-lg px-6 py-24"><Brand /><h1 className="mt-16 text-xl">Invitation service unavailable</h1><p className="mt-3 text-sm text-muted-foreground">Please try again when the access service is available.</p></main>; }
  return <main className="min-h-screen"><header className="flex items-center justify-between border-b border-border px-6 py-5"><Brand /><PageHelp /></header><div className="mx-auto max-w-md px-6 py-20"><InvitationAcceptance token={token} invitation={invitation} accountName={accountName} /></div></main>;
}
