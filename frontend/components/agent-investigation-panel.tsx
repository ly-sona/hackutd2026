"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { incidentBase } from "@/lib/roles";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EvidenceButton } from "./evidence-panel";
import {
  isImpact,
  findingLabel,
  sourceName,
  type InvestigationProposal,
} from "../../shared/investigation-impact";
import type {
  Citation,
  ReviewedProposal,
  AgentObservation,
} from "../../shared/agent-investigation";
import type { SourceRecord } from "../../shared/investigation";
export interface ProposalPage {
  rows: ReviewedProposal[];
  total: number;
  trace: { name: string; callId: string; args?: unknown }[];
  impactPrepared: boolean;
  assessedEntities: number;
}
interface Inspection {
  citations: (Citation & {
    record: SourceRecord;
    role: string;
    sourceId: string;
    coverage: string;
  })[];
  manualReason: string;
  currentAssessment?: { status: string; verifiedBy: string };
}
export function ProposalRows({
  rows,
  onSelect,
}: {
  rows: ReviewedProposal[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {rows.map((p) => {
        const c = JSON.parse(p.content) as InvestigationProposal,
          impact = isImpact(c);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className="flex w-full items-start justify-between gap-6 py-4 text-left hover:bg-muted/20"
            data-testid={`proposal-row-${p.id}`}
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {impact ? "Impact assessment" : "Agent interpretation"}
                </span>
                <span
                  className={p.status === "Pending" ? "text-amber-300" : ""}
                >
                  {p.status === "Pending" ? "Needs review" : p.status}
                </span>
                {!impact && <span>{c.priority} priority</span>}
              </div>
              <h3 className="text-base font-medium">
                {impact ? c.title : findingLabel(c)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {impact
                  ? c.targetLabel
                  : `${sourceName(c.entityId.replace(/:dataset$/, ""))} · ${c.citations[0]?.key ?? "Source"}`}{" "}
                · {new Set(c.citations.map((r) => r.evidenceId)).size} evidence{" "}
                {new Set(c.citations.map((r) => r.evidenceId)).size === 1
                  ? "item"
                  : "items"}
              </p>
              <p className="mt-2 line-clamp-1 max-w-3xl text-sm text-muted-foreground">
                {c.claim}
              </p>
            </div>
            <span className="shrink-0 pt-5 text-sm underline underline-offset-4">
              {p.status === "Pending" ? "Review" : "View decision"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
export function ProposalReviewDialog({
  proposal,
  onClose,
  onReviewed,
}: {
  proposal: ReviewedProposal | undefined;
  onClose: () => void;
  onReviewed: () => void;
}) {
  return (
    <Dialog
      open={!!proposal}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {proposal && (
        <ProposalReview
          key={proposal.id}
          proposal={proposal}
          onReviewed={onReviewed}
        />
      )}
    </Dialog>
  );
}
function ProposalReview({
  proposal: p,
  onReviewed,
}: {
  proposal: ReviewedProposal;
  onReviewed: () => void;
}) {
  const a = useAccess(),
    incident = useIncident(),
    content = JSON.parse(p.content) as InvestigationProposal,
    impact = isImpact(content);
  const [inspection, setInspection] = useState<Inspection>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  const [justification, setJustification] = useState(""),
    [classification, setClassification] = useState("Suspected"),
    [linkScope, setLinkScope] = useState(a.can("scope:edit"));
  const canReview = impact ? a.can("scope:edit") : a.can("findings:create");
  useEffect(() => {
    let active = true;
    api<Inspection>("investigation", {
      action: "agent.inspect",
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      agentRunId: p.agentRunId,
      proposalId: p.id,
    })
      .then((r) => {
        if (active) setInspection(r);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [p.id, p.agentRunId, a.organizationId, a.incidentId]);
  async function review(decision: "Accept" | "Reject") {
    setBusy(true);
    setError("");
    try {
      await api("investigation", {
        action: "agent.review",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        agentRunId: p.agentRunId,
        proposalId: p.id,
        decision,
        justification,
        status: impact ? content.proposedStatus : classification,
        linkScope: impact ? false : linkScope,
      });
      setResult(
        decision === "Reject"
          ? "Proposal rejected. The evidence and decision history are retained."
          : impact
            ? `${content.dimension} assessment recorded in Scope as ${content.proposedStatus}.`
            : `${classification} finding created. It is now available on Overview and Timeline.`,
      );
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function followUp() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ taskId: string }>("investigation", {
        action: "agent.task",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        agentRunId: p.agentRunId,
        proposalId: p.id,
      });
      setResult(
        `Follow-up investigation task created: ${result.taskId}. Open Team to continue; recovery approvals remain separate.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent
      data-testid="agent-proposal"
      className="gap-0 p-0 sm:max-w-[920px]"
    >
      <DialogHeader className="border-b border-border px-6 py-5">
        <DialogTitle>
          {impact ? content.title : findingLabel(content)}
        </DialogTitle>
        <DialogDescription>
          <span>{p.status}</span> ·{" "}
          {impact
            ? `${content.dimension} assessment · ${content.targetLabel}`
            : "Agent finding proposal · Human review required"}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <DetailBlock title="What AEGIS found">
            <p className="whitespace-pre-wrap">{content.claim}</p>
          </DetailBlock>
          <DetailBlock title="Why it matters">
            <p>{impact ? content.targetLabel : content.rationale}</p>
            {impact && (
              <p className="mt-2">
                The proposed change concerns {content.dimension.toLowerCase()}{" "}
                only; other impact dimensions remain independent.
              </p>
            )}
          </DetailBlock>
          <DetailBlock title="What remains unknown">
            <p>{content.uncertainty}</p>
            <p className="mt-2 text-muted-foreground">
              {content.missingInformation}
            </p>
          </DetailBlock>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Supporting evidence</h3>
          {!inspection ? (
            <p className="text-sm text-muted-foreground">
              Loading authorized source details…
            </p>
          ) : (
            inspection.citations.map((ref, index) => {
              const e = incident.evidence.find((e) => e.id === ref.evidenceId);
              const fields = ref.fields.length
                ? ref.fields
                : Object.keys(ref.record.fields).slice(0, 4);
              return (
                <div
                  key={`${ref.snapshotId}:${ref.key}:${index}`}
                  className="mb-3 border-l border-border pl-4 text-sm"
                >
                  <p className="font-medium">
                    {sourceName(ref.sourceId)} · {ref.key}
                  </p>
                  <p className="mb-2 mt-1 text-xs text-muted-foreground">
                    {ref.role === "baseline"
                      ? "Supplied baseline"
                      : "Collected snapshot"}{" "}
                    ·{" "}
                    {ref.observedAt
                      ? new Date(ref.observedAt).toLocaleString()
                      : "Observation time not supplied"}
                  </p>
                  <dl className="mb-2 space-y-1">
                    {fields.map((field) => (
                      <div
                        key={field}
                        className="grid grid-cols-[minmax(90px,1fr)_minmax(0,2fr)] gap-3"
                      >
                        <dt className="text-muted-foreground">
                          {fieldLabel(field)}
                        </dt>
                        <dd className="break-words">
                          {String(ref.record.fields[field] ?? "Not supplied")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="[&>button]:h-auto [&>button]:flex-wrap [&>button]:whitespace-normal">
                    {e && <EvidenceButton evidence={e} />}
                  </div>
                </div>
              );
            })
          )}
          <details className="mt-4 text-xs text-muted-foreground">
            <summary>Exact provenance and technical references</summary>
            <pre className="mt-3 whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  proposalId: p.id,
                  entityId: content.entityId,
                  citations: content.citations,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      </div>
      <div className="border-t border-border px-6 py-5">
        <h3 className="mb-2 text-sm font-semibold">Proposed action</h3>
        <p className="text-sm">
          {impact
            ? `Record ${content.dimension} as ${content.proposedStatus} on ${content.targetLabel}, with the cited evidence and your justification.`
            : `Create one ${classification} incident finding with the supported evidence and limitations above.`}
        </p>
        {impact && inspection?.currentAssessment && (
          <p className="mt-2 text-sm text-muted-foreground">
            Current Scope state: {inspection.currentAssessment.status}
            {inspection.currentAssessment.verifiedBy
              ? " · Human-verified assessment"
              : ""}
          </p>
        )}
        {inspection?.manualReason && (
          <p className="mt-2 text-sm text-amber-300">
            {inspection.manualReason}{" "}
            <Link
              className="underline"
              href={`${incidentBase(a.organizationId, a.incidentId)}/scope`}
            >
              Open Scope
            </Link>
          </p>
        )}
        {p.status === "Pending" && !result && canReview ? (
          <div className="mt-4">
            {!impact && (
              <div className="mb-4 flex flex-wrap items-center gap-5 text-sm">
                <label>
                  Finding status{" "}
                  <select
                    aria-label="Finding status"
                    value={classification}
                    onChange={(e) => setClassification(e.target.value)}
                    className="ml-2 rounded border border-border bg-background px-2 py-1"
                  >
                    <option>Suspected</option>
                    <option>Unverified</option>
                  </select>
                </label>
                {a.can("scope:edit") && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={linkScope}
                      onChange={(e) => setLinkScope(e.target.checked)}
                    />
                    Link this finding to its existing Scope dataset
                  </label>
                )}
              </div>
            )}
            <label className="text-sm">
              Review justification
              <textarea
                aria-label="Review justification"
                maxLength={2000}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="mt-2 block min-h-16 w-full rounded border border-border bg-background px-3 py-2"
                placeholder="Explain your decision based on the evidence and limitations."
              />
            </label>
            <div className="mt-3 flex items-center gap-3">
              <Button
                disabled={
                  busy ||
                  !justification.trim() ||
                  !inspection ||
                  !!inspection.manualReason
                }
                onClick={() => review("Accept")}
              >
                {impact ? "Accept assessment" : "Accept proposal"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !justification.trim()}
                onClick={() => review("Reject")}
              >
                Reject
              </Button>
              <span className="text-xs text-muted-foreground">
                Confirmation remains a separate authorized action.
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm" role="status">
            {result || `${p.status} by ${p.reviewerId}: ${p.justification}`}
            {p.status === "Pending" &&
              !canReview &&
              " · Your current permissions do not allow this review."}
            {p.status === "Accepted" && (
              <div className="my-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Recommended next step: verify relevant source authenticity,
                  access and dependencies before requesting recovery. This
                  review does not establish restoration safety.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  {a.can("tasks:create") && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={followUp}
                    >
                      Create follow-up task for me
                    </Button>
                  )}
                  <Link
                    className="underline"
                    href={`${incidentBase(a.organizationId, a.incidentId)}/team`}
                  >
                    Open Team
                  </Link>
                  <Link
                    className="underline"
                    href={`${incidentBase(a.organizationId, a.incidentId)}/operations`}
                  >
                    Recovery and report workflows
                  </Link>
                </div>
              </div>
            )}
            <div className="mt-2 flex gap-4">
              <Link
                className="underline"
                href={`${incidentBase(a.organizationId, a.incidentId)}/${impact ? `scope?entity=${encodeURIComponent(content.entityId)}` : "overview"}`}
              >
                {impact ? "View assessment in Scope" : "View incident finding"}
              </Link>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-300">
            {error}
          </p>
        )}
      </div>
    </DialogContent>
  );
}
export function ObservationDialog({
  observation: o,
  onClose,
}: {
  observation: AgentObservation | undefined;
  onClose: () => void;
}) {
  const d = useIncident();
  return (
    <Dialog
      open={!!o}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {o && (
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{observationTitle(o)}</DialogTitle>
            <DialogDescription>
              Deterministic observation · {sourceName(o.sourceId)} · {o.key}
            </DialogDescription>
          </DialogHeader>
          <DetailBlock title="Observed evidence">
            <p>{o.description}</p>
          </DetailBlock>
          <DetailBlock title="What remains unknown">
            <p>
              Source provenance, cause and impact require verification. This
              observation is separate from an accepted incident finding or
              human-verified assessment.
            </p>
          </DetailBlock>
          <div className="flex flex-wrap gap-2">
            {[
              ...new Set(
                (JSON.parse(o.provenance) as Citation[]).map(
                  (r) => r.evidenceId,
                ),
              ),
            ].map((id) => {
              const e = d.evidence.find((e) => e.id === id);
              return e ? <EvidenceButton key={id} evidence={e} /> : null;
            })}
          </div>
          <details className="text-xs text-muted-foreground">
            <summary>Exact source references</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">
              {JSON.stringify(
                {
                  id: o.id,
                  rule: o.rule,
                  version: o.ruleVersion,
                  references: JSON.parse(o.provenance),
                },
                null,
                2,
              )}
            </pre>
          </details>
        </DialogContent>
      )}
    </Dialog>
  );
}
import { observationLabels } from "../../shared/investigation-impact";
export const observationTitle = (o: AgentObservation) =>
  observationLabels[o.rule] ?? "Source observation";
export const fieldLabel = (value: string) => {
  const text = value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return text[0].toUpperCase() + text.slice(1);
};
function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}
