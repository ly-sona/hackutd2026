"use client";
import {
  TaskForm,
  CoordinationAttention,
  TaskButton,
} from "./coordination-tasks";
import { useCoordination } from "./coordination-data";
import { ScopeSummaryStrip } from "./scope-summary";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Play, ChevronRight } from "lucide-react";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import {
  FindingForm,
  UpdateIncident,
  AddNote,
  NewIncident,
  fieldClass,
} from "./incident-forms";
import { EvidenceButton, AttachEvidence } from "./evidence-panel";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { api } from "@/lib/api";
import { incidentBase } from "@/lib/roles";
import {
  unresolved,
  isUnread,
  incidentTime,
  type Finding,
} from "@/lib/incident-model";
const tone = (v: string) =>
  v === "Critical"
    ? "text-red-400"
    : v === "High" || v === "Suspected" || v === "Unverified"
      ? "text-amber-300"
      : v === "Resolved" || v === "Confirmed"
        ? "text-emerald-400"
        : "text-muted-foreground";
function FindingDetail({ id, close }: { id: string; close: () => void }) {
  const d = useIncident(),
    a = useAccess(),
    f = d.findings.find((f) => f.id === id),
    coordination = useCoordination();
  const [error, setError] = useState("");
  useEffect(() => {
    api("incident/read", {
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      findingId: id,
    }).catch((e: Error) => setError(e.message));
  }, [a.organizationId, a.incidentId, id]);
  if (!f) return null;
  const evidenceIds = d.links
    .filter((l) => l.findingId === id)
    .map((l) => l.evidenceId);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f.title}</DialogTitle>
          <DialogDescription>
            {f.category} · {f.priority} priority · {f.status}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm leading-6">{f.description}</p>
        <dl className="grid grid-cols-[130px_1fr] gap-2 text-xs">
          <dt>Observed</dt>
          <dd>{incidentTime(f.observedAt)}</dd>
          <dt>Reported by</dt>
          <dd>
            {d.members.find((m) => m.userId === f.reportedBy)?.name ??
              f.reportedBy}
          </dd>
          <dt>Assigned to</dt>
          <dd>
            {d.members.find((m) => m.userId === f.assignedTo)?.name ??
              (f.assignedTo || "Unassigned")}
          </dd>
          <dt>Related system</dt>
          <dd>{f.relatedSystem || "Unspecified"}</dd>
          <dt>Investigation</dt>
          <dd>
            {unresolved(f) ? "Unresolved" : "Addressed"} · {f.status}
          </dd>
          <dt>Verification</dt>
          <dd>
            {f.verifiedBy
              ? `${f.verifiedBy} · ${incidentTime(f.verifiedAt)}`
              : "Not verified"}
          </dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          Reading this finding updates only your read state. Investigation
          status remains {f.status}.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <TaskForm
            title={`Investigate: ${f.title}`}
            description={f.description}
            references={[
              { kind: "finding", id },
              ...evidenceIds
                .filter((e) => d.evidence.some((v) => v.id === e))
                .map((e) => ({ kind: "evidence" as const, id: e })),
            ]}
          />
          {a.can("findings:edit") && <FindingForm finding={f} />}{" "}
          {a.can("evidence:upload") && <AttachEvidence findingId={id} />}{" "}
          {a.can("notes:create") && <AddNote findingId={id} />}
        </div>
        {coordination.findingSources.find((s) => s.id === id) && (
          <Link
            className="text-xs underline"
            href={`${incidentBase(a.organizationId, a.incidentId)}/team?conversation=${encodeURIComponent(coordination.findingSources.find((s) => s.id === id)!.conversationId)}&message=${coordination.findingSources.find((s) => s.id === id)!.sourceMessageId}`}
          >
            Open original message
          </Link>
        )}
        <h3 className="text-sm font-medium">Supporting evidence</h3>
        <div className="flex flex-wrap gap-2">
          {d.evidence
            .filter((e) => evidenceIds.includes(e.id))
            .map((e) => (
              <EvidenceButton key={e.id} evidence={e} findingId={id} />
            ))}
          {!evidenceIds.length && (
            <p className="text-xs text-muted-foreground">
              No linked evidence yet.
            </p>
          )}
          {!a.can("evidence:view") && (
            <p className="text-xs text-muted-foreground">
              Your role does not permit viewing evidence files.
            </p>
          )}
        </div>
        {d.events
          .filter(
            (e) =>
              e.findingId === id &&
              [
                "note",
                "observation",
                "decision",
                "action",
                "correction",
              ].includes(e.type),
          )
          .map((e) => (
            <div key={e.id} className="border-t border-border pt-3 text-sm">
              <p>{e.title}</p>
              <p className="mt-1 text-muted-foreground">{e.description}</p>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
function FindingRow({
  finding: f,
  open,
}: {
  finding: Finding;
  open: () => void;
}) {
  const d = useIncident();
  return (
    <button
      data-testid={`finding-${f.id}`}
      onClick={open}
      className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-muted/30"
    >
      <span
        className={`size-2.5 shrink-0 rounded-full ${f.priority === "Critical" ? "bg-red-400" : "bg-amber-300"}`}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {f.title}{" "}
          {isUnread(f, d.reads) && (
            <span
              className="ml-2 text-xs font-normal text-white"
              data-testid="unread-finding"
            >
              New
            </span>
          )}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {f.description}
        </p>
        <p className="mt-2 text-xs">
          <span className={tone(f.priority)}>{f.priority}</span> · {f.status} ·{" "}
          {unresolved(f) ? "Unresolved" : "Addressed"}{" "}
          <span className="text-muted-foreground">
            ·{" "}
            {d.members.find((m) => m.userId === f.assignedTo)?.name ??
              "Unassigned"}
          </span>
        </p>
      </div>
      <ArrowRight size={16} className="ml-auto shrink-0" />
    </button>
  );
}
export function LiveOverview() {
  const a = useAccess(),
    d = useIncident(),
    params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const i = d.incident;
  const shown = selected ?? params.get("finding");
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!d.ready) return <p role="status">Loading incident…</p>;
  if (!i)
    return (
      <p role="alert">
        Incident documentation is not available. Run the Phase 2 seed.
      </p>
    );
  const newEvents =
    d.cutoff && d.cutoff !== "0"
      ? d.events.filter((e) => BigInt(e.createdAt) > BigInt(d.cutoff!))
      : [];
  const pending = d.findings.filter(unresolved);
  const sorted = [...d.findings].sort(
    (a, b) =>
      Number(unresolved(b)) - Number(unresolved(a)) ||
      Number(b.updatedAt) - Number(a.updatedAt),
  );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <p className="mb-1.5 font-mono text-sm tracking-wide">
            INCIDENT {i.incidentId}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">
            {i.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {i.systems || i.type} · Opened {incidentTime(i.createdAt)}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {i.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Badge variant="outline" className={tone(i.severity)}>
            {i.severity}
          </Badge>
          <Badge variant="outline">{i.status}</Badge>
          {a.can("findings:create") && <FindingForm />}
          {a.can("incident:create") && (
            <NewIncident
              organizationId={a.organizationId}
              responders={d.members}
            />
          )}
        </div>
      </div>
      <div className="mb-9 grid grid-cols-2 gap-y-6 lg:grid-cols-4">
        {[
          { label: "Unresolved findings", value: pending.length },
          {
            label: "New findings",
            value: d.findings.filter((f) => isUnread(f, d.reads)).length,
          },
          { label: "New updates", value: newEvents.length },
          { label: "Responders", value: d.members.length },
        ].map((m, index) => (
          <div
            key={m.label}
            className={`py-1 ${index ? "border-l border-border pl-6" : ""}`}
          >
            <p
              className="text-3xl font-semibold"
              data-testid={
                m.label === "New updates" ? "new-updates" : undefined
              }
            >
              {m.value}
            </p>
            <p className="mt-1 text-sm">{m.label}</p>
          </div>
        ))}
      </div>
      <ScopeSummaryStrip summary={d.scopeSummary} />
      <div className="mb-7 flex flex-wrap gap-3">
        {a.can("incident:manage") && <UpdateIncident />}
        {a.can("notes:create") && <AddNote />}
        {a.can("evidence:upload") && <AttachEvidence />}
      </div>
      <dl className="mb-8 flex flex-wrap gap-x-8 gap-y-3 text-xs text-muted-foreground">
        <div>
          <dt className="text-foreground">Commander</dt>
          <dd className="mt-1">
            {d.members.find((m) => m.userId === i.commanderId)?.name ??
              (i.commanderId || "Unassigned")}
          </dd>
        </div>
        <div>
          <dt className="text-foreground">Discovered</dt>
          <dd className="mt-1">{incidentTime(i.discoveredAt)}</dd>
        </div>
        <div>
          <dt className="text-foreground">Reporter</dt>
          <dd className="mt-1">
            {d.members.find((m) => m.userId === i.createdBy)?.name ??
              i.createdBy}
          </dd>
        </div>
        <div>
          <dt className="text-foreground">Type</dt>
          <dd className="mt-1">{i.type}</dd>
        </div>
      </dl>
      <section className="mb-8 border-y border-border py-4">
        <h2 className="text-sm font-semibold">Since your last visit</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {d.visitError ??
            (d.cutoff === undefined
              ? "Loading your visit window…"
              : d.cutoff === "0"
                ? "First visit — review the current incident summary."
                : `${newEvents.length} updates since ${incidentTime(d.cutoff)}. This window stays fixed while you navigate this visit.`)}
        </p>
        {newEvents.slice(0, 3).map((e) => (
          <Link
            key={e.id}
            className="mt-2 block text-xs"
            href={`${incidentBase(a.organizationId, a.incidentId)}/timeline?event=${e.id}`}
          >
            {e.title}
          </Link>
        ))}
      </section>
      <div className="grid items-start gap-10 xl:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="mb-4 text-xl font-semibold">Needs your attention</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            <CoordinationAttention />
            {sorted.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                open={() => {
                  setDismissed(null);
                  setSelected(f.id);
                }}
              />
            ))}
            {!sorted.length && (
              <p className="p-5 text-sm text-muted-foreground">
                No findings recorded. Add the first observation.
              </p>
            )}
          </div>
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-semibold">Business impact</h2>
            <p className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground">
              {i.impact ||
                "Impact under investigation; no verified scope recorded."}
            </p>
          </section>
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-semibold">Incident evidence</h2>
            <div className="flex flex-wrap gap-2">
              {d.evidence.map((e) => (
                <EvidenceButton key={e.id} evidence={e} />
              ))}
            </div>
            {!a.can("evidence:view") && (
              <p className="text-xs text-muted-foreground">
                Evidence review requires additional permissions.
              </p>
            )}
          </section>
        </div>
        <section>
          <h2 className="mb-6 text-xl font-semibold">Recent activity</h2>
          <div className="ml-1 border-l border-border">
            {d.events.slice(0, 6).map((e) => (
              <Link
                key={e.id}
                href={`${incidentBase(a.organizationId, a.incidentId)}/timeline?event=${e.id}`}
                className="relative mb-6 block pl-6"
              >
                <span className="absolute top-1.5 -left-1 size-2 rounded-full bg-white" />
                <p className="text-xs text-muted-foreground">
                  {incidentTime(e.createdAt, false)} · {e.type}
                </p>
                <p className="mt-2 text-sm font-semibold">{e.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {d.members.find((m) => m.userId === e.actorId)?.name ??
                    e.actorId}{" "}
                  · {e.description.slice(0, 160)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
      {shown && shown !== dismissed && (
        <FindingDetail
          key={shown}
          id={shown}
          close={() => {
            setSelected(null);
            setDismissed(shown);
          }}
        />
      )}
    </>
  );
}
export function LiveTimeline() {
  const a = useAccess(),
    d = useIncident(),
    params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("All Events"),
    [since, setSince] = useState(false),
    [finding, setFinding] = useState<string | null>(null);
  const filterTypes: Record<string, string[]> = {
    Findings: ["finding"],
    Evidence: ["evidence"],
    "Status Changes": ["status"],
    Decisions: ["decision"],
    "Access Changes": ["access"],
    "Scope Changes": ["scope"],
    Tasks: ["task"],
    Paging: ["page"],
  };
  const events = d.events.filter(
    (e) =>
      (filter === "All Events" || filterTypes[filter]?.includes(e.type)) &&
      (!since ||
        (!!d.cutoff &&
          d.cutoff !== "0" &&
          BigInt(e.createdAt) > BigInt(d.cutoff))),
  );
  const current =
    events.find((e) => e.id === (selected ?? params.get("event"))) || events[0];
  const evidenceIds = current
    ? (JSON.parse(current.evidenceIds) as string[])
    : [];
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Timeline
          </h1>
          <p className="mt-2 text-muted-foreground">
            What happened, what matters, and what comes next.
          </p>
        </div>
        <Button variant="outline" disabled>
          <Play size={15} />
          Replay
        </Button>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-6 border-b border-border pb-4">
        <select
          aria-label="Filter timeline events"
          className={`${fieldClass} max-w-44`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All Events", ...Object.keys(filterTypes)].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={since}
            onChange={(e) => setSince(e.target.checked)}
          />
          Since my last visit
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          America/Chicago · Newest first · Live
        </span>
      </div>
      <div className="grid min-h-[540px] gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section data-testid="timeline-events">
          {events.map((e) => (
            <button
              key={e.id}
              data-event-type={e.type}
              onClick={() => setSelected(e.id)}
              className={`flex w-full items-start gap-4 border-b border-border px-3 py-5 text-left ${current?.id === e.id ? "border-l-4 border-l-red-400 bg-red-400/10" : "hover:bg-muted/20"}`}
            >
              <time className="mt-1 w-20 shrink-0 font-mono text-xs">
                {incidentTime(e.createdAt, false)}
              </time>
              <span
                className={`mt-2 size-2 shrink-0 rounded-full ${e.status === "Resolved" ? "bg-emerald-400" : e.type === "finding" ? "bg-amber-300" : "bg-neutral-400"}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{e.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {d.members.find((m) => m.userId === e.actorId)?.name ??
                    e.actorId}{" "}
                  · {e.type} · {e.status}
                </p>
              </div>
              <ChevronRight size={16} className="ml-auto shrink-0" />
            </button>
          ))}
          {!events.length && (
            <p className="py-8 text-sm text-muted-foreground">
              No events match this filter
              {since && d.cutoff === "0"
                ? " — first visit shows the current summary on Overview"
                : ""}
              .
            </p>
          )}
        </section>
        <aside
          className="min-w-0 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
          data-testid="event-detail"
        >
          {current && (
            <>
              <p className={`mb-3 text-sm ${tone(current.status)}`}>
                {current.type} · {current.status || "Documented"}
              </p>
              <h2 className="text-2xl font-semibold">{current.title}</h2>
              <p className="mt-3 text-xs text-muted-foreground">
                {a.incidentId} · {incidentTime(current.createdAt)}
              </p>
              {current.type === "scope" &&
                a.can("scope:view") &&
                (() => {
                  try {
                    const target = JSON.parse(current.newValue)
                      .scopeEntityId as unknown;
                    return typeof target === "string" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        asChild
                      >
                        <Link
                          href={`${incidentBase(a.organizationId, a.incidentId)}/scope?entity=${encodeURIComponent(target)}`}
                        >
                          Open scope entity
                        </Link>
                      </Button>
                    ) : null;
                  } catch {
                    return null;
                  }
                })()}
              {["task", "page"].includes(current.type) &&
                (() => {
                  try {
                    const id = JSON.parse(current.newValue).taskId;
                    return typeof id === "string" ? (
                      <div className="mt-4">
                        <TaskButton id={id} />
                      </div>
                    ) : null;
                  } catch {
                    return null;
                  }
                })()}
              <h3 className="mt-8 mb-3 font-semibold">Investigation details</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {current.description}
              </p>
              {current.correctsEventId && (
                <button
                  className="mt-3 text-xs underline"
                  onClick={() => {
                    setFilter("All Events");
                    setSince(false);
                    setSelected(current.correctsEventId);
                  }}
                >
                  Correction of event #{current.correctsEventId}
                </button>
              )}
              {current.findingId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => setFinding(current.findingId)}
                >
                  Open related finding
                </Button>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {d.evidence
                  .filter(
                    (e) =>
                      evidenceIds.includes(e.id) ||
                      d.links.some(
                        (l) =>
                          l.evidenceId === e.id &&
                          l.findingId &&
                          l.findingId === current.findingId,
                      ),
                  )
                  .map((e) => (
                    <EvidenceButton
                      key={e.id}
                      evidence={e}
                      findingId={current.findingId}
                    />
                  ))}
              </div>
              <details className="mt-7 border-t border-border pt-5">
                <summary className="cursor-pointer text-sm font-semibold">
                  Sources & audit details
                </summary>
                <dl className="mt-4 grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-xs">
                  <dt>Event</dt>
                  <dd>#{current.id} · immutable</dd>
                  <dt>Actor</dt>
                  <dd>
                    {d.members.find((m) => m.userId === current.actorId)
                      ?.name ?? current.actorId}
                  </dd>
                  <dt>Observed</dt>
                  <dd>{incidentTime(current.observedAt)}</dd>
                  <dt>Recorded</dt>
                  <dd>{incidentTime(current.createdAt)}</dd>
                  <dt>Previous</dt>
                  <dd className="max-h-36 overflow-auto whitespace-pre-wrap break-all">
                    {current.previousValue || "—"}
                  </dd>
                  <dt>New</dt>
                  <dd className="max-h-36 overflow-auto whitespace-pre-wrap break-all">
                    {current.newValue || "—"}
                  </dd>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Historical synthetic observations remain assessments unless
                  explicitly verified. Documentation does not execute response
                  actions.
                </p>
              </details>
              <div className="mt-5 flex flex-wrap gap-2">
                {a.can("notes:create") && (
                  <AddNote correctsEventId={current.id} />
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {finding && <FindingDetail id={finding} close={() => setFinding(null)} />}
    </>
  );
}
