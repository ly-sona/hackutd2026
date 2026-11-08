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
const views = ["Findings", "Evidence", "Activity"] as const;
type View = (typeof views)[number];
export function InvestigationWorkspace() {
  const a = useAccess(),
    incident = useIncident(),
    d = useInvestigationData();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const run = d.runs.find((r) => r.id === selectedRunId) ?? d.run,
    agent = d.agents.find((j) => j.collectionRunId === run?.id);
  const [view, setView] = useState<View>("Findings"),
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
  const filter = (p: (typeof rows)[number]) => {
    const c = JSON.parse(p.content) as InvestigationProposal;
    return !dimension || (isImpact(c) && c.dimension === dimension);
  };
  const needsReview = rows.filter((p) => p.status === "Pending" && filter(p)),
    decisions = rows.filter((p) => p.status !== "Pending" && filter(p));
  const shownObservations = observations.filter(
    (o) => !dimension || observationDimension(o) === dimension,
  );
  const currentSources = (
      d.historicalSources.filter((s) => s.runId === runId).length
        ? d.historicalSources.filter((s) => s.runId === runId)
        : d.sources
    ).filter((s) => run && JSON.parse(run.sourceIds).includes(s.id)),
    entries = currentSources.reduce((n, s) => n + (s.recordCount ?? 0), 0);
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
  async function assess() {
    if (!agent) return;
    setBusy(true);
    setError("");
    try {
      await api("investigation", {
        action: "agent.assess",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        agentRunId: agent.id,
      });
      setRefresh((v) => v + 1);
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
        <div>
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            {a.incidentId} / INVESTIGATION
          </p>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">
              Investigation
            </h1>
            <span
              className={`rounded border border-border px-2 py-1 text-xs ${status === "Needs review" ? "text-amber-300" : "text-muted-foreground"}`}
              data-testid="investigation-stage"
            >
              {status}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {incident.incident?.title}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            aria-label="Back to incident dashboard"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            href={`${incidentBase(a.organizationId, a.incidentId)}/overview`}
          >
            Back to Dashboard
          </Link>
          {!protectedCase &&
            canStart &&
            view !== "Evidence" &&
            (!run ||
              ["Failed", "Canceled", "Revoked"].includes(run.status)) && (
              <Button onClick={() => setView("Evidence")}>
                Collect sources
              </Button>
            )}
          {!protectedCase &&
            canStart &&
            run?.deterministicStatus === "Complete" &&
            (!agent || retryAgent) && (
              <Button disabled={busy || run.id !== d.run?.id} onClick={launch}>
                {retryAgent ? "Retry investigation" : "Run Investigation"}
              </Button>
            )}
        </div>
      </header>
      {!protectedCase && run && (
        <InvestigationMonitoring
          run={run}
          runs={d.runs}
          canCollect={canStart}
          onSelect={setSelectedRunId}
        />
      )}
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
      ) : (
        <>
          <div
            className="mb-6 grid grid-cols-5 divide-x divide-border border-y border-border py-5"
            aria-label="Investigation summary"
          >
            {[
              [
                "Sources analyzed",
                run ? String(run.analyzedSources) : "—",
                "Deterministic processing",
              ],
              [
                "Entries examined",
                run ? String(entries) : "—",
                "Collected records / events",
              ],
              [
                "Observations",
                run
                  ? String(run.observationCount ?? observationPage?.total ?? 0)
                  : "—",
                "Evidence leads, not confirmed threats",
              ],
              [
                "Awaiting review",
                agent ? String(agent.pending) : "—",
                "Finding and impact proposals",
              ],
              [
                "Assessed entities",
                proposalPage ? String(proposalPage.assessedEntities) : "—",
                "Existing Scope assessments",
              ],
            ].map(([label, value, note], i) => (
              <div key={label} className={i ? "pl-5" : "pr-5"}>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-sm">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </div>
            ))}
          </div>
          <p className="mb-5 text-xs text-muted-foreground">
            Counts describe collected export coverage, not the entire
            organization or confirmed affected records. Analyzed content is not
            verified safe.
          </p>
          <div
            role="tablist"
            aria-label="Investigation views"
            className="mb-6 flex gap-7 border-b border-border"
          >
            {views.map((v) => (
              <button
                key={v}
                id={`investigation-tab-${v}`}
                role="tab"
                aria-selected={view === v}
                aria-controls={`investigation-panel-${v}`}
                className={`border-b-2 pb-3 text-sm ${view === v ? "border-white text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setView(v)}
              >
                {v}
                {v === "Findings" && !!agent?.pending && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                    {agent.pending}
                  </span>
                )}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mb-4 text-sm text-amber-300">
              {error}
            </p>
          )}
          <section
            hidden={view !== "Findings"}
            id="investigation-panel-Findings"
            role="tabpanel"
            aria-labelledby="investigation-tab-Findings"
          >
            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Needs Review{" "}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {needsReview.length}
                    </span>
                  </h2>
                  {dimension && (
                    <button
                      className="text-xs underline"
                      onClick={() => setDimension(undefined)}
                    >
                      Clear {dimensionLabels[dimension]} filter
                    </button>
                  )}
                </div>
                {needsReview.length ? (
                  <ProposalRows rows={needsReview} onSelect={setSelected} />
                ) : (
                  <div className="border-y border-border py-8">
                    <p className="text-sm">
                      {!run
                        ? "Start with evidence from your registered sources."
                        : activeAgent
                          ? "The agent is inspecting evidence. Deterministic observations remain available below."
                          : rows.length
                            ? "No pending reviews in this view."
                            : "No proposals require review yet."}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {!run
                        ? "Select connectors in Evidence to collect the first snapshots."
                        : "Observations describe source evidence; accepted findings and human-reviewed assessments are separate."}
                    </p>
                    {!run && canStart && (
                      <Button
                        className="mt-4"
                        variant="outline"
                        onClick={() => setView("Evidence")}
                      >
                        Choose evidence sources
                      </Button>
                    )}
                  </div>
                )}
                {decisions.length > 0 && (
                  <details className="mt-5">
                    <summary className="text-sm text-muted-foreground">
                      Reviewed decisions · {decisions.length}
                    </summary>
                    <div className="mt-3">
                      <ProposalRows rows={decisions} onSelect={setSelected} />
                    </div>
                  </details>
                )}
                <section className="mt-8">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">
                      Observed evidence
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Deterministic · Unverified source
                    </span>
                  </div>
                  <div className="divide-y divide-border border-y border-border">
                    {shownObservations.map((o) => (
                      <button
                        key={o.id}
                        className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-muted/20"
                        onClick={() => setObservationId(o.id)}
                      >
                        <span>
                          <span className="text-sm font-medium">
                            {observationTitle(o)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {sourceName(o.sourceId)} · {o.key}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Inspect evidence →
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
                        variant="outline"
                        disabled={!offset}
                        onClick={() => setOffset((v) => v - 25)}
                      >
                        Previous observations
                      </Button>
                      <Button
                        size="sm"
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
              </div>
              <aside className="border-l border-border pl-6">
                <h2 className="text-base font-semibold">Potential Impact</h2>
                <p className="mb-5 mt-2 text-xs leading-5 text-muted-foreground">
                  Evidence-backed review leads. Dimensions remain independent;
                  Scope owns authoritative assessments.
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
                        className={`mb-3 flex w-full items-center justify-between gap-3 text-left text-sm ${dimension === dim ? "text-amber-300" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <span>{dimensionLabels[dim]}</span>
                        <span className="text-xs">
                          {count || observed} {count ? "review item" : "lead"}
                          {(count || observed) !== 1 ? "s" : ""}
                        </span>
                      </button>
                    );
                  },
                )}
                <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                  Encryption: Not assessed. Current P0 sources provide no usable
                  encryption indicators. Other unsupported impacts remain
                  unknown.
                </p>
                {agent && canStart && !proposalPage?.impactPrepared && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={busy}
                    onClick={assess}
                  >
                    Assess potential impact
                  </Button>
                )}
                <Link
                  href={`${incidentBase(a.organizationId, a.incidentId)}/scope`}
                  className="mt-5 block text-sm underline underline-offset-4"
                >
                  Open authoritative Scope →
                </Link>
              </aside>
            </div>
          </section>
          <section
            hidden={view !== "Evidence"}
            id="investigation-panel-Evidence"
            role="tabpanel"
            aria-labelledby="investigation-tab-Evidence"
          >
            <InvestigationEvidence
              run={run}
              sources={currentSources}
              canCollect={canStart}
              observations={observations}
            />
          </section>
          <section
            hidden={view !== "Activity"}
            id="investigation-panel-Activity"
            role="tabpanel"
            aria-labelledby="investigation-tab-Activity"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Investigation activity
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Persisted milestones and completed actions.
                </p>
              </div>
              <div className="flex gap-3">
                {activeCollection && canStart && (
                  <Button variant="outline" onClick={() => cancel("cancel")}>
                    Cancel collection
                  </Button>
                )}
                {activeAgent && canStart && (
                  <Button
                    variant="outline"
                    onClick={() => cancel("agent.cancel")}
                  >
                    Cancel investigation
                  </Button>
                )}
              </div>
            </div>
            <dl
              role="region"
              aria-label="Processing milestones"
              className="divide-y divide-border border-y border-border"
            >
              {[
                [
                  "Collection",
                  run?.collectionStatus ?? "Not started",
                  run
                    ? `${run.completedSnapshots} / ${run.expectedSnapshots} snapshots registered`
                    : "Select sources in Evidence",
                ],
                [
                  "Deterministic analysis",
                  run?.deterministicStatus ?? "Not started",
                  run
                    ? `${run.analyzedSources} sources analyzed`
                    : "Awaiting source collection",
                ],
                [
                  "Agent investigation",
                  agent?.status ?? "Not started",
                  agent
                    ? `${agent.model || "Model awaiting execution"} · ${agent.requests} requests · ${agent.toolCount} completed tools`
                    : "One bounded investigation; no authoritative writes",
                ],
                [
                  "Human review",
                  agent ? `${agent.pending} pending` : "Not started",
                  `${rows.filter((r) => r.status === "Accepted").length} accepted · ${rows.filter((r) => r.status === "Rejected").length} rejected`,
                ],
              ].map(([label, status, note]) => (
                <div
                  key={label}
                  className="grid grid-cols-[220px_180px_minmax(0,1fr)] gap-5 py-4 text-sm"
                >
                  <dt className="font-medium">{label}</dt>
                  <dd
                    data-testid={
                      label === "Collection"
                        ? "run-status"
                        : label === "Agent investigation"
                          ? "agent-status"
                          : undefined
                    }
                  >
                    {status}
                  </dd>
                  <dd className="text-muted-foreground">{note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Browser closure and natural session expiry do not stop authorized
              background work. Revocation and cancellation block publication.
            </p>
            {(run?.error || agent?.error) && (
              <p role="alert" className="mt-4 text-sm text-amber-300">
                {run?.error || agent?.error}{" "}
                {retryAgent && canStart && (
                  <button onClick={launch} className="ml-2 underline">
                    Retry with fresh authorization
                  </button>
                )}
              </p>
            )}
            <h3 className="mb-3 mt-7 text-base font-medium">
              Completed tool calls
            </h3>
            {proposalPage?.trace.length ? (
              proposalPage.trace.map((t, index) => (
                <details
                  key={t.callId}
                  className="border-b border-border py-3 text-sm"
                >
                  <summary>
                    {index + 1}. {t.name.replace(/_/g, " ")}
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                    {JSON.stringify(
                      { callId: t.callId, arguments: t.args },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No completed model tool calls.
              </p>
            )}
            <details className="mt-6 text-sm text-muted-foreground">
              <summary>Run and source metadata</summary>
              <pre className="mt-3 whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(
                  { collection: run, agent, sources: d.sources },
                  null,
                  2,
                )}
              </pre>
            </details>
          </section>
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
