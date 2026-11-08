"use client";
import {
  TaskForm,
  CoordinationAttention,
  TaskButton,
} from "./coordination-tasks";
import { useCoordination } from "./coordination-data";
import { ScopeSummaryStrip } from "./scope-summary";
import Link from "./workspace-link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Play,
  ChevronRight,
  MoreHorizontal,
  Check,
} from "lucide-react";
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
import { Avatar } from "./account-menu";
import { PageHeading, Disclosure } from "./workspace-ui";
import { AffectedOperations } from "./recovery-workspace";
import { IncidentReports, ReportHistory } from "./incident-reports";
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
  const owner = d.members.find(
    (member) => member.userId === f.assignedTo,
  )?.name;
  return (
    <button
      data-testid={`finding-${f.id}`}
      onClick={open}
      className="flex w-full items-center gap-5 px-5 py-3 text-left hover:bg-muted/25"
    >
      <span
        className={`size-3.5 shrink-0 rounded-full ${!unresolved(f) || ["Medium", "Low"].includes(f.priority) ? "bg-emerald-400" : f.priority === "Critical" ? "bg-red-400" : "bg-amber-400"}`}
        aria-label={!unresolved(f) ? "Addressed" : `${f.priority} priority`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold leading-6 sm:text-xl">
          {f.title}
          {isUnread(f, d.reads) && (
            <span
              className="ml-2 text-sm font-normal text-muted-foreground"
              data-testid="unread-finding"
            >
              New
            </span>
          )}
        </p>
        <p className="mt-1 line-clamp-1 text-base leading-6 text-muted-foreground">
          {unresolved(f) ? "Unresolved" : "Addressed"} · {f.status} ·{" "}
          {f.description}
        </p>
      </div>
      {owner && (
        <span className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
          <Avatar name={owner} small />
          <span className="text-sm text-muted-foreground">
            Assigned to{" "}
            {owner
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
        </span>
      )}
      <ArrowRight size={18} className="shrink-0" />
    </button>
  );
}
export function LiveOverview() {
  const a = useAccess(),
    d = useIncident(),
    coordination = useCoordination(),
    params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const i = d.incident,
    shown = selected ?? params.get("finding");
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
    (left, right) =>
      Number(unresolved(right)) - Number(unresolved(left)) ||
      Number(right.updatedAt) - Number(left.updatedAt),
  );
  // Show one urgent, one watch and one routine item before the complete work list.
  const attention: Finding[] = [];
  for (const priorities of [["Critical"], ["High"], ["Medium", "Low"]]) {
    const item = sorted.find(
      (finding) => unresolved(finding) && priorities.includes(finding.priority),
    );
    if (item) attention.push(item);
  }
  for (const item of sorted) {
    if (attention.length === 3) break;
    if (!attention.includes(item)) attention.push(item);
  }
  const remaining = sorted.filter((finding) => !attention.includes(finding));
  const openTasks = coordination.tasks.filter(
    (task) => !["Completed", "Canceled"].includes(task.status),
  );
  const openFinding = (id: string) => {
    setDismissed(null);
    setSelected(id);
  };
  return (
    <>
      <PageHeading
        className="mb-6"
        title={i.title}
        eyebrow={`INCIDENT ${i.incidentId}`}
        description={
          <>
            {i.systems || i.type} · Opened {incidentTime(i.createdAt)}
          </>
        }
        actions={
          <>
            <Badge
              variant="outline"
              className={`px-3 py-1 text-lg font-normal ${tone(i.severity)} ${i.severity === "Critical" ? "border-red-400" : "border-amber-400"}`}
            >
              {i.severity}
            </Badge>
            {a.can("findings:create") && <FindingForm />}
            <IncidentReports />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Incident details and actions"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <MoreHorizontal size={22} />
            </Button>
          </>
        }
      />
      {toolsOpen && (
        <section
          aria-label="Incident details and actions"
          className="mb-8 space-y-6 rounded-lg border border-border p-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{i.status}</Badge>
            {a.can("incident:manage") && <UpdateIncident />}
            {a.can("notes:create") && <AddNote />}
            {a.can("evidence:upload") && <AttachEvidence />}
            {a.can("incident:create") && (
              <NewIncident
                organizationId={a.organizationId}
                responders={d.members}
              />
            )}
            {a.can("tasks:create") && <TaskForm />}
          </div>
          <p className="max-w-4xl text-base leading-7 text-muted-foreground">
            {i.description}
          </p>
          <dl className="grid gap-5 text-base sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Commander</dt>
              <dd className="mt-1">
                {d.members.find((m) => m.userId === i.commanderId)?.name ??
                  (i.commanderId || "Unassigned")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Discovered</dt>
              <dd className="mt-1">{incidentTime(i.discoveredAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reporter</dt>
              <dd className="mt-1">
                {d.members.find((m) => m.userId === i.createdBy)?.name ??
                  i.createdBy}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="mt-1">{i.type}</dd>
            </div>
          </dl>
          <p className="text-base text-muted-foreground">
            {pending.length} unresolved findings ·{" "}
            {d.findings.filter((f) => isUnread(f, d.reads)).length} new findings
            · <span data-testid="new-updates">{newEvents.length}</span> new
            updates
          </p>
          <p className="text-base text-muted-foreground">
            {d.visitError ??
              (d.cutoff === undefined
                ? "Loading your visit window…"
                : d.cutoff === "0"
                  ? "First visit — review the current incident summary."
                  : `Since your last visit: ${newEvents.length} updates since ${incidentTime(d.cutoff)}. This window stays fixed while you navigate this visit.`)}
          </p>
          <ScopeSummaryStrip summary={d.scopeSummary} />
          <Disclosure title="Business impact">
            <p className="text-base leading-7">
              {i.impact ||
                "Impact under investigation; no verified scope recorded."}
            </p>
          </Disclosure>
          <Disclosure
            title={`Incident evidence · ${d.evidence.length} originals`}
          >
            <div className="flex flex-wrap gap-3">
              {d.evidence.map((e) => (
                <EvidenceButton key={e.id} evidence={e} />
              ))}
            </div>
            {!a.can("evidence:view") && (
              <p className="text-sm text-muted-foreground">
                Evidence review requires additional permissions.
              </p>
            )}
          </Disclosure>
        </section>
      )}
      <div className="mb-10 grid grid-cols-2 gap-y-6 lg:grid-cols-4">
        {[
          {
            label: d.scopeSummary
              ? "Systems to investigate"
              : "Unresolved findings",
            value: d.scopeSummary?.systemsUnderInvestigation ?? pending.length,
          },
          {
            label: d.scopeSummary ? "Groups to investigate" : "New findings",
            value:
              d.scopeSummary?.groupsUnderInvestigation ??
              d.findings.filter((f) => isUnread(f, d.reads)).length,
          },
          { label: "Open tasks", value: openTasks.length },
          { label: "Responders", value: coordination.responders.length },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={`${index ? "border-l border-border pl-6" : ""}`}
          >
            <p className="text-4xl font-semibold">{metric.value}</p>
            <p className="mt-1 text-base leading-6 sm:text-lg">
              {metric.label}
            </p>
          </div>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-12 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="relative min-w-0">
          <h2 className="mb-4 text-2xl font-semibold">Needs your attention</h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {attention.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                open={() => openFinding(f.id)}
              />
            ))}
            {!sorted.length && (
              <p className="p-5 text-muted-foreground">
                No findings recorded. Add the first observation.
              </p>
            )}
          </div>
          <Disclosure
            title={`View all work (${d.findings.length + openTasks.length})`}
            className="attention-overflow !border-0 !p-0"
          >
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              <CoordinationAttention />
              {remaining.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  open={() => openFinding(f.id)}
                />
              ))}
            </div>
          </Disclosure>
          <section className="mt-7">
            <h2 className="mb-4 text-2xl font-semibold">Affected operations</h2>
            <AffectedOperations embedded />
          </section>
        </div>
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Recent activity</h2>
          <div className="ml-2 border-l border-border">
            {d.events.slice(0, 3).map((e) => (
              <Link
                key={e.id}
                href={`${incidentBase(a.organizationId, a.incidentId)}/timeline?event=${e.id}`}
                className="relative flex gap-6 pb-8 pl-8"
              >
                <span className="absolute top-2 -left-1.5 size-3 rounded-full bg-white" />
                <time className="shrink-0 text-base tabular-nums">
                  {incidentTime(e.createdAt, false)
                    .replace(" CST", "")
                    .replace(" CDT", "")}
                </time>
                <div className="min-w-0">
                  <p
                    className="line-clamp-1 text-xl font-semibold"
                    title={e.title}
                  >
                    {e.title}
                  </p>
                  <p className="mt-2 line-clamp-2 text-base leading-6 text-muted-foreground">
                    {e.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <Link
            className="ml-10 text-sm text-muted-foreground underline underline-offset-4"
            href={`${incidentBase(a.organizationId, a.incidentId)}/timeline`}
          >
            View full timeline →
          </Link>
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
    coordination = useCoordination(),
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
  const findingFor = (e: (typeof d.events)[number]) =>
    d.findings.find((item) => item.id === e.findingId);
  const urgent = (e: (typeof d.events)[number]) => {
    const f = findingFor(e);
    return (
      (e.type === "page" && !["Acknowledged", "Canceled"].includes(e.status)) ||
      (e.type === "finding" &&
        !!f &&
        f.priority === "Critical" &&
        unresolved(f))
    );
  };
  const recorded = (e: (typeof d.events)[number]) =>
    ["Resolved", "Completed", "Acknowledged", "Ruled Out"].includes(e.status) ||
    e.type === "decision";
  const current =
    events.find((e) => e.id === (selected ?? params.get("event"))) || events[0];
  const currentId = current?.id;
  useEffect(() => {
    if (selected || !currentId) return;
    const row = document.getElementById(`timeline-event-${currentId}`);
    const feed = row?.closest<HTMLElement>('[data-testid="timeline-events"]');
    if (row && feed) feed.scrollTop = row.offsetTop;
  }, [currentId, selected]);
  const newEvent = (e: (typeof d.events)[number]) =>
    (!!d.cutoff &&
      d.cutoff !== "0" &&
      BigInt(e.createdAt) > BigInt(d.cutoff)) ||
    (!!findingFor(e) && isUnread(findingFor(e)!, d.reads));
  const linkedFinding = current ? findingFor(current) : undefined;
  const evidenceIds = current
    ? (JSON.parse(current.evidenceIds) as string[])
    : [];
  const evidence = d.evidence.filter(
    (e) =>
      evidenceIds.includes(e.id) ||
      d.links.some(
        (l) =>
          l.evidenceId === e.id &&
          l.findingId &&
          l.findingId === current?.findingId,
      ),
  );
  let scopeEntityId = "",
    taskId = "";
  try {
    const value = JSON.parse(current?.newValue || "{}");
    scopeEntityId =
      typeof value.scopeEntityId === "string" ? value.scopeEntityId : "";
    taskId = typeof value.taskId === "string" ? value.taskId : "";
  } catch {
    /* Historical values need not be JSON. */
  }
  const task = coordination.tasks.find((item) => item.id === taskId);
  const ownerId = linkedFinding?.assignedTo || task?.assignedUserId;
  const shortTime = (time: string) =>
    incidentTime(time, false).replace(" CST", "").replace(" CDT", "");
  return (
    <>
      <PageHeading
        className="mb-4"
        title="Timeline"
        description="What happened, what matters, and what comes next."
        actions={
          <Button
            variant="outline"
            disabled
            title="Timeline replay is not implemented"
          >
            <Play size={18} />
            Replay
          </Button>
        }
      />
      <div className="mb-4">
        <IncidentReports />
        <ReportHistory />
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-8 border-b border-border pb-3">
        <select
          aria-label="Filter timeline events"
          className={`${fieldClass} max-w-48`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All Events", ...Object.keys(filterTypes)].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-3 text-base sm:text-lg">
          <input
            type="checkbox"
            className="aegis-switch"
            checked={since}
            onChange={(e) => setSince(e.target.checked)}
          />
          Since my last visit
        </label>
        <span className="ml-auto text-sm">Incident history · Newest first</span>
      </div>
      <div className="grid min-h-[610px] items-start gap-7 lg:grid-cols-[1.5fr_1fr]">
        <section
          aria-label="Incident events"
          data-testid="timeline-events"
          className="timeline-track relative max-h-[610px] overflow-y-auto pr-2"
        >
          {events.map((e) => (
            <button
              type="button"
              key={e.id}
              id={`timeline-event-${e.id}`}
              data-event-type={e.type}
              aria-pressed={current?.id === e.id}
              onClick={() => setSelected(e.id)}
              className={`relative flex w-full items-start gap-4 border-b border-border border-l-4 px-4 py-4 text-left sm:gap-8 sm:px-8 ${current?.id === e.id ? (urgent(e) ? "rounded-md border-l-red-400 bg-[#281516]" : "rounded-md border-l-white bg-[#1b1b1b]") : "border-l-transparent hover:bg-muted/20"}`}
            >
              <time className="mt-0.5 w-16 shrink-0 whitespace-nowrap text-sm tabular-nums sm:w-24 sm:text-base">
                {shortTime(e.createdAt)}
              </time>
              <span
                className={`relative z-10 mt-2 size-3 shrink-0 rounded-full ${urgent(e) ? "bg-red-400" : recorded(e) ? "bg-emerald-400" : ["finding", "evidence", "scope"].includes(e.type) ? "bg-amber-400" : "bg-neutral-400"}`}
              />
              <span className="min-w-0 flex-1">
                <span
                  data-event-title={e.title}
                  className="block text-lg font-semibold leading-7 sm:text-xl"
                >
                  {urgent(e) && <span className="text-red-400">Urgent · </span>}
                  {e.type === "decision" && (
                    <span className="text-emerald-400">
                      <Check className="mr-2 inline" size={18} />
                      Decision recorded ·{" "}
                    </span>
                  )}
                  {e.title}
                  {newEvent(e) && (
                    <span className="ml-3 text-sm font-normal text-muted-foreground">
                      New
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-base text-muted-foreground sm:text-lg">
                  {d.members.find((m) => m.userId === e.actorId)?.name ??
                    e.actorId}{" "}
                  · {e.status || e.type}
                </span>
              </span>
              <ChevronRight size={20} className="mt-1 shrink-0" />
            </button>
          ))}
          {!events.length && (
            <p className="py-8 text-base text-muted-foreground">
              No events match this filter
              {since && d.cutoff === "0"
                ? " — first visit shows the current summary on Overview"
                : ""}
              .
            </p>
          )}
        </section>
        <aside
          data-testid="event-detail"
          aria-label="Selected event details"
          className="min-w-0 border-t border-border pt-5 lg:max-h-[680px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
        >
          {current && (
            <>
              <p
                className={`mb-3 flex items-center gap-2 text-base ${urgent(current) ? "text-red-400" : recorded(current) ? "text-emerald-400" : "text-amber-400"}`}
              >
                <span className="size-3 rounded-full bg-current" />
                {urgent(current)
                  ? "Urgent"
                  : recorded(current)
                    ? "Recorded"
                    : "Needs review"}
                <span className="text-muted-foreground">
                  · {current.status || "Documented"}
                </span>
              </p>
              <h2 className="text-[28px] font-semibold leading-tight">
                {current.title}
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                {linkedFinding?.relatedSystem || a.incidentId} ·{" "}
                {incidentTime(current.createdAt)}
              </p>
              <h3 className="mb-3 mt-10 text-lg font-semibold">
                {urgent(current) ? "Why it needs review" : "What happened"}
              </h3>
              <div className="space-y-2 text-base">
                <p className="flex gap-6">
                  <time className="font-mono">
                    {shortTime(current.observedAt)}
                  </time>
                  <span>Observed</span>
                </p>
                <p className="flex gap-6">
                  <time className="font-mono">
                    {shortTime(current.createdAt)}
                  </time>
                  <span>Recorded</span>
                </p>
              </div>
              <p className="mt-5 line-clamp-3 text-base leading-7 text-muted-foreground">
                {current.description}
              </p>
              <h3 className="mb-2 mt-8 text-lg font-semibold">Next step</h3>
              <p className="text-base leading-7">
                {task
                  ? "Open the task to review its work and verification."
                  : linkedFinding && unresolved(linkedFinding)
                    ? "Review the supporting evidence and investigation."
                    : "Review the recorded outcome and supporting details."}
              </p>
              {ownerId && (
                <p className="mt-3 text-base text-muted-foreground">
                  {coordination.name(ownerId)} · Assigned responder
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                {evidence[0] && (
                  <EvidenceButton
                    evidence={evidence[0]}
                    findingId={current.findingId}
                  />
                )}
                {current.findingId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFinding(current.findingId)}
                  >
                    Open related finding
                  </Button>
                )}
                {taskId && <TaskButton id={taskId} />}
              </div>
              <Disclosure title="Sources & audit details" className="mt-8">
                <p className="mb-5 whitespace-pre-wrap text-base leading-7">
                  {current.description}
                </p>
                {current.type === "scope" &&
                  a.can("scope:view") &&
                  scopeEntityId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-5"
                      asChild
                    >
                      <Link
                        href={`${incidentBase(a.organizationId, a.incidentId)}/scope?entity=${encodeURIComponent(scopeEntityId)}`}
                      >
                        Open scope entity
                      </Link>
                    </Button>
                  )}
                {current.correctsEventId && (
                  <button
                    className="mb-4 block text-sm underline"
                    onClick={() => {
                      setFilter("All Events");
                      setSince(false);
                      setSelected(current.correctsEventId);
                    }}
                  >
                    Correction of event #{current.correctsEventId}
                  </button>
                )}
                <div className="mb-5 flex flex-wrap gap-3">
                  {evidence.slice(1).map((e) => (
                    <EvidenceButton
                      key={e.id}
                      evidence={e}
                      findingId={current.findingId}
                    />
                  ))}
                </div>
                <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
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
                  {current.timingCorrectionId && (
                    <>
                      <dt>Time correction</dt>
                      <dd>
                        Synthetic fixture correction #{current.timingCorrectionId}.
                        Original observation: {incidentTime(current.originalObservedAt!)}.
                        {current.originalRecordedAt && ` Original recording: ${incidentTime(current.originalRecordedAt)}.`}
                        Corrected by {d.members.find((member) => member.userId === "maya")?.name ?? "maya"} on {incidentTime(current.timingCorrectedAt!)}.
                      </dd>
                    </>
                  )}
                  <dt>Previous</dt>
                  <dd className="max-h-36 overflow-auto whitespace-pre-wrap break-all">
                    {current.previousValue || "—"}
                  </dd>
                  <dt>New</dt>
                  <dd className="max-h-36 overflow-auto whitespace-pre-wrap break-all">
                    {current.newValue || "—"}
                  </dd>
                </dl>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  Historical synthetic observations remain assessments unless
                  explicitly verified. Documentation does not execute response
                  actions.
                </p>
                {a.can("notes:create") && (
                  <div className="mt-5">
                    <AddNote correctsEventId={current.id} />
                  </div>
                )}
              </Disclosure>
            </>
          )}
        </aside>
      </div>
      {finding && <FindingDetail id={finding} close={() => setFinding(null)} />}
    </>
  );
}
