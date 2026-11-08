"use client";
import Link from "./workspace-link";
import { UrgentPages } from "./urgent-pages";
import { IncidentSelector, NotificationCenter } from "./incident-header";
import { Brand } from "./brand";
import { AccountMenu } from "./account-menu";
import { useAccess } from "./workspace-provider";
import { roleLabels, incidentBase, sections } from "@/lib/roles";
export type Section = (typeof sections)[number] | "members" | "invitations";
export function WorkspaceShell({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const access = useAccess();
  const base = incidentBase(access.organizationId, access.incidentId);
  return (
    <div className="aegis-workspace min-h-screen">
      <header className="border-b border-border">
        <div className="flex h-[60px] items-center justify-between gap-4 px-5 lg:px-[54px]">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link href="/organizations" aria-label="AEGIS organizations">
              <Brand />
            </Link>
            <span className="hidden h-7 border-l border-input sm:block" />
            <Link
              href="/organizations"
              className="hidden text-base text-foreground sm:block"
            >
              {access.organizationName}
            </Link>
            <span className="hidden text-muted-foreground sm:block">/</span>
            <IncidentSelector />
            <span
              className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground lg:block"
              title="Synthetic scenario. Incident documentation, scope, chat, tasks and in-app paging are functional. Approval and recovery workflows remain previews."
            >
              Demo
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-6">
            <NotificationCenter />
            <AccountMenu
              name={access.userName}
              role={roleLabels[access.role]}
            />
          </div>
        </div>
        <nav
          aria-label="Incident navigation"
          className="flex overflow-x-auto px-5 lg:px-[54px]"
        >
          {sections.map((item) => (
            <Link
              key={item}
              href={`${base}/${item}`}
              className={`mr-11 flex h-[54px] shrink-0 items-center border-b-2 text-lg capitalize ${section === item || (item === "team" && ["members", "invitations"].includes(section)) ? "border-white font-semibold text-white" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1680px] px-5 py-7 lg:px-[54px] lg:py-8">
        <UrgentPages />
        {children}
        <div data-testid="access-summary" className="sr-only">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Access active <span className="text-border">/</span>
            {roleLabels[access.role]}
          </span>
          <span>Synthetic scenario · Live incident documentation</span>
        </div>
      </main>
    </div>
  );
}
