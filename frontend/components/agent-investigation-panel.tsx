"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccess } from "./workspace-provider";
import { useInvestigationData } from "./investigation-data";
import { useIncident } from "./incident-data";
import { EvidenceButton } from "./evidence-panel";
import { api } from "@/lib/api";
import { incidentBase } from "@/lib/roles";
import { Button } from "./ui/button";
import type {
  GroundedProposal,
  ReviewedProposal,
} from "../../shared/agent-investigation";
import type { InvestigationRun } from "../../shared/investigation";
interface ProposalPage {
  rows: ReviewedProposal[];
  total: number;
  trace: { name: string; callId: string }[];
}
export function AgentInvestigationPanel({ run }: { run: InvestigationRun }) {
  const a = useAccess(),
    d = useInvestigationData(),
    incident = useIncident(),
    agent = d.agent;
  const canRead = a.can("evidence:view") && a.can("scope:records");
  const canStart = canRead && a.can("scope:edit") && a.can("evidence:upload");
  const [loadedPage, setPage] = useState<
      ProposalPage & { agentRunId: string }
    >(),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const operation = useRef<string | undefined>(undefined);
  const agentId = agent?.id,
    updatedAt = agent?.updatedAt,
    pending = agent?.pending;
  const page =
    canRead && loadedPage?.agentRunId === agentId ? loadedPage : undefined;
  useEffect(() => {
    if (!agentId || !canRead) return;
    let active = true;
    api<ProposalPage>("investigation", {
      action: "agent.read",
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      agentRunId: agentId,
      offset,
      limit: 25,
    })
      .then((r) => {
        if (active) setPage({ ...r, agentRunId: agentId });
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [
    agentId,
    updatedAt,
    pending,
    canRead,
    a.organizationId,
    a.incidentId,
    offset,
    refresh,
  ]);
  const active = agent && ["Queued", "Running"].includes(agent.status);
  async function start() {
    setBusy(true);
    setError("");
    operation.current ??= crypto.randomUUID();
    try {
      await api("investigation", {
        action: "agent.start",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        runId: run.id,
        operationId: operation.current,
      });
      operation.current = undefined;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (run.deterministicStatus !== "Complete") return null;
  return (
    <section
      className="my-6 rounded-lg border border-border p-5"
      aria-label="Agent investigation and review"
    >
      <h2 className="text-lg font-semibold">
        Agent investigation &amp; human review
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The agent inspects deterministic observations and original source
        records. Proposals remain separate from findings until an authorized
        responder reviews them.
      </p>
      <p className="mt-3 text-sm" data-testid="agent-status">
        Agent: {agent?.status ?? "Not started"}
        {agent?.model ? ` · ${agent.model}` : ""}
        {agent
          ? ` · ${agent.pending} awaiting review · ${agent.toolCount} completed tools`
          : ""}
      </p>
      {agent?.error && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {agent.error}
        </p>
      )}
      {canStart &&
        (!agent ||
          ["Failed", "Unavailable", "Revoked", "Canceled"].includes(
            agent.status,
          )) && (
          <Button className="mt-4" disabled={busy} onClick={start}>
            {busy
              ? "Submitting…"
              : agent
                ? "Retry agent investigation"
                : "Run investigation agent"}
          </Button>
        )}
      {active && canStart && (
        <Button
          className="mt-4"
          variant="outline"
          onClick={async () => {
            try {
              await api("investigation", {
                action: "agent.cancel",
                organizationId: a.organizationId,
                incidentId: a.incidentId,
                agentRunId: agent.id,
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Cancel agent investigation
        </Button>
      )}
      {active && (
        <p className="mt-3 text-xs text-muted-foreground">
          Work continues in the background. The incident dashboard and
          deterministic results remain available.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {error}
        </p>
      )}
      {page?.trace.length ? (
        <details className="mt-4 text-sm">
          <summary>Completed tool calls</summary>
          <ol className="mt-2 list-inside list-decimal">
            {page.trace.map((t) => (
              <li key={t.callId}>{t.name}</li>
            ))}
          </ol>
        </details>
      ) : null}
      {agent?.status === "Complete" && page && !page.total && (
        <p className="mt-4 text-sm">
          Investigation complete with no applicable unexplained anomalies. This
          does not establish source trust, absence of exposure, or restoration
          safety.
        </p>
      )}
      {page?.rows.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          canReview={a.can("findings:create") && canRead}
          canLink={a.can("scope:edit")}
          onReviewed={() => setRefresh((v) => v + 1)}
          evidence={incident.evidence}
        />
      ))}
      {page && page.total > 25 && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset((v) => v - 25)}
          >
            Previous proposals
          </Button>
          <Button
            variant="outline"
            disabled={offset + 25 >= page.total}
            onClick={() => setOffset((v) => v + 25)}
          >
            Next proposals
          </Button>
        </div>
      )}
    </section>
  );
}
function ProposalCard({
  proposal: p,
  canReview,
  canLink,
  onReviewed,
  evidence,
}: {
  proposal: ReviewedProposal;
  canReview: boolean;
  canLink: boolean;
  onReviewed: () => void;
  evidence: ReturnType<typeof useIncident>["evidence"];
}) {
  const a = useAccess(),
    content = JSON.parse(p.content) as GroundedProposal;
  const [justification, setJustification] = useState(""),
    [status, setStatus] = useState("Suspected"),
    [linkScope, setLinkScope] = useState(canLink),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
        status,
        linkScope,
      });
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="mt-5 border-t border-border pt-5"
      data-testid="agent-proposal"
    >
      <h3 className="text-base font-semibold">{content.title}</h3>
      <p className="mt-1 text-xs">
        {p.status} · Proposed priority: {content.priority}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm">{content.claim}</p>
      <p className="mt-3 text-sm">{content.rationale}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Limitations: {content.uncertainty}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Missing information: {content.missingInformation}
      </p>
      <details className="mt-4 text-sm">
        <summary>Exact evidence citations ({content.citations.length})</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(content.citations, null, 2)}
        </pre>
      </details>
      <div className="my-4 flex flex-wrap gap-2 [&>button]:h-auto [&>button]:max-w-full [&>button]:flex-wrap [&>button]:whitespace-normal [&>button]:py-2">
        {[...new Set(content.citations.map((c) => c.evidenceId))].map((id) => {
          const e = evidence.find((e) => e.id === id);
          return e ? <EvidenceButton key={id} evidence={e} /> : null;
        })}
      </div>
      {p.status === "Pending" && canReview ? (
        <>
          <p className="my-3 text-sm">
            Accept creates one evidence-linked finding with the title, claim,
            limitations and priority above. It does not confirm impact or change
            recovery eligibility.
          </p>
          <label className="block text-sm">
            Finding status
            <select
              className="ml-3 rounded border border-border bg-background p-2"
              aria-label="Finding status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>Suspected</option>
              <option>Unverified</option>
            </select>
          </label>
          {canLink && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkScope}
                onChange={(e) => setLinkScope(e.target.checked)}
              />
              <span className="break-all">
                Link the finding to this existing Scope dataset as Suspected:{" "}
                {content.entityId}
              </span>
            </label>
          )}
          <label className="mt-4 block text-sm">
            Review justification
            <textarea
              aria-label="Review justification"
              required
              maxLength={2000}
              className="mt-2 block min-h-20 w-full rounded border border-border bg-background p-3"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              disabled={busy || !justification.trim()}
              onClick={() => review("Accept")}
            >
              Accept proposal
            </Button>
            <Button
              variant="outline"
              disabled={busy || !justification.trim()}
              onClick={() => review("Reject")}
            >
              Reject proposal
            </Button>
          </div>
        </>
      ) : p.status !== "Pending" ? (
        <p className="mt-4 text-sm">
          Reviewed by {p.reviewerId}: {p.justification}
          {p.findingId && (
            <>
              {" "}
              ·{" "}
              <Link
                className="underline"
                href={`${incidentBase(a.organizationId, a.incidentId)}/overview`}
              >
                View finding on Overview
              </Link>
            </>
          )}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Current evidence, record and finding permissions are required for
          review.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-amber-300" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
