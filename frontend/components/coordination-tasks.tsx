"use client";
import { useState } from "react";
import Link from "./workspace-link";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { useCoordination, useCoordinationCommand } from "./coordination-data";
import { Editor, Field, Select, fieldClass } from "./incident-forms";
import { EvidenceButton, AttachEvidence } from "./evidence-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { incidentBase, roleLabels } from "@/lib/roles";
import { incidentTime, localDateValue } from "@/lib/incident-model";
import {
  canTransition,
  priorities,
  taskStatuses,
  attentionCount,
  type Reference,
  type Message,
} from "@/lib/coordination";
const value = (f: FormData, k: string) => String(f.get(k) ?? "");
export function ReferenceSelector({ initial = [] }: { initial?: Reference[] }) {
  const d = useCoordination();
  const selected = new Set(initial.map((r) => `${r.kind}|${r.id}`));
  return (
    <Field label="References (hold ⌘ or Ctrl to select several)">
      <select
        multiple
        name="references"
        className={`${fieldClass} min-h-28`}
        defaultValue={[...selected]}
      >
        {d.options.map((o) => (
          <option key={`${o.kind}|${o.id}`} value={`${o.kind}|${o.id}`}>
            {o.label}
          </option>
        ))}
        {initial
          .filter(
            (r) => !d.options.some((o) => o.kind === r.kind && o.id === r.id),
          )
          .map((r) => (
            <option key={`${r.kind}|${r.id}`} value={`${r.kind}|${r.id}`}>
              {r.kind} · {r.id}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function formReferences(f: FormData): Reference[] {
  return f.getAll("references").map((v) => {
    const [kind, ...id] = String(v).split("|");
    return { kind: kind as Reference["kind"], id: id.join("|") };
  });
}
export function ReferenceLinks({ references }: { references: Reference[] }) {
  const a = useAccess(),
    d = useCoordination(),
    incident = useIncident(),
    base = incidentBase(a.organizationId, a.incidentId);
  return (
    <div className="flex flex-wrap gap-2">
      {references.map((r) => {
        const option = d.options.find(
            (o) => o.kind === r.kind && o.id === r.id,
          ),
          label = option?.label ?? `${r.kind} · ${r.id}`;
        if (r.kind === "evidence") {
          const e = incident.evidence.find((e) => e.id === r.id);
          return e ? <EvidenceButton key={r.id} evidence={e} /> : null;
        }
        if (r.kind === "task") return <TaskButton key={r.id} id={r.id} />;
        if (r.kind === "scope" && !a.can("scope:view"))
          return <BusinessOperationReference key={r.id} id={r.id} />;
        return (
          <Link
            key={`${r.kind}:${r.id}`}
            className="max-w-full break-words rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            href={
              r.kind === "finding"
                ? `${base}/overview?finding=${encodeURIComponent(r.id)}`
                : `${base}/${a.can("scope:view") ? "scope" : "operations"}?entity=${encodeURIComponent(option?.entityId ?? r.id)}${r.kind === "assessment" ? `&assessment=${encodeURIComponent(r.id)}` : ""}`
            }
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
export function TaskForm({
  source,
  references = [],
  title = "",
  description = "",
  trigger = "Create task",
  primary = false,
}: {
  source?: Message;
  references?: Reference[];
  title?: string;
  description?: string;
  trigger?: string;
  primary?: boolean;
}) {
  const a = useAccess(),
    d = useCoordination(),
    command = useCoordinationCommand();
  const initial = source
    ? (JSON.parse(source.references) as Reference[])
    : references;
  if (!a.can("tasks:create")) return null;
  return (
    <Editor
      title="Create task"
      primary={primary}
      description={
        source
          ? "Convert this message into tracked work. The source conversation's access restrictions are preserved."
          : "Assign work and record evidence-backed progress. Completing a task never resolves a finding automatically."
      }
      trigger={trigger}
      onSubmit={async (f) =>
        command("task.create", {
          sourceMessageId: source?.id,
          title: value(f, "title"),
          description: value(f, "description"),
          kind: value(f, "kind"),
          priority: value(f, "priority"),
          assignedUserId: value(f, "assignedUserId"),
          backupUserId: value(f, "backupUserId"),
          dueAt: value(f, "dueAt") ? new Date(value(f, "dueAt")).getTime() : 0,
          references: formReferences(f),
          page: f.get("page") === "on",
          confirmAvailability: f.get("confirmAvailability") === "on",
        })
      }
    >
      <Field label="Task title">
        <Input
          name="title"
          required
          maxLength={200}
          defaultValue={title || source?.content.slice(0, 160)}
        />
      </Field>
      <Field label="Task description">
        <textarea
          className={fieldClass}
          name="description"
          required
          maxLength={6000}
          defaultValue={description || source?.content}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          name="kind"
          label="Work type"
          values={["Investigation", "Coordination"]}
          value={a.can("evidence:view") ? "Investigation" : "Coordination"}
        />
        <Select
          name="priority"
          label="Priority"
          values={priorities}
          value="Medium"
        />
      </div>
      <ResponderSelect
        name="assignedUserId"
        label="Assignee"
        value={a.userId}
        selfOnly={!a.can("tasks:assign")}
      />
      <ResponderSelect
        name="backupUserId"
        label="Backup responder (optional; otherwise Incident Manager)"
        optional
      />
      <Field label="Due date and time (optional, local time)">
        <Input name="dueAt" type="datetime-local" />
      </Field>
      <ReferenceSelector initial={initial} />
      {a.can("pages:create") && (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="page" />
            Page assignee now (High or Critical tasks only; otherwise no page is
            sent)
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmAvailability" />I have reviewed
            availability and will page even if Busy or Unavailable.
          </label>
          <p className="text-xs text-muted-foreground">
            {d.policy?.acknowledgmentSeconds ?? 300}s server deadline, then one
            eligible backup or Incident Manager. Acknowledgment confirms receipt
            only.
          </p>
        </>
      )}
    </Editor>
  );
}
function ResponderSelect({
  name,
  label,
  value: initial,
  optional = false,
  selfOnly = false,
}: {
  name: string;
  label: string;
  value?: string;
  optional?: boolean;
  selfOnly?: boolean;
}) {
  const d = useCoordination(),
    a = useAccess();
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        name={name}
        defaultValue={initial ?? ""}
        required={!optional}
      >
        {optional && (
          <option value="">Use Incident Manager when paging</option>
        )}
        {d.responders
          .filter((r) => !selfOnly || r.id === a.userId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {roleLabels[r.role]} · {r.availability}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function TaskButton({ id, plain = false }: { id: string; plain?: boolean }) {
  const [open, setOpen] = useState(false),
    d = useCoordination(),
    task = d.tasks.find((t) => t.id === id);
  if (!task) return null;
  return (
    <>
      <button
        className={`max-w-full whitespace-normal [overflow-wrap:anywhere] ${plain ? "text-left text-base font-semibold hover:underline underline-offset-4" : "rounded-md border border-border px-2 py-1 text-xs text-left hover:bg-muted"}`}
        onClick={() => setOpen(true)}
      >
        {task.title}
      </button>
      <TaskDialog id={id} open={open} onOpenChange={setOpen} />
    </>
  );
}
export function TaskDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const d = useCoordination(),
    a = useAccess(),
    command = useCoordinationCommand(),
    [error, setError] = useState("");
  const task = d.tasks.find((t) => t.id === id),
    pages = d.pages
      .filter((p) => p.taskId === id)
      .sort((x, y) => Number(x.createdAt) - Number(y.createdAt));
  if (!task) return null;
  const references = JSON.parse(task.references) as Reference[],
    base = incidentBase(a.organizationId, a.incidentId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            Independent task tracking · {task.id}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{task.priority}</Badge>
          <Badge variant="outline">{task.status}</Badge>
          <Badge variant="outline">{task.kind}</Badge>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">
          {task.description}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt>Assignee</dt>
          <dd>{d.name(task.assignedUserId)}</dd>
          <dt>Backup</dt>
          <dd>
            {task.backupUserId
              ? d.name(task.backupUserId)
              : "Incident Manager"}
          </dd>
          <dt>Due</dt>
          <dd>
            {task.dueAt !== "0" ? incidentTime(task.dueAt) : "No deadline"}
          </dd>
          {task.verifiedBy && (
            <>
              <dt>Verified</dt>
              <dd>
                {d.name(task.verifiedBy)} · {incidentTime(task.verifiedAt)}
              </dd>
            </>
          )}
        </dl>
        {task.sourceMessageId !== "0" && (
          <Link
            className="text-sm underline"
            href={`${base}/team?conversation=${encodeURIComponent(task.sourceConversationId)}&message=${task.sourceMessageId}`}
          >
            Open original message · Restricted to its conversation
          </Link>
        )}
        <ReferenceLinks
          references={references.filter(
            (r) => r.kind !== "task" || r.id !== id,
          )}
        />
        <p className="text-xs text-muted-foreground">
          Page acknowledgment confirms receipt. Task completion requires review;
          linked findings and scope assessments keep their own verification
          state.
        </p>
        <div className="flex flex-wrap gap-3">
        {a.can("tasks:update") && (
          <Editor
            title="Update task"
            description="Add a work note and evidence. Investigation completion requires an authorized reviewer other than the assignee."
            trigger="Update task"
            onSubmit={async (f) =>
              command("task.update", {
                taskId: id,
                status: value(f, "status"),
                comment: value(f, "comment"),
                references: formReferences(f),
                ...(a.can("tasks:assign")
                  ? {
                      assignedUserId: value(f, "assignedUserId"),
                      backupUserId: value(f, "backupUserId"),
                      dueAt: value(f, "dueAt")
                        ? new Date(value(f, "dueAt")).getTime()
                        : 0,
                    }
                  : {}),
              })
            }
          >
            <Select
              name="status"
              label="Task status"
              values={taskStatuses.filter((s) => canTransition(task.status, s))}
              value={task.status}
            />
            <Field label="Work or verification note">
              <textarea
                name="comment"
                className={fieldClass}
                maxLength={4000}
                required
              />
            </Field>
            {a.can("tasks:assign") && (
              <>
                <ResponderSelect
                  name="assignedUserId"
                  label="Assignee"
                  value={task.assignedUserId}
                />
                <ResponderSelect
                  name="backupUserId"
                  label="Backup responder"
                  value={task.backupUserId}
                  optional
                />
                <Field label="Due date and time">
                  <Input
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={
                      task.dueAt !== "0"
                        ? localDateValue(Number(task.dueAt))
                        : ""
                    }
                  />
                </Field>
              </>
            )}
            <ReferenceSelector initial={references} />
          </Editor>
        )}
        {a.can("evidence:upload") && <AttachEvidence />}
        {a.can("pages:create") &&
          !["Completed", "Canceled"].includes(task.status) && (
            <Editor
              title="Page responder"
              description={`Urgent page for ${d.name(task.assignedUserId)}. Availability: ${d.responders.find((r) => r.id === task.assignedUserId)?.availability ?? "Not declared"}. Backup: ${task.backupUserId ? d.name(task.backupUserId) : "eligible Incident Manager"}. Server deadline: ${d.policy?.acknowledgmentSeconds ?? 300}s.`}
              trigger="Page responder"
              onSubmit={async (f) =>
                command("page.create", {
                  taskId: id,
                  confirmAvailability: f.get("confirmAvailability") === "on",
                })
              }
            >
              <label className="flex gap-2 text-sm">
                <input type="checkbox" name="confirmAvailability" />
                Page even if Busy or Unavailable (membership and reference
                permissions still apply).
              </label>
              <p className="text-xs text-muted-foreground">
                High or Critical tasks only. No page is sent merely by setting
                priority. One escalation; no phone or SMS delivery.
              </p>
            </Editor>
          )}
        </div>
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="font-medium">Paging history</h3>
          {!pages.length && (
            <p className="text-sm text-muted-foreground">
              No pages for this task.
            </p>
          )}
          {pages.map((p) => (
            <div
              key={p.id}
              data-testid="page-history"
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {d.name(p.pagedUserId)} ·{" "}
                  {p.parentPageId ? "Backup" : "Original"}
                </span>
                <strong>{p.status}</strong>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.acknowledgmentDeadline !== "0"
                  ? `Server deadline ${incidentTime(p.acknowledgmentDeadline)}`
                  : "Backup requires explicit acknowledgment; no further escalation"}
              </p>
              <p className="mt-1 text-xs">{p.reason}</p>
              {p.acknowledgedBy && (
                <p className="text-xs">
                  Receipt: {d.name(p.acknowledgedBy)} ·{" "}
                  {incidentTime(p.acknowledgedAt)}
                </p>
              )}
              {p.status === "Awaiting Acknowledgment" &&
                p.pagedUserId === a.userId && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      try {
                        await command("page.acknowledge", { pageId: p.id });
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Acknowledge receipt
                  </Button>
                )}
              {p.status === "Awaiting Acknowledgment" &&
                a.can("pages:create") && (
                  <Editor
                    title="Cancel page"
                    description="Preserves page history and leaves the task unchanged."
                    trigger="Cancel page"
                    onSubmit={async (f) =>
                      command("page.cancel", {
                        pageId: p.id,
                        reason: value(f, "reason"),
                      })
                    }
                  >
                    <Field label="Cancellation reason">
                      <Input name="reason" required maxLength={2000} />
                    </Field>
                  </Editor>
                )}
            </div>
          ))}
        </section>
        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="font-medium">Work and verification history</h3>
          {d.updates
            .filter((u) => u.taskId === id)
            .sort((x, y) => Number(x.createdAt) - Number(y.createdAt))
            .map((u) => (
              <div key={u.id} className="text-sm">
                <p>
                  {d.name(u.actorId)} · {u.previousStatus} → {u.newStatus}
                </p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">
                  {u.comment}
                </p>
                <p className="text-xs text-muted-foreground">
                  {incidentTime(u.createdAt)}
                </p>
              </div>
            ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
export function TaskList({ assignedOnly = false, embedded = false }: { assignedOnly?: boolean; embedded?: boolean }) {
  const a = useAccess(),
    d = useCoordination(),
    incident = useIncident();
  if (!a.can("tasks:view")) return null;
  const tasks = d.tasks.filter(
      (t) => !assignedOnly || t.assignedUserId === a.userId,
    ),
    active = tasks.filter((t) => !["Completed", "Canceled"].includes(t.status));
  const now = Number(d.policy?.now ?? 0),
    overdue = active.filter((t) => t.dueAt !== "0" && Number(t.dueAt) < now);
  return (
    <section className={embedded ? "" : "mt-6 border-t border-border pt-5"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded && <h2 className="text-xl font-semibold">
            {assignedOnly ? "Your tasks" : "Incident tasks"}
          </h2>}
          <p className="mt-1 text-xs text-muted-foreground">
            {active.length} active · {overdue.length} overdue
            {assignedOnly
              ? ` · ${attentionCount(
                  active,
                  incident.findings.filter((f) => f.priority === "Critical"),
                )} work items including unlinked critical findings`
              : ""}
          </p>
        </div>
        <TaskForm />
      </div>
      <div className="grid gap-2">
        {!tasks.length && (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        )}
        {tasks.map((t) => (
          <div
            key={t.id}
            data-testid="task-row"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
          >
            <div className="min-w-0">
              <TaskButton id={t.id} plain />
              <p className="mt-1 text-xs text-muted-foreground">
                {d.name(t.assignedUserId)} · <span className={t.priority === "Critical" ? "text-red-400" : t.priority === "High" ? "text-amber-400" : ""}>{t.priority}</span> · <span className={t.status === "Completed" ? "text-emerald-400" : ""}>{t.status}</span>
              </p>
            </div>
            <span
              className={`text-xs ${overdue.some((o) => o.id === t.id) ? "text-red-400" : "text-muted-foreground"}`}
            >
              {t.dueAt !== "0"
                ? `${overdue.some((o) => o.id === t.id) ? "Overdue · " : "Due · "}${incidentTime(t.dueAt)}`
                : "No deadline"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CoordinationAttention() {
  const a = useAccess(),
    d = useCoordination(),
    incident = useIncident();
  if (!a.can("tasks:view")) return null;
  const tasks = d.tasks.filter(
    (t) =>
      t.assignedUserId === a.userId &&
      !["Completed", "Canceled"].includes(t.status),
  );
  const pages = d.pages.filter(
    (p) => p.pagedUserId === a.userId && p.status === "Awaiting Acknowledgment",
  );
  const count = attentionCount(
    tasks,
    incident.findings.filter((f) => f.priority === "Critical"),
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p
          className="text-xs text-muted-foreground"
          data-testid="coordination-attention-count"
        >
          {count} work items · assigned tasks + unresolved critical findings,
          linked items counted once · {pages.length} urgent pages
        </p>
        <TaskForm />
      </div>
      {pages.map((p) => (
        <Link
          key={p.id}
          href={`${incidentBase(a.organizationId, a.incidentId)}/team?task=${encodeURIComponent(p.taskId)}&page=${encodeURIComponent(p.id)}`}
          className="block border-l-2 border-red-400 px-4 py-3 text-sm text-red-300"
        >
          Urgent receipt requested ·{" "}
          {d.tasks.find((t) => t.id === p.taskId)?.title ?? "Open paged task"}
        </Link>
      ))}
      {tasks.map((t) => (
        <div
          key={t.id}
          className="flex flex-wrap justify-between gap-3 p-4"
          data-testid="attention-task"
        >
          <div>
            <TaskButton id={t.id} />
            <p className="mt-2 text-xs text-muted-foreground">
              {t.priority} · {t.status} · {d.name(t.assignedUserId)}
            </p>
          </div>
          {t.dueAt !== "0" && (
            <span
              className={`text-xs ${Number(t.dueAt) < Number(d.policy?.now ?? 0) ? "text-red-400" : "text-muted-foreground"}`}
            >
              {Number(t.dueAt) < Number(d.policy?.now ?? 0) ? "Overdue" : "Due"}{" "}
              · {incidentTime(t.dueAt)}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function BusinessOperationReference({ id }: { id: string }) {
  const d = useCoordination(),
    [open, setOpen] = useState(false),
    operation = d.operations.find((o) => o.id === id);
  if (!operation) return null;
  return (
    <>
      <button
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        onClick={() => setOpen(true)}
      >
        Business operation · {operation.name}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{operation.name}</DialogTitle>
            <DialogDescription>
              Business Operation · Original scope inventory reference{" "}
              {operation.reference}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{operation.description}</p>
          <p className="text-xs text-muted-foreground">
            Owner: {operation.owner || "Unassigned"} · {operation.id}
          </p>
          <TaskForm
            title={`Coordinate ${operation.name}`}
            description={operation.description}
            references={[{ kind: "scope", id: operation.id }]}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
