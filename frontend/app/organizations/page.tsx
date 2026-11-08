import { NewIncident } from "@/components/incident-forms";
import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";
import { AccessState } from "@/components/access-state";
import { requireAccess } from "@/lib/server/session";
import { AccessError } from "@/lib/server/gateway";
import { roleLabels, incidentBase } from "@/lib/roles";
export default async function OrganizationsPage() {
  let account;
  try {
    account = await requireAccess("/organizations");
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return (
      <AccessState title="Access service unavailable" message={error.message} />
    );
  }
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-5">
        <Brand />
        <AccountMenu name={account.user.name} />
      </header>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mb-10">
          <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            Independent command center
          </p>
          <h1 className="text-3xl font-medium tracking-tight">
            Your organizations
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Choose an organization and assigned incident to continue.
          </p>
        </div>
        <div className="space-y-4">
          {account.access.map((access) => (
            <section
              key={access.organizationId}
              className="rounded-lg border border-border"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <Building2 size={18} className="text-muted-foreground" />
                <h2 className="font-medium">{access.organizationName}</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {roleLabels[access.role]}
                </span>
                {access.permissions.includes("incident:create") && (
                  <div className="shrink-0 [&>button]:h-8 [&>button]:px-3 [&>button]:text-sm">
                    <NewIncident
                      organizationId={access.organizationId}
                      responders={access.responders}
                    />
                  </div>
                )}
              </div>
              {access.incidents.map((incident) => (
                <Link
                  key={incident.id}
                  href={`${incidentBase(access.organizationId, incident.id)}/overview`}
                  className="flex items-center justify-between gap-5 px-5 py-5 hover:bg-muted/30"
                >
                  <div>
                    <p className="text-sm">
                      {incident.id}{" "}
                      <span className="ml-2 text-muted-foreground">
                        {incident.title}
                      </span>
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                      <ShieldCheck size={12} />
                      {incident.severity} · {incident.status} · Assigned
                      workspace
                    </p>
                  </div>
                  <ArrowRight size={17} />
                </Link>
              ))}
              {!access.incidents.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  No incident assignment. Contact an administrator.
                </p>
              )}
            </section>
          ))}
          {!account.access.length && (
            <div className="rounded-lg border border-border p-6">
              <h2 className="font-medium">No active organization membership</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your account is authenticated, but no workspace has been
                assigned. Open your invitation link or contact an AEGIS
                administrator. Organization creation is restricted to the
                trusted bootstrap process.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
