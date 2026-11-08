"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  Search,
  Command,
  ArrowUpRight,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "./ui/dropdown-menu";

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
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-12">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/organizations" aria-label="AEGIS organizations">
              <Brand />
            </Link>
            <span className="hidden text-border sm:block">/</span>
            <Link
              href="/organizations"
              className="hidden text-base text-foreground sm:block"
            >
              {access.organizationName}
            </Link>
            <ChevronRight
              className="hidden text-muted-foreground sm:block"
              size={13}
            />
            <span className="truncate text-base">{access.incidentId}</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSearch(true)}
              className="flex h-9 items-center gap-3 rounded-md border border-border px-3 text-sm text-muted-foreground md:w-80"
              aria-label="Search workspace"
            >
              <Search size={16} />
              <span className="hidden md:block">Search or run a command…</span>
              <Command className="hidden lg:block" size={12} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Notifications"
                className="text-muted-foreground"
              >
                <Bell size={20} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  No new platform notifications.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
            <AccountMenu
              name={access.userName}
              role={roleLabels[access.role]}
            />
          </div>
        </div>
        <nav
          aria-label="Incident navigation"
          className="flex overflow-x-auto px-5 lg:px-12"
        >
          {sections.map((item) => (
            <Link
              key={item}
              href={`${base}/${item}`}
              className={`mr-9 shrink-0 border-b-2 py-3.5 text-base capitalize ${section === item || (item === "team" && ["members", "invitations"].includes(section)) ? "border-white text-white" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1680px] px-5 py-7 lg:px-12 lg:py-8">
        {children}
        <div
          data-testid="access-summary"
          className="mt-10 border-t border-border pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Access active <span className="text-border">/</span>
            {roleLabels[access.role]}
          </span>
          <span>Simulated incident · Access controls are functional</span>
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
