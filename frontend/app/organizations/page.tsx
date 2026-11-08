import { NewIncident } from "@/components/incident-forms";
import Link from "next/link";
import { ArrowRight, Building2, ChevronRight } from "lucide-react";
import { Brand, BrandMark } from "@/components/brand";
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
    <main className="relative isolate min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.065),transparent_70%)]"
      />
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-10">
        <Brand />
        <div className="flex items-center gap-5">
          <span className="hidden text-xs text-muted-foreground sm:block">
            Your response workspace
          </span>
          <AccountMenu name={account.user.name} />
        </div>
      </header>

      <section className="relative mx-auto max-w-4xl px-5 pb-10 pt-8 text-center">
        <div
          aria-hidden="true"
          className="relative mx-auto mb-7 flex size-24 items-center justify-center rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.02] shadow-[0_0_80px_-15px_rgba(255,255,255,0.15)]"
        >
          <BrandMark className="size-14 sm:size-16" />
        </div>
        <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground sm:text-xs">
          Independent incident response
        </p>
        <h1 className="text-6xl font-semibold leading-none tracking-tight sm:text-7xl">
          AEGIS
        </h1>
        <p className="mt-6 text-xl font-medium tracking-tight sm:text-2xl">
          Clarity when it matters.
        </p>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-4 text-[11px] text-muted-foreground sm:gap-6">
          <span>Investigate</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-white/20" />
          <span>Coordinate</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-white/20" />
          <span>Recover</span>
        </div>
      </section>

      <section
        aria-labelledby="workspace-heading"
        className="mx-auto max-w-5xl px-5 pb-12 sm:px-10"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-7">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Welcome back, {account.user.name}
            </p>
            <h2 id="workspace-heading" className="text-xl font-medium tracking-tight">
              Your organizations
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose an incident to enter your workspace
          </p>
        </div>
        <div className="space-y-5">
          {account.access.map((access) => (
            <section
              key={access.organizationId}
              aria-label={access.organizationName}
              className="overflow-hidden rounded-xl border border-border bg-white/[0.015]"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.03]">
                    <Building2 size={18} className="text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-medium">
                      {access.organizationName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {roleLabels[access.role]}
                    </p>
                  </div>
                </div>
                {access.permissions.includes("incident:create") && (
                  <div className="shrink-0 [&>button]:h-9 [&>button]:px-3 [&>button]:text-sm">
                    <NewIncident
                      organizationId={access.organizationId}
                      responders={access.responders}
                    />
                  </div>
                )}
              </div>
              <div className="divide-y divide-border">
                {access.incidents.map((incident) => (
                  <Link
                    key={incident.id}
                    href={`${incidentBase(access.organizationId, incident.id)}/overview`}
                    className="group flex items-center justify-between gap-4 px-5 py-5 transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6"
                  >
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-mono text-muted-foreground">{incident.id}</span>
                        <span className="text-white/20" aria-hidden="true">/</span>
                        <span className={
                          incident.severity === "Critical" || incident.severity === "High"
                            ? "text-red-400"
                            : incident.severity === "Medium"
                              ? "text-amber-300"
                              : "text-muted-foreground"
                        }>
                          {incident.severity}
                        </span>
                        <span className="text-muted-foreground">{incident.status}</span>
                      </div>
                      <p className="break-words text-sm font-medium leading-6 sm:text-base">
                        {incident.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-xs text-muted-foreground group-hover:text-foreground sm:block">
                        Open workspace
                      </span>
                      <ArrowRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" aria-hidden="true" />
                    </div>
                  </Link>
                ))}
              </div>
              {!access.incidents.length && (
                <div className="px-5 py-8 sm:px-6">
                  <p className="text-sm font-medium">Your workspace is ready</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {access.permissions.includes("incident:create")
                      ? "Create an incident to start coordinating your response."
                      : "No incident assignment yet. Contact an administrator to get started."}
                  </p>
                </div>
              )}
            </section>
          ))}
          {!account.access.length && (
            <div className="rounded-xl border border-border bg-white/[0.015] p-6 sm:p-8">
              <h3 className="font-medium">No active organization membership</h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Your account is ready. Open your invitation link or contact an
                AEGIS administrator to join a workspace.
              </p>
            </div>
          )}
        </div>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Independent access. A coordinated response.</span>
          <span className="inline-flex items-center gap-1.5">
            AEGIS <ChevronRight size={12} aria-hidden="true" /> Your workspace
          </span>
        </footer>
      </section>
    </main>
  );
}
