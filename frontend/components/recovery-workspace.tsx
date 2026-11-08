"use client";
import { useState } from "react";
import Link from "./workspace-link";
import { PageHeading } from "./workspace-ui";
import { Avatar } from "./account-menu";
import { useRecovery, useRecoveryCommand } from "./recovery-data";
import { useAccess } from "./workspace-provider";
import { useCoordination } from "./coordination-data";
import { useIncident } from "./incident-data";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Editor, Field, fieldClass } from "./incident-forms";
import { EvidenceButton } from "./evidence-panel";
import { TaskButton } from "./coordination-tasks";
import { roleLabels, incidentBase } from "@/lib/roles";
import { incidentTime } from "@/lib/incident-model";
import type {
  RecoveryExecution,
  Warning,
  ApprovalRequest,
} from "@/lib/recovery";
const tone = (s: string) =>
  s === "Do Not Use" || s === "Failed" || s === "Rejected"
    ? "text-red-400"
    : [
          "Available",
          "Approved",
          "Succeeded",
          "Fallback Active",
          "Operational",
        ].includes(s)
      ? "text-emerald-400"
      : "text-amber-300";
export function TrustWarning({ warning: w }: { warning: Warning }) {
  const a = useAccess(),
    run = useRecoveryCommand();
  return (
    <div className="grid gap-3 border border-border rounded-md p-4">
      <div className="flex gap-3 justify-between">
        <strong>{w.name}</strong>
        <Badge className={tone(w.category)} variant="outline">
          {w.category}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{w.explanation}</p>
      <div className="flex flex-wrap gap-2">
        {w.evidenceIds.map((id) => (
          <RecoveryEvidence key={id} id={id} />
        ))}
        {w.findingIds.map((id) => (
          <Link
            className="text-xs underline"
            key={id}
            href={`${incidentBase(a.organizationId, a.incidentId)}/overview?finding=${encodeURIComponent(id)}`}
          >
            Related finding
          </Link>
        ))}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary>Basis and ownership</summary>
        <p>
          {w.explicit
            ? "Explicit incident usage decision"
            : "Deterministic assessment/dependency warning"}{" "}
          · {w.updatedBy} · {incidentTime(w.updatedAt)}
        </p>
        <p>
          Source entities: {w.sourceEntityIds.join(", ") || "None recorded"}
        </p>
        <p>
          Relationships: {w.relationshipIds.join(" → ") || "No dependency path"}
        </p>
        <p>
          Assessments: {w.assessmentIds.join(", ") || "No assessment claimed"}
        </p>
      </details>
      {a.can("trust:manage") && (
        <Editor
          title="Update trust restriction"
          description="Usage restrictions are separate from compromise and individual impact assessments. Linked evidence and justification are required."
          trigger="Review trust restriction"
          onSubmit={(f) =>
            run("trust", {
              entityId: w.entityId,
              category: String(f.get("category")),
              justification: String(f.get("justification")),
              evidenceIds: f.getAll("evidenceIds"),
            })
          }
        >
          <Field label="Usage decision">
            <select
              className={fieldClass}
              name="category"
              defaultValue={w.category}
            >
              {["Do Not Use", "Use With Caution", "Available"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <EvidenceSelection />
          <Field label="Justification">
            <textarea
              name="justification"
              required
              maxLength={3000}
              className={fieldClass}
            />
          </Field>
        </Editor>
      )}
    </div>
  );
}
function RecoveryEvidence({ id }: { id: string }) {
  const d = useIncident(),
    e = d.evidence.find((e) => e.id === id);
  return e ? <EvidenceButton evidence={e} /> : null;
}
function EvidenceSelection() {
  const d = useIncident();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm">Supporting evidence</legend>
      {d.evidence.map((e) => (
        <label key={e.id} className="text-xs flex gap-2">
          <input type="checkbox" name="evidenceIds" value={e.id} />
          {e.id} · {e.filename}
        </label>
      ))}
    </fieldset>
  );
}
export function RecoveryStart({
  fallback = false,
  parent,
  retry,
  trigger,
}: {
  fallback?: boolean;
  parent?: RecoveryExecution;
  retry?: RecoveryExecution;
  trigger?: string;
}) {
  const a = useAccess(),
    d = useRecovery(),
    c = useCoordination(),
    run = useRecoveryCommand(),
    template = d.templates.find(
      (t) =>
        t.templateId === (fallback ? "temporary-support" : "restore-support"),
    ),
    operation = d.operations.find((o) => o.entityId.endsWith(":OP-SUPPORT"));
  if (!a.can("recovery:start") || !template || !operation) return null;
  return (
    <Editor
      trigger={
        trigger ??
        (fallback ? "Request temporary fallback" : "Restore customer support")
      }
      title={template.name}
      description={template.description}
      onSubmit={(f) =>
        run("start", {
          templateId: template.templateId,
          entityId: operation.entityId,
          justification: String(f.get("justification")),
          beneficiaryIds: f.getAll("beneficiaryIds"),
          parentExecutionId: parent?.id ?? "",
          retryOfExecutionId: retry?.id ?? "",
        })
      }
    >
      <p className="text-sm">
        Version {template.version} · Two independent approvals: Security Analyst
        and Incident Commander. The requester cannot approve. Infrastructure
        actions and verification are simulated.
      </p>
      <p className="text-sm text-muted-foreground">{template.expectedResult}</p>
      <ol className="list-decimal pl-5 text-sm">
        {(JSON.parse(template.steps) as string[]).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {fallback && (
        <fieldset className="grid gap-2">
          <legend>
            Approved read-only beneficiaries · expires in one hour
          </legend>
          {c.responders
            .filter((r) =>
              ["commander", "analyst", "operations"].includes(r.role),
            )
            .map((r) => (
              <label key={r.id} className="text-sm">
                <input
                  type="checkbox"
                  name="beneficiaryIds"
                  value={r.id}
                  defaultChecked={r.id === a.userId}
                />{" "}
                {r.name}
              </label>
            ))}
          <p className="text-xs text-muted-foreground">
            Only three independently stored synthetic support records. No access
            to the original Customer Database. No edit or export action.
          </p>
        </fieldset>
      )}
      <Field label="Justification">
        <textarea
          className={fieldClass}
          name="justification"
          required
          maxLength={3000}
        />
      </Field>
    </Editor>
  );
}
export function AffectedOperations({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const d = useRecovery(),
    a = useAccess();
  return (
    <section className={embedded ? undefined : "my-7"}>
      {!embedded && (
        <div className="mb-4 flex flex-wrap gap-3 justify-between">
          <h2 className="text-xl font-semibold">Affected operations</h2>
          <Link
            className="text-sm underline"
            href={`${incidentBase(a.organizationId, a.incidentId)}/operations`}
          >
            Review recovery and approvals →
          </Link>
        </div>
      )}
      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {["Operation", "Status", "Normal-route trust", "Readiness"].map(
                (t) => (
                  <th className="p-3" key={t}>
                    {t}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {d.operations.map((o) => (
              <tr className="border-b border-border last:border-0" key={o.id}>
                <td className="p-3">
                  <strong>{o.name}</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    {o.operatingMode}
                  </p>
                </td>
                <td className={`p-3 ${tone(o.status)}`}>{o.status}</td>
                <td className="p-3">
                  {d.warnings.find((w) => w.entityId === o.entityId)
                    ?.category ?? "Available"}
                </td>
                <td className="p-3">{o.readiness}</td>
              </tr>
            ))}
            {!d.operations.length && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No business-operation readiness data recorded for this
                  incident.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function RelatedRecovery({ entityId }: { entityId: string }) {
  const d = useRecovery(),
    a = useAccess(),
    w = d.warnings.find((w) => w.entityId === entityId);
  return w ? (
    <section className="mt-5 grid gap-3">
      <h3 className="font-semibold">Trust and recovery</h3>
      <TrustWarning warning={w} />
      <Link
        className="text-sm underline"
        href={`${incidentBase(a.organizationId, a.incidentId)}/operations`}
      >
        Review related recovery procedures →
      </Link>
    </section>
  ) : null;
}
function Decision({
  request: r,
  decision,
  disabled = false,
  primary = false,
}: {
  request: ApprovalRequest;
  decision: "Approve" | "Reject";
  disabled?: boolean;
  primary?: boolean;
}) {
  const run = useRecoveryCommand();
  return disabled ? (
    <Button disabled variant={primary ? "default" : "outline"}>
      {decision === "Approve" ? "Approve request" : "Reject request"}
    </Button>
  ) : (
    <Editor
      primary={primary}
      title={`${decision} request`}
      trigger={decision === "Approve" ? "Approve request" : "Reject request"}
      description="Your decision is bound to this request version, procedure parameters, evidence and current trust context. Eligibility is checked again before execution."
      onSubmit={(f) =>
        run("decide", {
          requestId: r.id,
          revisionToken: r.revisionToken,
          decision,
          justification: String(f.get("justification")),
        })
      }
    >
      <Field label="Decision justification">
        <textarea
          className={fieldClass}
          name="justification"
          required
          maxLength={3000}
        />
      </Field>
    </Editor>
  );
}
function SafeSubset({ execution: e }: { execution: RecoveryExecution }) {
  const a = useAccess(),
    d = useRecovery(),
    canRead = d.grants.some(
      (g) =>
        g.executionId === e.id &&
        g.userId === a.userId &&
        g.revokedAt === "0" &&
        Number(g.expiresAt) > Number(d.now),
    );
  const run = useRecoveryCommand(),
    [data, setData] = useState<{
      accessLevel: string;
      expiresAt: string;
      records: {
        id: string;
        label: string;
        serviceTier: string;
        instruction: string;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  return (
    <div className="grid gap-3">
      <Button
        variant="outline"
        onClick={async () => {
          try {
            setError("");
            setData(await run("fallback.records", { executionId: e.id }));
          } catch (err) {
            setData(null);
            setError((err as Error).message);
          }
        }}
      >
        Open approved read-only subset
      </Button>
      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}
      {data && canRead && (
        <div>
          <p className="text-sm mb-3">
            {data.accessLevel} · expires {incidentTime(data.expiresAt)}. This
            separately stored synthetic subset is not the compromised database.
          </p>
          <table className="text-sm w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Support instruction</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">
                    {r.label} · {r.serviceTier}
                  </td>
                  <td className="p-2">{r.instruction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function ExecutionDetail({ execution: e }: { execution: RecoveryExecution }) {
  const d = useRecovery(),
    a = useAccess(),
    run = useRecoveryCommand();
  return (
    <section className="mt-6 border-t border-border pt-5 grid gap-4">
      <div>
        <h3 className="text-lg font-semibold">
          Recovery execution <span className={tone(e.state)}>{e.state}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground break-all">
          {e.id} · {e.templateId} v{e.templateVersion} · attempt {e.attempt}
        </p>
      </div>
      <p className="text-sm">
        {e.result ||
          e.failureReason ||
          "The database scheduler owns progression. You can close this browser; no browser timer executes this workflow."}
      </p>
      <TaskButton id={e.taskId} />
      <ol className="grid gap-3">
        {d.steps
          .filter((s) => s.executionId === e.id)
          .map((s) => (
            <li key={s.id} className="border-l border-border pl-3">
              <p className="text-sm font-medium">
                {s.order + 1}. {s.type} · {s.state}
              </p>
              <p className="text-xs text-muted-foreground">{s.result}</p>
              {s.evidenceId && <RecoveryEvidence id={s.evidenceId} />}
            </li>
          ))}
      </ol>
      {e.state === "Failed" && e.kind === "recovery" && (
        <div className="flex gap-2 flex-wrap">
          <RecoveryStart fallback parent={e} />
          <RecoveryStart
            retry={e}
            trigger="Retry with a new approval request"
          />
        </div>
      )}
      {e.state === "Fallback Active" && <SafeSubset execution={e} />}
      <p className="text-xs text-muted-foreground">
        Original system restrictions, finding certainty and record impact
        assessments remain independent. This workflow does not close the
        incident or complete its investigation task.
      </p>
      {a.can("recovery:manage") &&
        !["Succeeded", "Failed", "Canceled"].includes(e.state) && (
          <Editor
            title="Cancel recovery or revoke fallback"
            trigger="Cancel / revoke"
            description="Preserves the workflow, decisions and audit history. Active fallback grants are revoked."
            onSubmit={(f) =>
              run("cancel", {
                executionId: e.id,
                justification: String(f.get("justification")),
              })
            }
          >
            <Field label="Reason">
              <Input name="justification" required />
            </Field>
          </Editor>
        )}
    </section>
  );
}
export function RecoveryWorkspace() {
  const d = useRecovery(),
    a = useAccess(),
    c = useCoordination(),
    [selected, setSelected] = useState("");
  const r =
    d.requests.find((request) => request.id === selected) ?? d.requests[0];
  const e = r
    ? d.executions.find((execution) => execution.id === r.executionId)
    : undefined;
  const decisions = r
    ? d.decisions.filter((decision) => decision.requestId === r.id)
    : [];
  const operation = r
    ? d.operations.find((item) => item.entityId === r.operationId)
    : undefined;
  const warning = r
    ? d.warnings.find((item) => item.entityId === r.operationId)
    : undefined;
  const pending = d.requests.filter((request) => request.status === "Pending");
  const inReview = pending.filter((request) =>
    d.decisions.some(
      (decision) => decision.requestId === request.id && decision.eligible,
    ),
  ).length;
  const eligible =
    !!r &&
    a.can("approvals:decide") &&
    r.policyDefinition.roles.includes(a.role) &&
    r.requestedBy !== a.userId &&
    r.status === "Pending" &&
    Number(r.expiresAt) > Number(d.now) &&
    !decisions.some((decision) => decision.userId === a.userId);
  const warnings = d.warnings.filter((item) => item.category !== "Available");
  return (
    <>
      <PageHeading
        title="Operations"
        description={`${a.incidentId} · Keep essential work moving independently.`}
        actions={
          a.can("recovery:start") ? (
            <RecoveryStart trigger="New request" />
          ) : (
            <Button disabled variant="outline">
              New request
            </Button>
          )
        }
      />
      <p className="-mt-3 mb-4 text-base text-muted-foreground sm:text-lg">
        {pending.length - inReview} awaiting approval
        <span className="mx-2">·</span>
        {inReview} in review
        <span className="mx-2">·</span>
        {
          d.requests.filter((request) => request.status === "Approved").length
        }{" "}
        approved
      </p>
      <details className="mb-5">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Business continuity reports
        </summary>
        <AffectedOperations />
      </details>
      <div className="grid min-w-0 grid-cols-1 border-t border-border pt-5 lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]">
        <aside className="min-w-0 border-b border-border pb-6 lg:border-r lg:border-b-0 lg:pr-5">
          <h2 className="mb-5 text-2xl font-semibold">Requests</h2>
          {d.requests.map((request) => (
            <button
              key={request.id}
              onClick={() => setSelected(request.id)}
              className={`flex w-full items-center justify-between gap-4 border-b border-border px-4 py-3 text-left ${r?.id === request.id ? "border-l-[3px] border-l-white bg-muted/35" : "border-l-[3px] border-l-transparent hover:bg-muted/15"}`}
            >
              <span className="min-w-0">
                <span className="block text-lg font-semibold break-words">
                  {request.title}
                </span>
                <span className="mt-1 block text-base text-muted-foreground">
                  {request.displayReference}
                </span>
              </span>
              <span
                className={`flex shrink-0 items-center gap-2 text-base ${tone(request.status)}`}
              >
                <span className="size-2 rounded-full bg-current" />
                {request.status}
              </span>
            </button>
          ))}
          <details className="mt-6 border-t border-border pt-4">
            <summary className="cursor-pointer text-base text-muted-foreground">
              Recovery tools
            </summary>
            <div className="mt-4 flex flex-wrap gap-3">
              <RecoveryStart />
              <RecoveryStart fallback />
              <RequestClosure />
            </div>
          </details>
        </aside>
        <section
          aria-label="Selected request"
          className="min-w-0 pt-6 lg:pt-0 lg:pl-8"
        >
          {r ? (
            <>
              <p className="mb-3 text-base text-muted-foreground sm:text-lg">
                {r.displayReference}
                <span className="mx-2">/</span>
                {r.actionType.replaceAll("_", " ")}
              </p>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <h2 className="text-[34px] leading-tight font-semibold break-words">
                  {r.title}
                </h2>
                <span className={`text-2xl font-semibold ${tone(r.status)}`}>
                  {r.status}
                </span>
              </div>
              <p className="mt-2 text-base leading-7 text-muted-foreground sm:text-lg">
                {r.description}
              </p>
              <dl className="my-5 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-base sm:grid-cols-[200px_minmax(0,1fr)] sm:text-lg">
                <dt>Requester</dt>
                <dd className="text-muted-foreground">
                  {c.name(r.requestedBy)}
                </dd>
                <dt>Normal route</dt>
                <dd className="text-muted-foreground">
                  {warning?.category ??
                    (operation ? "Available" : "Not recorded")}
                </dd>
              </dl>
              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-lg font-semibold">
                  Independent approval
                </h3>
                {r.policyDefinition.roles.map((role) => {
                  const decision = decisions.find((item) => item.role === role);
                  const reviewers = c.responders.filter(
                    (person) =>
                      person.role === role && person.id !== r.requestedBy,
                  );
                  const name = decision
                    ? c.name(decision.userId)
                    : reviewers.length === 1
                      ? reviewers[0].name
                      : (roleLabels[role] ?? role);
                  return (
                    <div
                      key={role}
                      className="flex flex-wrap items-center gap-4 border-b border-border py-3"
                    >
                      <Avatar name={name} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {name}
                          {decision?.userId === a.userId && " · You"}
                        </p>
                        <p className="mt-1 text-base text-muted-foreground">
                          {roleLabels[role] ?? role}
                          {!decision &&
                            reviewers.length === 1 &&
                            " · Eligible reviewer"}
                        </p>
                        {!decision && reviewers.length > 1 && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Eligible:{" "}
                            {reviewers.map((person) => person.name).join(", ")}
                          </p>
                        )}
                      </div>
                      <span
                        className={`ml-auto text-base sm:text-lg ${decision?.eligible && decision.decision === "Approve" ? "text-emerald-400" : decision?.decision === "Reject" ? "text-red-400" : "text-amber-300"}`}
                      >
                        {decision
                          ? `${decision.decision === "Approve" ? "Approved" : "Rejected"}${decision.eligible ? "" : " · No longer eligible"}`
                          : "Pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <details
                key={`${r.id}:rationale`}
                className="border-b border-border py-5"
              >
                <summary className="cursor-pointer text-lg font-semibold">
                  Fallback rationale &amp; evidence
                  <span className="mt-1 block text-base font-normal text-muted-foreground">
                    {r.justification ||
                      "Review the request’s authorization and supporting evidence."}
                  </span>
                </summary>
                <section
                  aria-label="Bound approval parameters"
                  className="mt-4 grid gap-4 text-base"
                >
                  <h3 className="font-semibold">
                    What this request authorizes
                  </h3>
                  <p className="whitespace-pre-wrap">{r.justification}</p>
                  {e && (
                    <p>
                      {e.templateId} · version {e.templateVersion} ·{" "}
                      {operation?.name}
                    </p>
                  )}
                  {e?.kind === "fallback" &&
                    (() => {
                      const parameters = JSON.parse(r.parameters) as {
                        beneficiaryIds: string[];
                        accessLevel: string;
                        durationSeconds: number;
                        groupId: string;
                      };
                      return (
                        <div className="grid gap-2">
                          <p>
                            Beneficiaries:{" "}
                            {parameters.beneficiaryIds
                              .map((id) => c.name(id))
                              .join(", ")}
                          </p>
                          <p>
                            {parameters.accessLevel} ·{" "}
                            {parameters.durationSeconds / 60} minutes ·{" "}
                            {parameters.groupId}
                          </p>
                          <p>
                            No original customer-database access. Current
                            membership is checked on every read.
                          </p>
                        </div>
                      );
                    })()}
                  <div className="flex flex-wrap gap-2">
                    {(JSON.parse(r.evidenceIds) as string[]).map((id) => (
                      <RecoveryEvidence key={id} id={id} />
                    ))}
                  </div>
                  {!(JSON.parse(r.evidenceIds) as string[]).length && (
                    <p className="text-muted-foreground">
                      No evidence linked to this request.
                    </p>
                  )}
                </section>
              </details>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <div className="min-w-56 sm:min-w-[340px] [&>button]:w-full">
                  <Decision
                    request={r}
                    decision="Approve"
                    disabled={!eligible}
                    primary
                  />
                </div>
                <Decision request={r} decision="Reject" disabled={!eligible} />
              </div>
              <p className="mt-4 text-base leading-6 text-muted-foreground">
                {r.policyDefinition.roles
                  .map((role) => roleLabels[role] ?? role)
                  .join(r.policyDefinition.anyRole ? " or " : " + ")}{" "}
                approval required, independent of the requester. Decisions are
                checked against current access, evidence and request expiry.
              </p>
              <details
                key={`${r.id}:history`}
                className="mt-5 border-t border-border py-4"
              >
                <summary className="cursor-pointer text-base text-muted-foreground">
                  Approval policy &amp; history
                </summary>
                <div className="mt-4 grid gap-3 text-base text-muted-foreground">
                  <p>
                    {r.policyDefinition.name} · {r.sensitivity} sensitivity
                  </p>
                  <p>Expires {incidentTime(r.expiresAt)}</p>
                  {decisions.map((decision) => (
                    <p key={decision.id}>
                      {c.name(decision.userId)} ·{" "}
                      {incidentTime(decision.decidedAt)}:{" "}
                      {decision.justification}
                    </p>
                  ))}
                  {!decisions.length && <p>No decisions recorded.</p>}
                  {r.result && <p>{r.result}</p>}
                </div>
              </details>
              {e && (
                <details
                  key={`${r.id}:execution`}
                  className="border-t border-border py-4"
                >
                  <summary className="cursor-pointer text-base text-muted-foreground">
                    Recovery progress ·{" "}
                    <span className={tone(e.state)}>{e.state}</span>
                  </summary>
                  <ExecutionDetail execution={e} />
                </details>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {d.ready ? "No requests recorded." : "Loading requests…"}
            </p>
          )}
        </section>
      </div>
      <details className="mt-8 border-t border-border py-5">
        <summary className="cursor-pointer text-base text-muted-foreground">
          Trust warnings ({warnings.length})
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {warnings.map((warning) => (
            <TrustWarning key={warning.id} warning={warning} />
          ))}
        </div>
      </details>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Infrastructure restoration is simulated. Decisions, evidence and limited
        fallback access are functional. No payment or live infrastructure change
        is performed.
      </p>
    </>
  );
}

export function RequestClosure() {
  const a = useAccess(),
    d = useIncident(),
    run = useRecoveryCommand();
  if (!a.can("reports:export") || d.incident?.status === "Closed") return null;
  return (
    <Editor
      title="Request independent incident closure"
      trigger="Request incident closure"
      description="Closure is separate from recovery and does not resolve findings or clear impact assessments. A different authorized analyst and commander must approve. Request as an independent reviewer, such as Legal, when there is only one analyst and commander."
      onSubmit={(f) =>
        run("close", {
          justification: String(f.get("justification")),
          evidenceIds: f.getAll("evidenceIds"),
        })
      }
    >
      <p className="text-sm text-amber-300">
        Unresolved findings and unknown scope remain in the report. Explain the
        explicit human decision to close.
      </p>
      <EvidenceSelection />
      <Field label="Closure justification">
        <textarea
          name="justification"
          className={fieldClass}
          required
          maxLength={3000}
        />
      </Field>
    </Editor>
  );
}
