"use client";
import { useState } from "react";
import Link from "next/link";
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
import { incidentBase, roleLabels } from "@/lib/roles";
import { incidentTime } from "@/lib/incident-model";
import type {
  RecoveryExecution,
  Warning,
  ApprovalRequest,
} from "@/lib/recovery";
const tone = (s: string) =>
  s === "Do Not Use" || s === "Failed" || s === "Rejected"
    ? "text-red-400"
    : ["Available", "Succeeded", "Fallback Active", "Operational"].includes(s)
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
        Version {template.version} · Two independent approvals: Security Engineer
        and Incident Manager. The requester cannot approve. Infrastructure
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
export function AffectedOperations() {
  const d = useRecovery(),
    a = useAccess();
  return (
    <section className="my-7">
      <div className="mb-4 flex flex-wrap gap-3 justify-between">
        <h2 className="text-xl font-semibold">Affected operations</h2>
        <Link
          className="text-sm underline"
          href={`${incidentBase(a.organizationId, a.incidentId)}/operations`}
        >
          Review recovery and approvals →
        </Link>
      </div>
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
}: {
  request: ApprovalRequest;
  decision: "Approve" | "Reject";
  disabled?: boolean;
}) {
  const run = useRecoveryCommand();
  return disabled ? (
    <Button disabled variant="outline">
      {decision === "Approve" ? "Approve request" : "Reject request"}
    </Button>
  ) : (
    <Editor
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
  const r = d.requests.find((r) => r.id === selected) ?? d.requests[0],
    e = r ? d.executions.find((e) => e.id === r.executionId) : undefined;
  const decisions = r ? d.decisions.filter((x) => x.requestId === r.id) : [],
    eligible =
      !!r &&
      a.can("approvals:decide") &&
      r.policyDefinition.roles.includes(a.role) &&
      r.requestedBy !== a.userId &&
      r.status === "Pending" &&
      Number(r.expiresAt) > Number(d.now) &&
      !decisions.some((x) => x.userId === a.userId);
  return (
    <>
      <header className="mb-7 flex justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Operations</h1>
          <p className="mt-2 text-muted-foreground">
            Keep essential work moving independently.
          </p>
        </div>
        {a.can("recovery:start") ? (
          <RecoveryStart trigger="New request" />
        ) : (
          <Button disabled variant="outline">
            New request
          </Button>
        )}
      </header>
      <AffectedOperations />
      <div className="grid gap-6 border-t border-border pt-5 lg:grid-cols-[34%_1fr]">
        <aside className="lg:border-r border-border lg:pr-5">
          <h2 className="mb-4 text-xl font-semibold">Requests</h2>
          {d.requests.map((x) => (
            <button
              key={x.id}
              onClick={() => setSelected(x.id)}
              className={`w-full border-b border-border p-4 text-left ${x.id === r?.id ? "border-l-2 border-l-white bg-muted/30" : ""}`}
            >
              <strong className="block">{x.title}</strong>
              <span className="text-xs text-muted-foreground">
                {x.displayReference} · {x.status}
              </span>
            </button>
          ))}
          <div className="mt-6 grid gap-2">
            <RecoveryStart />
            <RecoveryStart fallback />
            <RequestClosure />
          </div>
        </aside>
        <main className="min-w-0">
          {r ? (
            <>
              <p className="text-xs text-muted-foreground">
                {r.displayReference} · {r.sensitivity} sensitivity · {r.status}
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{r.title}</h2>
              <p className="my-3 text-sm text-muted-foreground">
                {r.description}
              </p>
              <dl className="text-sm grid grid-cols-[100px_1fr] gap-2">
                <dt>Requester</dt>
                <dd>{c.name(r.requestedBy)}</dd>
                <dt>Expires</dt>
                <dd>{incidentTime(r.expiresAt)}</dd>
                <dt>Policy</dt>
                <dd>
                  {r.policyDefinition.roles
                    .map((role) => roleLabels[role])
                    .join(" + ")} · distinct from requester
                </dd>
              </dl>
              <section
                className="mt-5 grid gap-3 text-sm"
                aria-label="Bound approval parameters"
              >
                <h3 className="font-semibold">What this request authorizes</h3>
                <p className="whitespace-pre-wrap">{r.justification}</p>
                {e && (
                  <p>
                    {e.templateId} · version {e.templateVersion} ·{" "}
                    {
                      d.operations.find((o) => o.entityId === e.operationId)
                        ?.name
                    }
                  </p>
                )}
                {e?.kind === "fallback" &&
                  (() => {
                    const p = JSON.parse(r.parameters) as {
                      beneficiaryIds: string[];
                      accessLevel: string;
                      durationSeconds: number;
                      groupId: string;
                    };
                    return (
                      <dl className="grid gap-2 text-xs">
                        <div>
                          <dt>Beneficiaries</dt>
                          <dd>
                            {p.beneficiaryIds
                              .map((id) => c.name(id))
                              .join(", ")}
                          </dd>
                        </div>
                        <div>
                          <dt>Access</dt>
                          <dd>
                            {p.accessLevel} · {p.durationSeconds / 60} minutes ·{" "}
                            {p.groupId}
                          </dd>
                        </div>
                        <p>
                          No original customer-database access. Current
                          membership is checked on every read.
                        </p>
                      </dl>
                    );
                  })()}
                <div className="flex gap-2 flex-wrap">
                  {(JSON.parse(r.evidenceIds) as string[]).map((id) => (
                    <RecoveryEvidence key={id} id={id} />
                  ))}
                </div>
              </section>
              <h3 className="mt-6 mb-3 font-semibold">Independent approval</h3>
              {r.policyDefinition.roles.map((role) => {
                const decision = decisions.find((d) => d.role === role);
                return (
                  <div
                    className="py-3 border-b border-border text-sm flex justify-between gap-3"
                    key={role}
                  >
                    <span>{roleLabels[role]}</span>
                    <span>
                      {decision
                        ? `${c.name(decision.userId)} · ${decision.decision}${decision.eligible ? "" : " (no longer eligible)"}`
                        : "Pending"}
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-2 flex-wrap mt-5">
                <Decision request={r} decision="Approve" disabled={!eligible} />
                <Decision request={r} decision="Reject" disabled={!eligible} />
              </div>
              {decisions.map((decision) => (
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  key={decision.id}
                >
                  {c.name(decision.userId)} · {incidentTime(decision.decidedAt)}
                  : {decision.justification}
                </p>
              ))}
              {r.result && <p className="mt-4 text-sm">{r.result}</p>}
              {e && <ExecutionDetail execution={e} />}
            </>
          ) : (
            <p>No requests recorded.</p>
          )}
        </main>
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Trust warnings</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {d.warnings
            .filter((w) => w.category !== "Available")
            .map((w) => (
              <TrustWarning key={w.id} warning={w} />
            ))}
        </div>
      </section>
      <p className="mt-7 text-xs text-muted-foreground">
        Infrastructure restoration is simulated. Human decisions, durable
        execution, evidence, restricted fallback access and report versions are
        functional. No payment or live infrastructure change is performed.
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
      description="Closure is separate from recovery and does not resolve findings or clear impact assessments. A different authorized Security Engineer and Incident Manager must approve. Request as an independent reviewer, such as the Legal & Compliance Officer, when there is only one Security Engineer and Incident Manager."
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
