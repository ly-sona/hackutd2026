"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCoordinationCommand } from "./coordination-data";
import type { Message, Reference } from "@/lib/coordination";
import { api } from "@/lib/api";
import { incidentBase } from "@/lib/roles";
import {
  incidentStates,
  incidentTypes,
  severities,
  findingStates,
  localDateValue,
  type Finding,
} from "@/lib/incident-model";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-base";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-base">
      {label}
      {children}
    </label>
  );
}
export function Select({
  name,
  label,
  values,
  value,
}: {
  name: string;
  label: string;
  values: readonly string[];
  value?: string;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        name={name}
        defaultValue={value ?? values[0]}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </Field>
  );
}
export function Editor({
  title,
  description,
  trigger,
  children,
  onSubmit,
  primary = false,
}: {
  title: string;
  description: string;
  trigger: string;
  primary?: boolean;
  children: React.ReactNode;
  onSubmit: (data: FormData) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(new FormData(e.currentTarget));
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant={primary ? "default" : "outline"}
        size={primary ? "default" : "sm"}
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        {trigger}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-5" onSubmit={submit}>
            {children}
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
const val = (f: FormData, key: string) => String(f.get(key) ?? "");
export function NewIncident({
  organizationId,
  responders = [],
}: {
  organizationId: string;
  responders?: { userId: string; name: string; role: string }[];
}) {
  const router = useRouter();
  return (
    <Editor
      title="New incident"
      description="Record an initial report. Evidence and findings can be added progressively."
      trigger="New incident"
      onSubmit={async (f) => {
        const result = await api<{ incidentId: string }>("incident/create", {
          organizationId,
          title: val(f, "title"),
          description: val(f, "description"),
          type: val(f, "type"),
          severity: val(f, "severity"),
          discoveredAt: new Date(val(f, "discoveredAt")).getTime(),
          commanderId: val(f, "commanderId"),
          systems: val(f, "systems"),
          impact: val(f, "impact"),
          responderIds: f.getAll("responderIds"),
        });
        router.push(
          `${incidentBase(organizationId, result.incidentId)}/overview`,
        );
        router.refresh();
      }}
    >
      <Field label="Incident title">
        <Input name="title" required maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="type" label="Incident type" values={incidentTypes} />
        <Select
          name="severity"
          label="Severity"
          values={severities}
          value="High"
        />
      </div>
      <Field label="Description">
        <textarea
          className={fieldClass}
          name="description"
          required
          maxLength={6000}
        />
      </Field>
      <Field label="Discovery date and time (your local time)">
        <Input
          name="discoveredAt"
          type="datetime-local"
          required
          defaultValue={localDateValue()}
        />
      </Field>
      <Field label="Affected organization">
        <Input value={organizationId} readOnly />
      </Field>
      <Field label="Known affected systems (optional)">
        <Input name="systems" maxLength={1000} />
      </Field>
      <Field label="Known data impact (optional)">
        <Input name="impact" maxLength={2000} />
      </Field>
      <Field label="Incident Manager (optional)">
        <select className={fieldClass} name="commanderId">
          <option value="">Unassigned</option>
          {responders
            .filter((r) => ["commander", "administrator"].includes(r.role))
            .map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.name}
              </option>
            ))}
        </select>
      </Field>
      {responders.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">
            Additional responders (optional)
          </legend>
          {responders.map((r) => (
            <label className="mr-4 inline-flex gap-2 text-xs" key={r.userId}>
              <input type="checkbox" name="responderIds" value={r.userId} />
              {r.name}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-xs text-muted-foreground">
        You and the selected incident manager are assigned automatically. Initial
        evidence can be attached immediately after creation.
      </p>
    </Editor>
  );
}
export function FindingForm({
  finding,
  scopeEntityId,
  relatedSystem,
  sourceMessage,
}: {
  sourceMessage?: Message;
  finding?: Finding;
  scopeEntityId?: string;
  relatedSystem?: string;
}) {
  const a = useAccess(),
    d = useIncident(),
    coordinationCommand = useCoordinationCommand();
  const [observedDefault] = useState(() =>
    localDateValue(finding ? Number(finding.observedAt) : undefined),
  );
  const scope = { organizationId: a.organizationId, incidentId: a.incidentId };
  const linked = d.links
    .filter((l) => l.findingId === finding?.id)
    .map((l) => l.evidenceId);
  const sourceReferences = sourceMessage
    ? (JSON.parse(sourceMessage.references) as Reference[])
    : [];
  return (
    <Editor
      primary={!finding && !sourceMessage && !scopeEntityId}
      title={finding ? "Update finding" : "Add finding"}
      description="Separate observed facts from assessments. Confirmation and resolution require evidence and a verification justification."
      trigger={finding ? "Update finding" : "Add finding"}
      onSubmit={(f) => {
        const send = (path: string, data: object) =>
          sourceMessage
            ? coordinationCommand("finding.create", {
                ...data,
                sourceMessageId: sourceMessage.id,
                references: [
                  ...sourceReferences.filter((r) => r.kind !== "evidence"),
                  ...f
                    .getAll("evidenceIds")
                    .map((id) => ({ kind: "evidence", id: String(id) })),
                ],
              })
            : api(path, data);
        return send(
          scopeEntityId
            ? "scope"
            : `incident/findings${finding ? "/update" : ""}`,
          {
            ...scope,
            findingId: finding?.id,
            ...(scopeEntityId
              ? { action: "finding", entityId: scopeEntityId }
              : {}),
            title: val(f, "title"),
            description: val(f, "description"),
            category: val(f, "category"),
            priority: val(f, "priority"),
            status: val(f, "status"),
            observedAt: new Date(val(f, "observedAt")).getTime(),
            assignedTo: val(f, "assignedTo"),
            relatedSystem: val(f, "relatedSystem"),
            evidenceIds: f.getAll("evidenceIds"),
            reason: val(f, "reason"),
          },
        );
      }}
    >
      <Field label="Finding title">
        <Input
          required
          name="title"
          defaultValue={finding?.title ?? sourceMessage?.content.slice(0, 160)}
          maxLength={200}
        />
      </Field>
      <Field label="Description / what was observed">
        <textarea
          className={fieldClass}
          name="description"
          required
          defaultValue={finding?.description ?? sourceMessage?.content}
          maxLength={6000}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Finding category"
          name="category"
          values={[
            "Observation",
            "Investigation",
            "Data impact",
            "Account activity",
            "Response action",
            "Verification",
            "Business impact",
            "Other",
          ]}
          value={finding?.category}
        />
        <Select
          label="Priority"
          name="priority"
          values={severities}
          value={finding?.priority ?? "High"}
        />
        <Select
          label="Investigation status"
          name="status"
          values={findingStates}
          value={finding?.status ?? "Unverified"}
        />
        <Field label="Observed time (your local time)">
          <Input
            name="observedAt"
            required
            type="datetime-local"
            defaultValue={observedDefault}
          />
        </Field>
      </div>
      <Field label="Related system or dataset (optional)">
        <Input
          name="relatedSystem"
          defaultValue={finding?.relatedSystem ?? relatedSystem}
          maxLength={1000}
        />
      </Field>
      <Field label="Assigned responder (optional)">
        <select
          className={fieldClass}
          name="assignedTo"
          defaultValue={finding?.assignedTo ?? ""}
        >
          <option value="">Unassigned</option>
          {d.members.map((m) => (
            <option key={m.id} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      {a.can("evidence:view") && (
        <fieldset className="max-h-36 overflow-y-auto border border-border p-3">
          <legend className="px-1 text-sm">Supporting evidence</legend>
          {d.evidence.map((e) => (
            <label key={e.id} className="flex gap-2 py-1 text-xs">
              <input
                type="checkbox"
                name="evidenceIds"
                value={e.id}
                defaultChecked={
                  linked.includes(e.id) ||
                  sourceReferences.some(
                    (r) => r.kind === "evidence" && r.id === e.id,
                  )
                }
              />
              {e.id} · {e.filename}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Change / verification justification">
        <textarea name="reason" className={fieldClass} maxLength={2000} />
      </Field>
    </Editor>
  );
}
export function UpdateIncident() {
  const a = useAccess(),
    d = useIncident(),
    i = d.incident;
  if (!i) return null;
  return (
    <Editor
      title="Update incident"
      description="Changes append actor, prior value, new value, and justification to the timeline."
      trigger="Update incident"
      onSubmit={(f) =>
        api("incident/update", {
          organizationId: a.organizationId,
          incidentId: a.incidentId,
          description: val(f, "description"),
          status: val(f, "status"),
          severity: val(f, "severity"),
          commanderId: val(f, "commanderId"),
          reason: val(f, "reason"),
        })
      }
    >
      <Field label="Incident description">
        <textarea
          name="description"
          required
          className={fieldClass}
          defaultValue={i.description}
          maxLength={6000}
        />
      </Field>
      <Select
        label="Incident status"
        name="status"
        values={incidentStates}
        value={i.status}
      />
      <Select
        label="Severity"
        name="severity"
        values={severities}
        value={i.severity}
      />
      <Field label="Incident Manager">
        <select
          name="commanderId"
          defaultValue={i.commanderId}
          className={fieldClass}
        >
          <option value="">Unassigned</option>
          {d.members
            .filter((m) => ["commander", "administrator"].includes(m.role))
            .map((m) => (
              <option key={m.id} value={m.userId}>
                {m.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Justification">
        <textarea
          name="reason"
          required
          className={fieldClass}
          maxLength={2000}
        />
      </Field>
    </Editor>
  );
}
export function AddNote({
  findingId = "",
  correctsEventId = "",
}: {
  findingId?: string;
  correctsEventId?: string;
}) {
  const a = useAccess();
  return (
    <Editor
      title={correctsEventId ? "Correct historical event" : "Document update"}
      description={
        correctsEventId
          ? "The original event remains unchanged. Explain what is being corrected and why."
          : "Document observations, reported actions, notes, or decisions. This does not execute actions or grant approvals."
      }
      trigger={correctsEventId ? "Add correction" : "Document update"}
      onSubmit={(f) =>
        api("incident/note", {
          organizationId: a.organizationId,
          incidentId: a.incidentId,
          type: correctsEventId ? "correction" : val(f, "type"),
          title: val(f, "title"),
          description: val(f, "description"),
          findingId,
          correctsEventId,
          evidenceIds: [],
        })
      }
    >
      {!correctsEventId && (
        <Select
          label="Update classification"
          name="type"
          values={["observation", "note", "action", "decision"]}
        />
      )}
      <Field label="Update title">
        <Input required name="title" maxLength={200} />
      </Field>
      <Field
        label={
          correctsEventId
            ? "Correction and justification"
            : "Details and justification"
        }
      >
        <textarea
          className={fieldClass}
          name="description"
          required
          maxLength={6000}
        />
      </Field>
    </Editor>
  );
}
