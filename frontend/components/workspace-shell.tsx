"use client";
import Link from "./workspace-link";
import { useEffect, useState } from "react";
import { Search, Command, ArrowUpRight } from "lucide-react";
import { UrgentPages } from "./urgent-pages";
import { IncidentSelector, NotificationCenter } from "./incident-header";
import { Brand } from "./brand";
import { AccountMenu } from "./account-menu";
import { useAccess } from "./workspace-provider";
import { roleLabels, incidentBase, sections } from "@/lib/roles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Input } from "./ui/input";

export type Section = (typeof sections)[number] | "members" | "invitations";
export function WorkspaceShell({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const access = useAccess();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const base = incidentBase(access.organizationId, access.incidentId);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
            <button
              onClick={() => setSearch(true)}
              className="flex h-9 items-center gap-3 rounded-md border border-input px-3 text-sm text-muted-foreground md:w-[340px]"
              aria-label="Search workspace"
            >
              <Search size={16} />
              <span className="hidden md:block">Search or run a command…</span>
              <span className="ml-auto hidden items-center gap-1 rounded bg-muted px-1.5 text-xs lg:flex">
                <Command size={12} />K
              </span>
            </button>
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
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search workspace</DialogTitle>
            <DialogDescription>
              Jump to an incident page or an access management screen.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="divide-y divide-border">
            {[
              ...sections,
              ...(access.can("members:edit") ? ["members", "invitations"] : []),
            ]
              .filter((item) => item.includes(query.toLowerCase()))
              .map((item) => (
                <Link
                  onClick={() => setSearch(false)}
                  key={item}
                  className="flex justify-between py-3 text-sm capitalize"
                  href={
                    ["members", "invitations"].includes(item)
                      ? `/org/${access.organizationId}/${item}`
                      : `${base}/${item}`
                  }
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
