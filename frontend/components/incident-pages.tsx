"use client";
import { TeamWorkspace } from "./team-workspace";
import { LiveOverview, LiveTimeline } from "./live-incident";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { demoRequests } from "@/lib/demo-incident";
import { useAccess } from "./workspace-provider";
import { Button } from "./ui/button";
import { Avatar } from "./account-menu";
import { ScopeWorkspace } from "./scope-workspace";
import { PageHeading } from "./workspace-ui";
import { AffectedOperations } from "./affected-operations";
import type { Section } from "./workspace-shell";

export function IncidentPage({ section }: { section: Section }) {
  if (section === "scope") return <ScopeWorkspace />;
  if (section === "operations") return <OperationsPage />;
  if (section === "team") return <TeamWorkspace />;
  if (section === "timeline") return <LiveTimeline />;
  return <LiveOverview />;
}
function OperationsPage() {
  const access = useAccess();
  const requests = demoRequests.filter((request) => request.incidentId === access.incidentId);
  const [selectedId, setSelectedId] = useState(requests[0]?.id);
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0];
  if (!selected) return (
    <>
      <PageHeading title="Operations" description={`${access.incidentId} · Approval preview`} />
      <p className="text-muted-foreground">No sample requests are linked to this incident.</p>
    </>
  );
  return (
    <>
      <PageHeading
        title="Operations"
        description={`${access.incidentId} · Approval preview · Keep essential work moving independently.`}
        actions={
          <Button
            variant="outline"
            disabled
            title="Requests are planned for a later phase"
          >
            New request
          </Button>
        }
      />
      <p className="-mt-3 mb-4 text-base sm:text-lg text-muted-foreground">
        {requests.filter((request) => request.status === "Approval pending").length} awaiting approval
        <span className="mx-2">·</span>{requests.filter((request) => request.status === "In review").length} in review
        <span className="mx-2">·</span>{requests.filter((request) => request.status === "Authorized").length} authorized
      </p>
      <details className="mb-5">
        <summary className="cursor-pointer text-sm text-muted-foreground">Business continuity reports</summary>
        <div className="mt-3"><AffectedOperations /></div>
      </details>
      <div className="grid border-t border-border pt-5 lg:grid-cols-[35%_1fr]">
        <aside className="border-b border-border pb-6 lg:border-r lg:border-b-0 lg:pr-5">
          <h2 className="mb-5 text-2xl font-semibold">Requests</h2>
          {requests.map((request) => (
            <button
              key={request.id}
              onClick={() => setSelectedId(request.id)}
              className={`flex w-full items-center justify-between gap-4 border-b border-border px-4 py-3 text-left ${selected.id === request.id ? "border-l-[3px] border-l-white bg-muted/35" : "border-l-[3px] border-l-transparent hover:bg-muted/15"}`}
            >
              <span>
                <span className="block text-lg font-semibold">
                  {request.title}
                </span>
                <span className="mt-1 block text-base text-muted-foreground">
                  {request.id}
                  {request.amount !== "—" && ` · ${request.amount}`}
                </span>
              </span>
              <span
                className={`flex shrink-0 items-center gap-2 text-base ${request.status.startsWith("Authorized") ? "text-emerald-400" : "text-amber-300"}`}
              >
                <span className="size-2 rounded-full bg-current" />
                {request.status}
              </span>
            </button>
          ))}
        </aside>
        <section className="min-w-0 pt-6 lg:pt-0 lg:pl-8">
          <p className="mb-3 text-base sm:text-lg text-muted-foreground">
            {selected.id} <span className="mx-2">/</span>
            {selected.type}
          </p>
          <div className="flex justify-between gap-4">
            <h2 className="text-[34px] font-semibold">{selected.title}</h2>
            <span className="text-[30px] font-semibold">{selected.amount}</span>
          </div>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground">
            {selected.description}
          </p>
          <dl className="my-5 grid max-w-xl grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-base sm:grid-cols-[200px_1fr] sm:text-lg">
            <dt>Requester</dt>
            <dd className="text-muted-foreground">{selected.requester}</dd>
            <dt>Normal route</dt>
            <dd className="text-muted-foreground">{selected.normalRoute}</dd>
          </dl>
          <div className="border-t border-border pt-5">
            <h3 className="mb-3 text-lg font-semibold">Independent approval</h3>
            {selected.participants.map((name, index) => (
              <div
                key={name}
                className="flex items-center gap-4 border-b border-border py-3"
              >
                <Avatar name={name} />
                <div>
                  <p className="font-semibold">
                    {name}
                    {name === access.userName && " · You"}
                  </p>
                  <p className="mt-1 text-base sm:text-lg text-muted-foreground">
                    {name === "Priya Shah"
                      ? "Legal"
                      : name === "Maya Chen"
                        ? "Commander"
                        : "Assigned reviewer"}
                  </p>
                </div>
                <span
                  className={`ml-auto text-base sm:text-lg ${selected.decisions[index] === "Approved" ? "text-emerald-400" : "text-amber-300"}`}
                >
                  {selected.decisions[index]}
                </span>
              </div>
            ))}
          </div>
          <details className="border-b border-border py-5">
            <summary className="flex cursor-pointer items-center gap-3 text-lg font-semibold">
              <ChevronRight size={18} />
              <span>
                Fallback rationale & evidence
                <span className="mt-1 block text-base font-normal text-muted-foreground">
                  {selected.rationale}
                </span>
              </span>
            </summary>
            <p className="mt-3 text-base sm:text-lg text-muted-foreground">
              {selected.rationale}
            </p>
          </details>
          <div className="mt-6 flex flex-wrap gap-4">
            <Button
              disabled
              className="min-w-56 sm:min-w-[340px]"
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
          <p className="mt-4 text-base leading-5 text-muted-foreground">
            Fictional approval states for the demo. Two distinct authorized approvers
            are required in the planned workflow; AEGIS has not approved a request or executed a payment.
            {access.role === "administrator" &&
              " Administrator access does not grant approval authority."}
          </p>
        </section>
      </div>
    </>
  );
}
