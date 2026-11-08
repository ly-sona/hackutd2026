"use client";
import Link from "next/link";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import {
  ArrowRight,
  ChevronRight,
  ChevronDown,
  FileText,
  Search,
  Paperclip,
  Users,
  Send,
  Play,
  Mail,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { tables } from "@/src/module_bindings";
import {
  demoIncident,
  simulatedConversation,
  demoRequests,
} from "@/lib/demo-incident";
import { useAccess } from "./workspace-provider";
import { roleLabels } from "@/lib/roles";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Avatar } from "./account-menu";
import { InviteResponder, selectClass } from "./member-administration";
import { ScopeGraph } from "./scope-graph";
import type { Section } from "./workspace-shell";

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function IncidentPage({ section }: { section: Section }) {
  if (section === "scope") return <ScopePage />;
  if (section === "operations") return <OperationsPage />;
  if (section === "team") return <TeamPage />;
  if (section === "timeline") return <TimelinePage />;
  return <OverviewPage />;
}
function OverviewPage() {
  const access = useAccess();
  const [members] = useTable(tables.visibleMembers);
  const responderCount = members.filter(
    (m) =>
      m.organizationId === access.organizationId &&
      m.status === "active" &&
      m.incidentId === access.incidentId,
  ).length;
  const attention = [
    {
      title: "Conflicting isolation reports",
      detail: "Outbound traffic observed after isolation was reported.",
      owner: "Jordan Davis",
      tone: "bg-red-400",
    },
    {
      title: "Vendor approval depends on affected SSO",
      detail: "An independent approval route is available.",
      owner: "Maya Chen",
      tone: "bg-amber-400",
    },
    {
      title: "Verify October customer exposure",
      detail:
        "Access path identified. Record-level impact remains unconfirmed.",
      owner: "Alex Rivera",
      tone: "bg-emerald-400",
    },
  ];
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-1.5 font-mono text-sm tracking-wide">
            INCIDENT IR-2041
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">
            {demoIncident.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {demoIncident.summary}
          </p>
        </div>
        <div className="flex items-center gap-5 pt-4">
          <Badge
            variant="outline"
            className="border-red-400 px-3 py-1 text-sm font-normal text-red-400"
          >
            Critical
          </Badge>
          <Button disabled title="Technical findings are planned for Phase 2">
            Add finding
          </Button>
        </div>
      </div>
      <div className="mb-10 grid grid-cols-2 gap-y-6 lg:grid-cols-4">
        {[
          { label: "Compromised systems", value: "2" },
          { label: "Groups to investigate", value: "3" },
          { label: "Decisions pending", value: "2" },
          { label: "Responders", value: String(responderCount) },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={`py-1 ${index > 0 ? "border-l border-border pl-6" : ""}`}
          >
            <p className="text-3xl font-semibold">{metric.value}</p>
            <p className="mt-1 text-sm">{metric.label}</p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="mb-4 text-xl font-semibold">Needs your attention</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {attention.map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-5 px-4 py-4"
              >
                <span className={`size-3 shrink-0 rounded-full ${item.tone}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
                  <Avatar name={item.owner} small />
                  <span className="text-xs text-muted-foreground">
                    Assigned to{" "}
                    {item.owner
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <ArrowRight size={16} />
                </div>
              </div>
            ))}
          </div>
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-semibold">Affected operations</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Operation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoIncident.operations.map((operation) => (
                    <TableRow key={operation.name}>
                      <TableCell className="py-3 pl-4 font-medium">
                        {operation.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-normal ${operation.status === "Restricted" ? "border-red-400/60 text-red-400" : "border-emerald-400/60 text-emerald-400"}`}
                        >
                          {operation.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
        <section>
          <h2 className="mb-6 text-xl font-semibold">Recent activity</h2>
          <div className="ml-1 border-l border-border">
            {[
              demoIncident.timeline[4],
              demoIncident.timeline[2],
              demoIncident.timeline[1],
            ].map((event) => (
              <div key={event.id} className="relative flex gap-5 pb-7 pl-7">
                <span className="absolute top-1.5 -left-1.5 size-2.5 rounded-full bg-white" />
                <time className="text-xs tabular-nums text-muted-foreground">
                  {event.time}
                </time>
                <div>
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {event.id === "event-5"
                      ? "Isolation report conflicts with observed outbound traffic."
                      : event.id === "event-3"
                        ? "Evidence package EV-018 added to the synthetic incident."
                        : "Affected systems reported isolated in the customer platform."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function ScopePage() {
  const access = useAccess();
  return (
    <>
      <PageHeading
        title="Scope & evidence"
        description="Trace access, evidence, and business dependencies."
        action={
          <Button
            variant="outline"
            disabled
            title="Live filtering is planned for Phase 3"
          >
            <SlidersHorizontal size={15} />
            Filter
          </Button>
        }
      />
      {access.can("scope:view") ? (
        <ScopeGraph />
      ) : (
        <div className="rounded-md border border-border p-8">
          <h2 className="font-medium">Scope access is restricted</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your role can review business operations. Technical scope
            information requires an assigned investigation or review role.
          </p>
        </div>
      )}
    </>
  );
}
function OperationsPage() {
  const access = useAccess();
  const [selected, setSelected] = useState(demoRequests[0]);
  return (
    <>
      <PageHeading
        title="Operations"
        description="Keep essential work moving independently."
        action={
          <Button
            variant="outline"
            disabled
            title="Requests are planned for a later phase"
          >
            New request
          </Button>
        }
      />
      <p className="mb-5 text-sm text-muted-foreground">
        1 needs review <span className="mx-2">·</span>1 in review{" "}
        <span className="mx-2">·</span>1 authorized example{" "}
        <span className="ml-2 text-xs">(all synthetic)</span>
      </p>
      <div className="grid border-t border-border pt-5 lg:grid-cols-[35%_1fr]">
        <aside className="border-b border-border pb-6 lg:border-r lg:border-b-0 lg:pr-5">
          <h2 className="mb-5 text-xl font-semibold">Requests</h2>
          {demoRequests.map((request) => (
            <button
              key={request.id}
              onClick={() => setSelected(request)}
              className={`flex w-full items-center justify-between gap-4 border-b border-border px-4 py-4 text-left ${selected.id === request.id ? "border-l-[3px] border-l-white bg-muted/35" : "border-l-[3px] border-l-transparent hover:bg-muted/15"}`}
            >
              <span>
                <span className="block text-base font-semibold">
                  {request.title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {request.id}
                  {request.amount !== "—" && ` · ${request.amount}`}
                </span>
              </span>
              <span
                className={`flex shrink-0 items-center gap-2 text-xs ${request.status.startsWith("Authorized") ? "text-emerald-400" : "text-amber-300"}`}
              >
                <span className="size-2 rounded-full bg-current" />
                {request.status}
              </span>
            </button>
          ))}
        </aside>
        <section className="min-w-0 pt-6 lg:pt-0 lg:pl-8">
          <p className="mb-3 text-sm text-muted-foreground">
            {selected.id} <span className="mx-2">/</span>
            {selected.type}
          </p>
          <div className="flex justify-between gap-4">
            <h2 className="text-2xl font-semibold">{selected.title}</h2>
            <span className="text-2xl font-semibold">{selected.amount}</span>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            {selected.description}
          </p>
          <dl className="my-6 grid max-w-xl grid-cols-[150px_1fr] gap-y-2 text-sm">
            <dt>Requester</dt>
            <dd className="text-muted-foreground">{selected.requester}</dd>
            <dt>Normal route</dt>
            <dd className="text-muted-foreground">
              Blocked by compromised SSO
            </dd>
          </dl>
          <div className="border-t border-border pt-5">
            <h3 className="mb-3 text-lg font-semibold">Independent approval</h3>
            {selected.participants.map((name, index) => (
              <div
                key={name}
                className="flex items-center gap-4 border-b border-border py-4"
              >
                <Avatar name={name} />
                <div>
                  <p className="font-semibold">
                    {name}
                    {name === access.userName && " · You"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {name === "Priya Shah"
                      ? "Legal"
                      : name === "Maya Chen"
                        ? "Commander"
                        : "Assigned reviewer"}
                  </p>
                </div>
                <span
                  className={`ml-auto text-sm ${index === 0 ? "text-emerald-400" : "text-amber-300"}`}
                >
                  {index === 0 ? "Reviewed · Demo" : "Pending"}
                </span>
              </div>
            ))}
          </div>
          <details className="border-b border-border py-5">
            <summary className="cursor-pointer text-base font-semibold">
              Fallback rationale & evidence
            </summary>
            <p className="mt-3 text-sm text-muted-foreground">
              Purchasing → Corporate SSO · EV-011
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Synthetic evidence identifies the corporate authentication
              dependency. No external purchasing system is connected.
            </p>
          </details>
          <div className="mt-6 flex flex-wrap gap-4">
            <Button
              disabled
              className="min-w-56"
              title={
                access.can("operations:approve")
                  ? "Two-person approval is planned for a later phase"
                  : "Your role does not grant approval authority"
              }
            >
              Approve request
            </Button>
            <Button disabled variant="ghost">
              Request changes
            </Button>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Two distinct authorized approvers will be required. Approval is
            disabled in Phase 1; no payment or recovery action is executed.
            {access.role === "administrator" &&
              " Administrator access does not grant approval authority."}
          </p>
        </section>
      </div>
    </>
  );
}
function TeamPage() {
  const access = useAccess();
  const [members, ready] = useTable(tables.visibleMembers);
  const [query, setQuery] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const allMembers = members.filter(
    (m) => m.organizationId === access.organizationId,
  );
  const roster = allMembers.filter(
    (m) => m.status === "active" && m.incidentId === access.incidentId,
  );
  const direct = allMembers.filter(
    (m) =>
      m.userId !== access.userId &&
      m.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Team"
        description="IR-2041 · Responders and conversations"
        action={
          <div className="flex gap-3">
            {access.can("members:edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  aria-label="Manage organization members"
                  href={`/org/${access.organizationId}/members`}
                >
                  Manage members
                </Link>
              </Button>
            )}
            <InviteResponder />
          </div>
        }
      />
      <div className="grid min-h-[580px] gap-7 lg:grid-cols-[29%_1fr]">
        <aside className="border-b border-border pb-6 lg:border-r lg:border-b-0 lg:pr-6">
          <div className="relative mb-6">
            <Search
              size={16}
              className="absolute top-2.5 left-3 text-muted-foreground"
            />
            <Input
              aria-label="Find a conversation"
              placeholder="Find a conversation"
              className="pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <h2 className="mb-3 text-xs font-semibold tracking-wide">
            INCIDENT CHAT
          </h2>
          <div className="mb-6 flex items-center gap-4 rounded-md border-l-[3px] border-white bg-muted/45 px-4 py-3">
            <Avatar name="Response team" />
            <div>
              <p className="text-sm font-semibold">IR-2041 · Response team</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {roster.length} authorized members
              </p>
              <p className="mt-1 text-xs text-muted-foreground underline underline-offset-4">
                Incident group chat · Demo
              </p>
            </div>
          </div>
          <h2 className="mb-4 text-xs font-semibold tracking-wide">
            DIRECT MESSAGES{" "}
            <span className="font-normal text-muted-foreground">
              · Simulated
            </span>
          </h2>
          <div className="space-y-5">
            {direct.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar name={member.name} />
                <div>
                  <p className="text-sm font-semibold">{member.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {member.userId === "taylor"
                      ? "External analyst"
                      : roleLabels[member.role]}{" "}
                    <span
                      className={`ml-1 inline-block size-1.5 rounded-full ${member.status !== "active" ? "bg-neutral-500" : member.userId === "alex" ? "bg-amber-400" : "bg-emerald-400"}`}
                    />
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {member.status !== "active"
                      ? "Pending access · Unavailable"
                      : member.userId === "alex"
                        ? "Busy · Verify traffic source"
                        : "Available · Demo presence"}
                  </p>
                  {member.expiresAt !== 0n && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] italic text-muted-foreground">
                      <Clock3 size={11} />
                      Temporary access
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!ready && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading members…
            </p>
          )}
          {ready && !direct.length && (
            <p className="text-sm text-muted-foreground">
              No conversations match your search.
            </p>
          )}
          <div className="mt-7 space-y-4 border-y border-border py-5">
            {access.can("members:edit") && (
              <Link
                className="flex items-center gap-3 text-sm"
                href={`/org/${access.organizationId}/members`}
              >
                <Users size={17} />
                Manage members
              </Link>
            )}
            {access.can("members:invite") && (
              <Link
                className="flex items-center gap-3 text-sm"
                href={`/org/${access.organizationId}/invitations`}
              >
                <Mail size={17} />
                Invitations
              </Link>
            )}
            {!access.can("members:edit") && (
              <p className="text-xs leading-5 text-muted-foreground">
                Membership changes require an organization administrator.
              </p>
            )}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs">
            You <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">Access active</span>
          </p>
        </aside>
        <section className="flex min-w-0 flex-col">
          <div className="border-b border-border pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <Users size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">
                    IR-2041 · Response team
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created with this incident · {roster.length} authorized
                    members
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMembers(true)}
              >
                Members
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex -space-x-1.5">
                {roster.map((member) => (
                  <Avatar key={member.id} name={member.name} small />
                ))}
              </div>
              <span className="hidden text-border sm:inline">|</span>
              <span className="text-xs text-muted-foreground">
                Commander · Security · Legal · Operations
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-7 py-5">
            <p className="mb-7 text-center text-xs text-muted-foreground">
              Simulated conversation · Messaging is planned for Phase 4
            </p>
            {simulatedConversation.map((message, index) => (
              <div key={message.name} className="flex items-start gap-4">
                <Avatar name={message.name} />
                <div>
                  <div className="mb-1.5 flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {message.name}
                    </span>
                    <time className="text-xs text-muted-foreground">
                      {message.time}
                    </time>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {message.message}
                  </p>
                  {index === 0 && (
                    <div className="mt-3 space-y-2">
                      <Button disabled variant="outline" size="sm">
                        <FileText size={13} />
                        EV-018 · Network log
                      </Button>
                      <p>
                        <button
                          disabled
                          className="text-xs text-muted-foreground underline underline-offset-4"
                          title="Tasks are planned for Phase 2"
                        >
                          Create task
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(event) => event.preventDefault()}
            className="mt-8 flex flex-wrap items-center gap-3 border-b border-border pb-3"
          >
            <Input
              disabled
              placeholder="Message the response team…"
              aria-label="Demo message composer"
              className="min-w-40 flex-1 border-0 bg-transparent p-0 shadow-none dark:bg-transparent"
            />
            <span className="text-[11px] text-muted-foreground">
              Incident members only · Demo
            </span>
            <Button
              disabled
              variant="ghost"
              size="icon"
              aria-label="Attach file"
            >
              <Paperclip size={17} />
            </Button>
            <Button disabled size="sm">
              <Send size={12} />
              Send
            </Button>
          </form>
        </section>
      </div>
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Incident members</DialogTitle>
            <DialogDescription>
              Current authorized access to {access.incidentId}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {roster.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar name={member.name} small />
                <div>
                  <p className="text-sm">{member.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {roleLabels[member.role]}
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto text-emerald-400">
                  Active
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function TimelinePage() {
  const [selected, setSelected] = useState(demoIncident.timeline[4]);
  const [filter, setFilter] = useState("all");
  const events = [...demoIncident.timeline]
    .reverse()
    .filter((event) => filter === "all" || event.severity === filter);
  return (
    <>
      <PageHeading
        title="Timeline"
        description="What happened, what matters, and what comes next."
        action={
          <Button variant="outline" disabled>
            <Play size={15} />
            Replay
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-6 border-b border-border pb-4">
        <select
          aria-label="Filter timeline events"
          className={`${selectClass} max-w-44`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All events</option>
          <option value="critical">Urgent</option>
          <option value="warning">Needs review</option>
          <option value="info">Informational</option>
        </select>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <input type="checkbox" disabled />
          Since my last visit
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          Nov 7 · CST · Newest first · Synthetic
        </span>
      </div>
      <div className="grid min-h-[540px] gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => setSelected(event)}
              className={`flex w-full items-start gap-5 border-b border-border px-4 py-5 text-left ${selected.id === event.id && event.severity === "critical" ? "rounded-md border-l-[4px] border-l-red-400 bg-red-400/10" : selected.id === event.id ? "bg-muted/30" : "hover:bg-muted/15"}`}
            >
              <time className="mt-1 w-14 shrink-0 font-mono text-sm tracking-widest">
                {event.time}
              </time>
              <span
                className={`mt-2 size-2.5 shrink-0 rounded-full ${event.severity === "critical" ? "bg-red-400" : event.severity === "warning" ? "bg-amber-400" : event.id === "event-4" ? "bg-emerald-400" : "bg-neutral-500"}`}
              />
              <div>
                <p className="text-base font-semibold">
                  {event.severity === "critical" && (
                    <span className="mr-2 text-red-400">Urgent ·</span>
                  )}
                  {event.title}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {event.actor} · {event.label}
                </p>
              </div>
              <ChevronRight size={18} className="mt-1 ml-auto shrink-0" />
            </button>
          ))}
        </section>
        <aside className="border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <p
            className={`mb-3 text-sm ${selected.severity === "critical" ? "text-red-400" : "text-amber-300"}`}
          >
            ● {selected.severity === "critical" ? "Urgent" : "Review context"}{" "}
            <span className="text-muted-foreground">· Unresolved example</span>
          </p>
          <h2 className="text-2xl font-semibold">
            {selected.id === "event-5"
              ? "Is the database isolated?"
              : selected.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Customer Database · Flagged {selected.time} CST
          </p>
          <h3 className="mt-8 mb-3 text-base font-semibold">
            Why it needs review
          </h3>
          {selected.id === "event-5" ? (
            <>
              <p className="mb-2 text-sm">
                <span className="mr-5 font-mono">09:18</span>Isolation reported
              </p>
              <p className="text-sm">
                <span className="mr-5 font-mono">09:21</span>Outbound traffic
                observed
              </p>
              <p className="mt-5 text-sm text-muted-foreground">
                Containment is not yet verified.
              </p>
            </>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {selected.detail}
            </p>
          )}
          <h3 className="mt-8 mb-3 text-base font-semibold">Next step</h3>
          <p className="text-sm">Verify the traffic source and isolation.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Alex Rivera is investigating in this fictional scenario.
          </p>
          <Button disabled variant="outline" className="mt-6">
            Review evidence
          </Button>
          <details className="mt-7 border-t border-border pt-5">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
              Sources & audit details
              <ChevronDown size={15} />
            </summary>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {selected.detail} This is synthetic incident history; actual
              security audit events are available under Manage members.
            </p>
          </details>
        </aside>
      </div>
    </>
  );
}
