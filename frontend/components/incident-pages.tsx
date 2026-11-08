"use client";
import { LiveOverview, LiveTimeline } from "./live-incident";
import Link from "next/link";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import {
  FileText,
  Search,
  Paperclip,
  Users,
  Send,
  Mail,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";
import { tables } from "@/src/module_bindings";
import { simulatedConversation, demoRequests } from "@/lib/demo-incident";
import { useAccess } from "./workspace-provider";
import { roleLabels } from "@/lib/roles";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Avatar } from "./account-menu";
import { InviteResponder } from "./member-administration";
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
  if (section === "scope")
    return (
      <ReferenceNotice>
        <ScopePage />
      </ReferenceNotice>
    );
  if (section === "operations")
    return (
      <ReferenceNotice>
        <OperationsPage />
      </ReferenceNotice>
    );
  if (section === "team")
    return (
      <ReferenceNotice>
        <TeamPage />
      </ReferenceNotice>
    );
  if (section === "timeline") return <LiveTimeline />;
  return <LiveOverview />;
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
            planned for a later phase; no payment or recovery action is
            executed.
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
  const allMembers = [
    ...new Map(
      [...members.filter((m) => m.organizationId === access.organizationId)]
        .sort(
          (a, b) =>
            Number(a.incidentId === access.incidentId) -
            Number(b.incidentId === access.incidentId),
        )
        .map((m) => [m.userId, m]),
    ).values(),
  ];
  const roster = members.filter(
    (m) => m.organizationId === access.organizationId && m.status === "active" && m.incidentId === access.incidentId,
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
        description={`${access.incidentId} · Responders and conversations`}
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
              <p className="text-sm font-semibold">
                {access.incidentId} · Response team
              </p>
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
                    {access.incidentId} · Response team
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
                          title="Tasks are planned for Phase 4"
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

function ReferenceNotice({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="mb-5 border-l border-border pl-3 text-xs text-muted-foreground">
        Reference preview: scenario content below illustrates IR-2041. Selected
        incident records are live in Overview and Timeline. Graph, chat, and
        approvals remain demonstrations; access administration is live.
      </p>
      {children}
    </>
  );
}
