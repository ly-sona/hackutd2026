"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { connectors, type Change } from "../../shared/investigation";
import { useAccess } from "./workspace-provider";
import { useInvestigationData } from "./investigation-data";
import { useIncident } from "./incident-data";
import { EvidenceButton } from "./evidence-panel";
import { incidentBase } from "@/lib/roles";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface Observation {
  id: string;
  sourceId: string;
  key: string;
  rule: string;
  description: string;
  provenance: string;
  ruleVersion: string;
}
interface ObservationPage {
  rows: Observation[];
  total: number;
}
interface DifferencePage {
  rows: Change[];
  total: number;
  coverage: string;
  snapshots: { id: string; evidenceId: string; role: string }[];
}
export function InvestigationWorkspace() {
  const a = useAccess(),
    d = useInvestigationData(),
    incident = useIncident();
  const [selected, setSelected] = useState<string[]>([
    "customers",
    "identity",
    "network",
    "services",
  ]);
  const [useBaseline, setUseBaseline] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [observations, setObservations] = useState<ObservationPage>(),
    [offset, setOffset] = useState(0);
  const [differences, setDifferences] = useState<DifferencePage>(),
    [sourceId, setSourceId] = useState(""),
    [differenceOffset, setDifferenceOffset] = useState(0);
  const operation = useRef<string | undefined>(undefined);
  const canStart = [
    "evidence:upload",
    "evidence:view",
    "scope:edit",
    "scope:records",
  ].every(a.can);
  const canDetails = a.can("evidence:view") && a.can("scope:records");
  const run = d.run;
  const runId = run?.id,
    runUpdatedAt = run?.updatedAt;
  const readReady = !!run && run.collectionStatus === "Complete";
  useEffect(() => {
    if (!runId || !canDetails || !readReady) return;
    let active = true;
    api<ObservationPage>("investigation", {
      action: "read",
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      kind: "observations",
      runId,
      offset,
      limit: 25,
    })
      .then((r) => {
        if (active) setObservations(r);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [
    runId,
    runUpdatedAt,
    canDetails,
    readReady,
    offset,
    a.organizationId,
    a.incidentId,
  ]);
  async function start() {
    setBusy(true);
    setError("");
    operation.current ??= crypto.randomUUID();
    try {
      await api("investigation", {
        action: "start",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        connectorIds: selected,
        useBaseline,
        operationId: operation.current,
      });
      operation.current = undefined;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(id: string, pageOffset = 0) {
    if (!run) return;
    setError("");
    try {
      const result = await api<DifferencePage>("investigation", {
        action: "read",
        kind: "differences",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        runId: run.id,
        sourceId: id,
        offset: pageOffset,
        limit: 25,
      });
      setDifferences(result);
      setSourceId(id);
      setDifferenceOffset(pageOffset);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function sourceProgress(connectorId: string) {
    const source = d.sources.find(
      (source) => source.connectorId === connectorId,
    );
    if (!source) return "Available · baseline + initial snapshot";
    return `${source.status} · ${source.collectedSnapshots ?? 0} snapshots${source.recordCount !== undefined ? ` · ${source.recordCount} observed records` : ""}`;
  }
  if (!d.ready) return <p role="status">Loading Investigation…</p>;
  const protectedCase = d.metadata?.mode === "reference";
  const active =
    run && ["Queued", "Collecting", "Analyzing"].includes(run.status);
  const retryable =
    run && ["Failed", "Revoked", "Canceled"].includes(run.status);
  return (
    <>
      <Link
        href={`${incidentBase(a.organizationId, a.incidentId)}/overview`}
        className="text-sm underline underline-offset-4"
      >
        ← Back to incident dashboard
      </Link>
      <header className="my-7">
        <p className="font-mono text-xs text-muted-foreground">
          {a.incidentId} / INVESTIGATION
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Investigation</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {incident.incident?.description}
        </p>
      </header>
      {protectedCase ? (
        <p className="rounded-lg border border-border p-5">
          Established Case · Automated ingestion is disabled. Existing evidence,
          findings and response workflows remain available on the incident
          dashboard.
        </p>
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            Simulated connectors · Synthetic data · Original bytes preserved
            privately
          </p>
          <section className="rounded-lg border border-border p-5">
            <h2 className="text-lg font-semibold">Investigation sources</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connectors collect versioned plain-text snapshots. Source trust
              and compromise remain unverified.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {connectors.map((c) => (
                <label
                  key={c.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    aria-label={c.name}
                    disabled={
                      !c.implemented ||
                      !canStart ||
                      !!active ||
                      run?.status === "Complete"
                    }
                    checked={
                      run && !retryable
                        ? (JSON.parse(run.sourceIds) as string[]).some((id) =>
                            id.endsWith(`:source:${c.id}`),
                          )
                        : selected.includes(c.id)
                    }
                    onChange={(e) => {
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, c.id]
                          : old.filter((id) => id !== c.id),
                      );
                      operation.current = undefined;
                    }}
                    className="mt-1"
                  />
                  <span>
                    {c.name}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.priority} ·{" "}
                      {c.implemented
                        ? sourceProgress(c.id)
                        : "Planned / Unavailable"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={
                  run && !retryable
                    ? run.expectedSnapshots > JSON.parse(run.sourceIds).length
                    : useBaseline
                }
                disabled={!canStart || !!active || run?.status === "Complete"}
                onChange={(e) => {
                  setUseBaseline(e.target.checked);
                  operation.current = undefined;
                }}
              />
              Compare with the supplied synthetic baseline (provenance
              unverified)
            </label>
            {!canStart && (
              <p className="mt-4 text-sm text-muted-foreground">
                Collection requires an assigned Commander or Analyst with
                evidence upload, scope editing and record access. Your existing
                permissions are unchanged.
              </p>
            )}
            {d.metadata?.scenario === "hr" && (
              <p className="mt-4 text-amber-300 text-sm">
                This secondary scenario requires planned HR and Payroll
                connectors. These connectors are not available yet.
              </p>
            )}
            {canStart && (!run || retryable) && (
              <Button
                className="mt-5"
                disabled={
                  busy || !selected.length || d.metadata?.scenario === "hr"
                }
                onClick={start}
              >
                {busy
                  ? "Submitting…"
                  : retryable
                    ? "Retry with fresh authorization"
                    : "Start analysis"}
              </Button>
            )}
          </section>
          {error && (
            <p role="alert" className="my-4 text-sm text-red-400">
              {error}
            </p>
          )}
          {run && (
            <section
              className="my-6 rounded-lg border border-border p-5"
              aria-label="Processing milestones"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Processing milestones</h2>
                <Badge variant="outline" data-testid="run-status">
                  {run.status}
                </Badge>
              </div>
              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm">Collection</dt>
                  <dd className="mt-2 text-sm text-muted-foreground">
                    {run.collectionStatus} · {run.completedSnapshots} /{" "}
                    {run.expectedSnapshots} snapshots
                  </dd>
                </div>
                <div>
                  <dt className="text-sm">Deterministic analysis</dt>
                  <dd className="mt-2 text-sm text-muted-foreground">
                    {run.deterministicStatus} · {run.analyzedSources} /{" "}
                    {JSON.parse(run.sourceIds).length} sources
                  </dd>
                </div>
                <div>
                  <dt className="text-sm">Agent investigation</dt>
                  <dd className="mt-2 text-sm text-muted-foreground">
                    Not configured · Deterministic results remain available
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Work continues without an open browser or active initiating
                session. Explicit access revocation blocks further publication.
                No automatic findings or impact confirmations.
              </p>
              {run.error && (
                <p role="alert" className="mt-4 text-sm text-amber-300">
                  {run.error}
                </p>
              )}
              {active && canStart && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={async () => {
                    try {
                      await api("investigation", {
                        action: "cancel",
                        organizationId: a.organizationId,
                        incidentId: a.incidentId,
                        runId: run.id,
                      });
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Cancel investigation
                </Button>
              )}
            </section>
          )}
          {canDetails && readReady && (
            <section className="my-6 rounded-lg border border-border p-5">
              <h2 className="text-lg font-semibold">Source comparisons</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Missing export entries are not confirmed deletions. Unchanged
                content is not proof of safety. Counts refer to these staged
                snapshots.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {d.sources
                  .filter(
                    (s) => run && JSON.parse(run.sourceIds).includes(s.id),
                  )
                  .map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
                      variant="outline"
                      onClick={() => inspect(s.id)}
                    >
                      {connectors.find((c) => c.id === s.connectorId)?.name}
                    </Button>
                  ))}
              </div>
              {differences && (
                <div className="mt-5" data-testid="source-differences">
                  <p className="mb-3 text-sm">
                    {differences.total} compared keys · {differences.coverage}{" "}
                    export
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {differences.snapshots.map((s) => {
                      const e = incident.evidence.find(
                        (e) => e.id === s.evidenceId,
                      );
                      return e ? (
                        <EvidenceButton key={s.id} evidence={e} />
                      ) : null;
                    })}
                  </div>
                  {differences.rows.map((row) => (
                    <details
                      key={row.key}
                      className="border-t border-border py-3 text-sm"
                    >
                      <summary>
                        {row.key} · {row.kind}{" "}
                        {row.fields.length ? `· ${row.fields.join(", ")}` : ""}
                      </summary>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                        {JSON.stringify(
                          {
                            before:
                              row.before ??
                              (row.kind === "uncompared"
                                ? "No baseline available"
                                : "Not present in baseline"),
                            after:
                              row.after ??
                              "Absent from export; deletion unverified",
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                  <div className="mt-3 flex gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={differenceOffset === 0}
                      onClick={() => inspect(sourceId, differenceOffset - 25)}
                    >
                      Previous records
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={differenceOffset + 25 >= differences.total}
                      onClick={() => inspect(sourceId, differenceOffset + 25)}
                    >
                      Next records
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
          {canDetails && observations && (
            <section className="my-6 rounded-lg border border-border p-5">
              <h2 className="text-lg font-semibold">
                Deterministic observations
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {observations.total} observations · Leads for human
                investigation, not authoritative findings or confirmed impact.
              </p>
              {!observations.total &&
                run?.deterministicStatus === "Complete" && (
                  <p className="mt-4 text-sm">
                    No anomalies detected by the applicable rules on the
                    available evidence. This does not establish safety.
                  </p>
                )}
              {observations.rows.map((o) => (
                <details
                  key={o.id}
                  className="mt-4 border-t border-border pt-3 text-sm"
                >
                  <summary>
                    {o.key} · {o.rule}
                  </summary>
                  <p className="my-3 text-muted-foreground">{o.description}</p>
                  <p className="text-xs">
                    Observation {o.id} · {o.ruleVersion}
                  </p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                    {JSON.stringify(JSON.parse(o.provenance), null, 2)}
                  </pre>
                </details>
              ))}
              <div className="mt-4 flex gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset((v) => v - 25)}
                >
                  Previous observations
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + 25 >= observations.total}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next observations
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
