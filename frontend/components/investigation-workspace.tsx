"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { incidentBase } from "@/lib/roles";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { useInvestigationData } from "./investigation-data";
import { Button } from "./ui/button";
import {
  ProposalRows,
  ProposalReviewDialog,
  ObservationDialog,
  observationTitle,
  type ProposalPage,
} from "./agent-investigation-panel";
import { InvestigationChanges } from "./investigation-changes";
import { InvestigationMonitoring } from "./investigation-monitoring";
import { InvestigationEvidence } from "./investigation-evidence";
import {
  isImpact,
  dimensionLabels,
  observationDimension,
  sourceName,
  type ImpactDimension,
  type InvestigationProposal,
} from "../../shared/investigation-impact";
import type { AgentObservation } from "../../shared/agent-investigation";
export function InvestigationWorkspace() {
  const a = useAccess(),
    incident = useIncident(),
    d = useInvestigationData();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const run = d.runs.find((r) => r.id === selectedRunId) ?? d.run,
    agent = d.agents.find((j) => j.collectionRunId === run?.id);
  const [sourcesOpen, setSourcesOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string>(),
    [observationId, setObservationId] = useState<string>(),
    [dimension, setDimension] = useState<ImpactDimension>();
  const [observed, setObserved] = useState<{
      runId: string;
      rows: AgentObservation[];
      total: number;
    }>(),
    [proposals, setProposals] = useState<
      ProposalPage & { agentRunId: string }
    >();
  const operation = useRef<string | undefined>(undefined);
  const canRead = a.can("evidence:view") && a.can("scope:records"),
    canStart = canRead && a.can("scope:edit") && a.can("evidence:upload");
  const runId = run?.id,
    runUpdated = run?.updatedAt,
    agentId = agent?.id,
    agentUpdated = agent?.updatedAt,
    pending = agent?.pending;
  useEffect(() => {
    if (!runId || !canRead) return;
    let active = true;
    api<{ rows: AgentObservation[]; total: number }>("investigation", {
      action: "read",
      kind: "observations",
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      runId,
      offset,
      limit: 25,
    })
      .then((result) => {
        if (active) setObserved({ ...result, runId });
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [runId, runUpdated, canRead, a.organizationId, a.incidentId, offset]);
  useEffect(() => {
    if (!agentId || !canRead) return;
    let active = true;
    api<ProposalPage>("investigation", {
      action: "agent.read",
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      agentRunId: agentId,
      offset: 0,
      limit: 25,
    })
      .then((result) => {
        if (active) setProposals({ ...result, agentRunId: agentId });
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [
    agentId,
    agentUpdated,
    pending,
    canRead,
    a.organizationId,
    a.incidentId,
    refresh,
  ]);
  const observationPage =
      canRead && observed?.runId === runId ? observed : undefined,
    proposalPage =
      canRead && proposals?.agentRunId === agentId ? proposals : undefined;
  const observations = observationPage?.rows ?? [],
    rows = proposalPage?.rows ?? [],
    candidates = rows.filter((p) =>
      isImpact(JSON.parse(p.content) as InvestigationProposal),
    );
  const analysisComplete = agent?.status === "Complete";
  const visibleDimension = analysisComplete ? undefined : dimension;
  const filter = (p: (typeof rows)[number]) => {
    const c = JSON.parse(p.content) as InvestigationProposal;
    return (
      !visibleDimension || (isImpact(c) && c.dimension === visibleDimension)
    );
  };
  const needsReview = rows.filter((p) => p.status === "Pending" && filter(p)),
    decisions = rows.filter((p) => p.status !== "Pending" && filter(p));
  const shownObservations = observations.filter(
    (o) => !visibleDimension || observationDimension(o) === visibleDimension,
  );
  const currentSources = (
      d.historicalSources.filter((s) => s.runId === runId).length
        ? d.historicalSources.filter((s) => s.runId === runId)
        : d.sources
    ).filter((s) => run && JSON.parse(run.sourceIds).includes(s.id)),
    entries = currentSources.reduce((n, s) => n + (s.recordCount ?? 0), 0);
  const canCollectNext =
    d.runs.some((r) => r.status === "Complete" && (r.revision ?? 1) < 2) &&
    !d.runs.some((r) =>
      ["Queued", "Collecting", "Analyzing"].includes(r.status),
    ) &&
    !d.runs.some((r) => r.status === "Complete" && (r.revision ?? 1) >= 2);
  const collectionFailed =
    !!run && ["Failed", "Canceled", "Revoked"].includes(run.status);
  const activeCollection =
      run && ["Queued", "Collecting", "Analyzing"].includes(run.status),
    activeAgent = agent && ["Queued", "Running"].includes(agent.status),
    retryAgent =
      agent &&
      ["Failed", "Unavailable", "Revoked", "Canceled"].includes(agent.status);
  async function launch() {
    if (!run) return;
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
  async function cancel(which: "agent.cancel" | "cancel") {
    if (!run) return;
    try {
      await api("investigation", {
        action: which,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        runId: run.id,
        agentRunId: agent?.id,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!d.ready) return <p role="status">Loading Investigation…</p>;
  const protectedCase = d.metadata?.mode === "reference";
  const status = protectedCase
    ? "Established reference"
    : activeCollection
      ? "Collecting evidence"
      : activeAgent
        ? "Investigating"
        : retryAgent
          ? agent.status === "Failed"
            ? "Analysis incomplete"
            : `Analysis ${agent.status.toLowerCase()}`
          : agent?.status === "Complete"
            ? agent.pending
              ? "Needs review"
              : "Investigation complete"
            : run?.deterministicStatus === "Complete"
              ? "Evidence ready"
              : (run?.status ?? "Ready to collect");
  return (
    <>
      <header className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            {a.incidentId} / INVESTIGATION
          </p>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-8">
            <h1 className="text-3xl font-semibold leading-8 tracking-tight">
              Investigation
            </h1>
            {!protectedCase && run && (
              <InvestigationMonitoring
                run={run}
                runs={d.runs}
                canCollect={canStart}
                onSelect={setSelectedRunId}
              />
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded border border-border px-2 py-1 text-xs ${collectionFailed || retryAgent ? "text-red-400" : activeCollection || activeAgent || agent?.pending ? "text-amber-300" : agent?.status === "Complete" ? "text-emerald-400" : "text-muted-foreground"}`}
              data-testid="investigation-stage"
            >
              {status}
            </span>
            <p className="text-sm text-muted-foreground">
              {incident.incident?.title}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <Button
            asChild
            className="!h-8 bg-white !px-3 !text-sm text-black hover:bg-neutral-200"
          >
            <Link
              aria-label="Return to Dashboard"
              href={`${incidentBase(a.organizationId, a.incidentId)}/overview`}
            >
              Return to Dashboard <span aria-hidden="true">→</span>
            </Link>
          </Button>
          {decisions.some((p) => p.status === "Accepted") && (
            <span className="text-xs text-muted-foreground">
              Reviewed results are reflected in the incident
            </span>
          )}
          {!protectedCase &&
            collectionFailed &&
            !run?.previousRunId &&
            canStart && (
              <Button
                size="sm"
                className="!h-8 !px-3 !text-sm"
                variant="outline"
                onClick={() => setSourcesOpen(true)}
              >
                Retry collection
              </Button>
            )}
        </div>
      </header>
      {protectedCase ? (
        <section className="border-y border-border py-8">
          <h2 className="text-lg font-medium">Established case</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            IR-2041 retains its reference evidence, assessments and response
            history. Automated collection and investigation are disabled.
          </p>
          <Link
            href={`${incidentBase(a.organizationId, a.incidentId)}/scope`}
            className="mt-4 inline-block text-sm underline"
          >
            Explore Context Graph
          </Link>
        </section>
      ) : !run ? (
        <InvestigationEvidence
          run={undefined}
          sources={[]}
          canCollect={canStart}
          observations={[]}
        />
      ) : (
        <>
          {(run.collectionStatus === "Complete" || agent) && (
            <div
              aria-label="Investigation summary"
              className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
            >
              <span>
                <strong className="font-medium text-foreground">
                  {run.analyzedSources}
                </strong>{" "}
                sources
              </span>
              <span>
                <strong className="font-medium text-foreground">
                  {entries}
                </strong>{" "}
                collected entries
              </span>
              <span title="Deterministic checks identified these evidence leads. They are not confirmed threats or reviewed findings.">
                <strong className="font-medium text-foreground">
                  {run.observationCount ?? observationPage?.total ?? 0}
                </strong>{" "}
                evidence leads
              </span>
              {!!agent?.pending && (
                <span className="text-amber-300">
                  {agent.pending} awaiting review
                </span>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mb-4 text-sm text-amber-300">
              {error}
            </p>
          )}
          {(run.error || agent?.error) && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center gap-3 text-sm"
            >
              <span className="text-red-400">
                {run.error
                  ? "Collection did not finish."
                  : "AI analysis did not produce a valid result."}
              </span>
              <span className="text-muted-foreground">
                Collected snapshots and comparisons are saved.
              </span>
              {retryAgent && canStart && !canCollectNext && (
                <Button
                  className="!h-8 !px-3 !text-sm"
                  variant="outline"
                  disabled={busy || run.id !== d.run?.id}
                  onClick={launch}
                >
                  Retry analysis
                </Button>
              )}
            </div>
          )}
          {(activeCollection || activeAgent) && (
            <div
              role="status"
              className="mb-5 flex items-center justify-between gap-4 text-sm text-muted-foreground"
            >
              <span>
                {activeCollection
                  ? `Collecting and processing evidence · ${run.completedSnapshots} / ${run.expectedSnapshots} snapshots registered`
                  : "Agent investigation running. Collected evidence remains available."}
              </span>
              {canStart && (
                <Button
                  size="sm"
                  className="!h-8 !px-3 !text-sm"
                  variant="outline"
                  onClick={() =>
                    cancel(activeCollection ? "cancel" : "agent.cancel")
                  }
                >
                  {activeCollection
                    ? "Cancel collection"
                    : "Cancel investigation"}
                </Button>
              )}
            </div>
          )}
          <section aria-label="Investigation review">
            <div
              className={`grid items-start gap-8 ${!analysisComplete && (observations.length || candidates.length) ? "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}
            >
              <div>
                {(needsReview.length > 0 || visibleDimension) && (
                  <div className="mb-4 flex items-center justify-between">
                    {needsReview.length > 0 && (
                      <h2 className="flex items-center gap-2 text-lg font-semibold">
                        Needs Review
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-red-400 text-xs font-semibold tabular-nums text-black">
                          {needsReview.length}
                        </span>
                      </h2>
                    )}
                    {visibleDimension && (
                      <button
                        className="text-xs underline"
                        onClick={() => setDimension(undefined)}
                      >
                        Clear {dimensionLabels[visibleDimension]} filter
                      </button>
                    )}
                  </div>
                )}
                {needsReview.length > 0 && (
                  <ProposalRows rows={needsReview} onSelect={setSelected} />
                )}
                {!needsReview.length &&
                  (collectionFailed ||
                    (agent?.status === "Complete" && !rows.length)) && (
                    <section
                      className="pl-5"
                      aria-label="Next investigation step"
                    >
                      <h2 className="text-base font-semibold">
                        {collectionFailed
                          ? "Collection incomplete"
                          : "No proposals to review"}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {collectionFailed
                          ? "Inspect preserved sources below and retry collection. Earlier evidence and decisions are retained."
                          : "No reviewable proposals were produced for this run. This does not establish that the source is safe."}
                      </p>
                    </section>
                  )}
                {decisions.some((p) => p.status === "Accepted") && (
                  <section
                    className="mt-6"
                    aria-label="Applied investigation changes"
                  >
                    <h2 className="mb-3 text-base font-semibold">
                      Applied to incident
                    </h2>
                    <div className="space-y-3">
                      {decisions
                        .filter((p) => p.status === "Accepted")
                        .map((p) => (
                          <div key={p.id} className="py-3">
                            <InvestigationChanges
                              content={
                                JSON.parse(p.content) as InvestigationProposal
                              }
                              findingId={p.findingId}
                              relationshipId={p.relationshipId}
                            />
                            <button
                              className="mt-2 text-xs text-muted-foreground underline"
                              onClick={() => setSelected(p.id)}
                            >
                              View decision
                            </button>
                          </div>
                        ))}
                    </div>
                  </section>
                )}
                {decisions.length > 0 && (
                  <details className="mt-5">
                    <summary className="text-sm text-muted-foreground">
                      Decision history · {decisions.length}
                    </summary>
                    <div className="mt-3">
                      <ProposalRows rows={decisions} onSelect={setSelected} />
                    </div>
                  </details>
                )}
                {!analysisComplete &&
                  (observations.length > 0 ||
                    (run.deterministicStatus === "Complete" && !canRead)) && (
                    <section className="mt-8">
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-base font-semibold">
                          Observed evidence
                        </h2>
                        <span className="text-xs text-muted-foreground">
                          Deterministic · Unverified source
                        </span>
                      </div>
                      <div className="space-y-3">
                        {shownObservations.map((o) => (
                          <button
                            key={o.id}
                            className="group w-full rounded-md py-3 text-left hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={() => setObservationId(o.id)}
                          >
                            <span>
                              <span className="text-sm font-medium underline-offset-4 group-hover:underline group-focus-visible:underline">
                                {observationTitle(o)}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {sourceName(o.sourceId)} · {o.key}
                              </span>
                            </span>
                          </button>
                        ))}
                        {!shownObservations.length && (
                          <p className="py-5 text-sm text-muted-foreground">
                            {run && !canRead
                              ? "Current evidence and record permissions are required to inspect observations."
                              : "No observations available in this view."}
                          </p>
                        )}
                      </div>
                      {observationPage && observationPage.total > 25 && (
                        <div className="mt-3 flex items-center gap-3">
                          <Button
                            size="sm"
                            className="!h-8 !px-3 !text-sm"
                            variant="outline"
                            disabled={!offset}
                            onClick={() => setOffset((v) => v - 25)}
                          >
                            Previous observations
                          </Button>
                          <Button
                            size="sm"
                            className="!h-8 !px-3 !text-sm"
                            variant="outline"
                            disabled={offset + 25 >= observationPage.total}
                            onClick={() => setOffset((v) => v + 25)}
                          >
                            Next observations
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {offset + 1}–
                            {Math.min(offset + 25, observationPage.total)} of{" "}
                            {observationPage.total}
                          </span>
                        </div>
                      )}
                    </section>
                  )}
              </div>
              {!analysisComplete &&
                (observations.length > 0 || candidates.length > 0) && (
                  <aside className="min-w-0 pl-5">
                    <h2 className="text-base font-semibold">
                      Potential Impact
                    </h2>
                    <p className="mb-5 mt-2 text-xs leading-5 text-muted-foreground">
                      Impact leads from the observations. They are not confirmed
                      assessments.
                    </p>
                    {(Object.keys(dimensionLabels) as ImpactDimension[]).map(
                      (dim) => {
                        const count = candidates.filter(
                            (p) =>
                              (JSON.parse(p.content) as { dimension: string })
                                .dimension === dim,
                          ).length,
                          observed = observations.filter(
                            (o) => observationDimension(o) === dim,
                          ).length;
                        if (!count && !observed) return null;
                        return (
                          <button
                            key={dim}
                            onClick={() => setDimension(dim)}
                            className={`mb-2 flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm ${dimension === dim ? "text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}
                          >
                            <span>{dimensionLabels[dim]}</span>
                            <span className="text-xs text-muted-foreground">
                              {count || observed}{" "}
                              {count ? "review item" : "lead"}
                              {(count || observed) !== 1 ? "s" : ""}
                            </span>
                          </button>
                        );
                      },
                    )}
                    <p className="mt-5 text-xs leading-5 text-muted-foreground">
                      Encryption: Not assessed. Current P0 sources provide no
                      usable encryption indicators. Other unsupported impacts
                      remain unknown.
                    </p>
                  </aside>
                )}
            </div>
          </section>
          {!analysisComplete && (
            <details
              className="mt-7 py-3"
              open={sourcesOpen}
              onToggle={(e) => setSourcesOpen(e.currentTarget.open)}
              data-testid="source-details"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Source snapshots and comparisons{" "}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Original evidence and record differences
                </span>
              </summary>
              <div className="mt-5">
                <InvestigationEvidence
                  run={run}
                  sources={currentSources}
                  canCollect={canStart}
                  observations={observations}
                />
              </div>
            </details>
          )}
        </>
      )}
      <ProposalReviewDialog
        proposal={rows.find((p) => p.id === selected)}
        onClose={() => setSelected(undefined)}
        onReviewed={() => setRefresh((v) => v + 1)}
      />
      <ObservationDialog
        observation={observations.find((o) => o.id === observationId)}
        onClose={() => setObservationId(undefined)}
      />
    </>
  );
}
