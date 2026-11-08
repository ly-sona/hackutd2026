"use client";
import { TeamWorkspace } from "./team-workspace";
import { LiveOverview, LiveTimeline } from "./live-incident";
import { useState } from "react";
import { demoRequests } from "@/lib/demo-incident";
import { useAccess } from "./workspace-provider";
import { Button } from "./ui/button";
import { Avatar } from "./account-menu";
import { ScopeWorkspace } from "./scope-workspace";
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
  if (section === "scope") return <ScopeWorkspace />;
  if (section === "operations")
    return (
      <ReferenceNotice>
        <OperationsPage />
      </ReferenceNotice>
    );
  if (section === "team") return <TeamWorkspace />;
  if (section === "timeline") return <LiveTimeline />;
  return <LiveOverview />;
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
function ReferenceNotice({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="mb-5 border-l border-border pl-3 text-xs text-muted-foreground">
        Reference preview: scenario content below illustrates IR-2041. Selected
        incident records are live in Overview and Timeline. Approvals and
        recovery remain demonstrations; chat, paging, tasks and access
        administration are live.
      </p>
      {children}
    </>
  );
}
