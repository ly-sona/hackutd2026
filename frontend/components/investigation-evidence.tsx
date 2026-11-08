"use client";
import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { EvidenceButton } from "./evidence-panel";
import { Button } from "./ui/button";
import { fieldLabel } from "./agent-investigation-panel";
import {
  connectors,
  type Change,
  type InvestigationRun,
  type InvestigationSource,
} from "../../shared/investigation";
import { observationLabels } from "../../shared/investigation-impact";
import type { AgentObservation } from "../../shared/agent-investigation";
export interface DifferencePage {
  rows: Change[];
  total: number;
  counts: Record<string, number>;
  coverage: string;
  snapshots: {
    id: string;
    evidenceId: string;
    role: string;
    collectedAt: string;
  }[];
}
export function InvestigationEvidence({
  run,
  sources,
  canCollect,
  observations,
}: {
  run: InvestigationRun | undefined;
  sources: InvestigationSource[];
  canCollect: boolean;
  observations: AgentObservation[];
}) {
  const a = useAccess(),
    incident = useIncident(),
    [selected, setSelected] = useState([
      "customers",
      "identity",
      "network",
      "services",
    ]),
    [baseline, setBaseline] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [loaded, setLoaded] = useState<{
      sourceId: string;
      page: DifferencePage;
      offset: number;
      runId: string;
    }>(),
    operation = useRef<string | undefined>(undefined);
  const canRead = a.can("evidence:view") && a.can("scope:records"),
    active = run && ["Queued", "Collecting", "Analyzing"].includes(run.status),
    retry = run && ["Failed", "Canceled", "Revoked"].includes(run.status);
  async function start() {
    operation.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      await api("investigation", {
        action: "start",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        connectorIds: selected,
        useBaseline: baseline,
        autoInvestigate: true,
        operationId: operation.current,
      });
      operation.current = undefined;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(sourceId: string, offset = 0) {
    if (!run) return;
    try {
      const page = await api<DifferencePage>("investigation", {
        action: "read",
        kind: "differences",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        runId: run.id,
        sourceId,
        offset,
        limit: 25,
      });
      setLoaded({ sourceId, page, offset, runId: run.id });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selection = canRead && loaded?.runId === run?.id ? loaded : undefined;
  const collected = sources.filter(
    (s) => run && JSON.parse(run.sourceIds).includes(s.id),
  );
  return (
    <section aria-label="Investigation evidence">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">
          {!run || (retry && !run.previousRunId)
            ? "Connect evidence sources"
            : "Evidence sources"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {!run || (retry && !run.previousRunId)
            ? "Choose sources, then start. Connectors collect and compare snapshots, and the agent investigates automatically. You review the results."
            : "Preserved source snapshots and computed comparisons. Source trust remains unverified."}
        </p>
      </div>
      {!run || (retry && !run.previousRunId) ? (
        <>
          <div className="space-y-2">
            {connectors
              .filter((c) => c.implemented)
              .map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between gap-5 rounded-lg bg-muted/20 px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={c.name}
                      checked={selected.includes(c.id)}
                      disabled={!canCollect || busy}
                      onChange={(e) => {
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, c.id]
                            : old.filter((id) => id !== c.id),
                        );
                        operation.current = undefined;
                      }}
                    />
                    <span className="text-sm font-medium">{c.name}</span>
                  </span>
                </label>
              ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-6">
            <fieldset className="text-sm text-muted-foreground">
              <legend className="mb-2 font-medium">Check for changes</legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-describedby="baseline-comparison-note"
                  checked={baseline}
                  onChange={(e) => {
                    setBaseline(e.target.checked);
                    operation.current = undefined;
                  }}
                  disabled={!canCollect || busy}
                />
                Compare with an earlier copy to find changes
              </label>
              <p id="baseline-comparison-note" className="mt-2 text-xs">
                The earlier copy has not been checked independently.
              </p>
            </fieldset>
            <Button
              className="!h-8 !px-3 !text-sm"
              disabled={!canCollect || busy || !selected.length}
              onClick={start}
            >
              {busy
                ? "Submitting…"
                : retry
                  ? "Retry collection"
                  : "Start investigation"}
            </Button>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="pb-3 font-normal">Source</th>
                <th className="pb-3 font-normal">Status</th>
                <th className="pb-3 font-normal">Snapshots</th>
                <th className="pb-3 font-normal">Observed entries</th>
                <th className="pb-3 font-normal">Comparison</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {collected.map((s) => (
                <tr
                  key={s.id}
                  className={s.id === selection?.sourceId ? "bg-muted/25" : ""}
                >
                  <td className="py-4">
                    <button
                      className="font-medium underline-offset-4 hover:underline"
                      disabled={!canRead || run.collectionStatus !== "Complete"}
                      onClick={() => inspect(s.id)}
                    >
                      {connectors.find((c) => c.id === s.connectorId)?.name}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.snapshotTime
                        ? `Source-reported snapshot: ${new Date(s.snapshotTime).toLocaleString()}`
                        : "Snapshot awaiting collection"}
                    </p>
                  </td>
                  <td>{s.status}</td>
                  <td>{s.collectedSnapshots ?? 0}</td>
                  <td>{s.recordCount ?? "Awaiting collection"}</td>
                  <td>
                    {run.previousRunId
                      ? "Prior snapshot"
                      : run.expectedSnapshots > JSON.parse(run.sourceIds).length
                        ? "Supplied baseline"
                        : "No baseline"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!canCollect && !run && (
        <p className="mt-4 text-sm text-muted-foreground">
          Collection requires current evidence and Scope permissions.
        </p>
      )}
      {active && (
        <p className="mt-4 text-sm text-muted-foreground">
          Collection is running in the background. Persisted progress is
          available in Activity.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-amber-300">
          {error}
        </p>
      )}
      {selection && (
        <section
          className="mt-8 border-t border-border pt-6"
          aria-label="Source inspection"
          data-testid="source-differences"
        >
          <h3 className="text-base font-semibold">
            {
              connectors.find((c) =>
                selection.sourceId.endsWith(`:source:${c.id}`),
              )?.name
            }{" "}
            · Snapshot comparison
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {selection.page.coverage} export · {selection.page.total} compared
            keys. Missing entries do not prove deletion; unchanged content does
            not establish safety.
          </p>
          <div className="my-4 flex flex-wrap gap-5">
            {Object.entries(selection.page.counts ?? {}).map(
              ([kind, count]) => (
                <span key={kind} className="text-sm">
                  <strong className="font-semibold">{count}</strong>{" "}
                  <span className="text-muted-foreground">{kind}</span>
                </span>
              ),
            )}
          </div>
          <div className="mb-5 flex flex-wrap gap-5">
            {selection.page.snapshots.map((s) => {
              const e = incident.evidence.find((e) => e.id === s.evidenceId);
              return (
                <div key={s.id}>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {s.role === "baseline"
                      ? "Supplied baseline"
                      : "Collected snapshot"}{" "}
                    · {new Date(s.collectedAt).toLocaleString()}
                  </p>
                  {e && <EvidenceButton evidence={e} />}
                </div>
              );
            })}
          </div>
          <div className="divide-y divide-border border-y border-border">
            {selection.page.rows.map((row) => (
              <details key={row.key} className="py-3">
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{row.key}</span>{" "}
                  <span className="ml-3 text-muted-foreground">
                    {row.kind}
                    {row.fields.length
                      ? ` · ${row.fields.map(fieldLabel).join(", ")}`
                      : ""}
                  </span>
                </summary>
                <FieldDifferences row={row} />
              </details>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {selection.offset + 1}–
            {Math.min(selection.offset + 25, selection.page.total)} of{" "}
            {selection.page.total} keys.
          </p>
          <div className="mt-3 flex gap-3">
            <Button
              className="!h-8 !px-3 !text-sm"
              variant="outline"
              size="sm"
              disabled={!selection.offset}
              onClick={() => inspect(selection.sourceId, selection.offset - 25)}
            >
              Previous records
            </Button>
            <Button
              className="!h-8 !px-3 !text-sm"
              variant="outline"
              size="sm"
              disabled={selection.offset + 25 >= selection.page.total}
              onClick={() => inspect(selection.sourceId, selection.offset + 25)}
            >
              Next records
            </Button>
          </div>
          {observations.filter((o) => o.sourceId === selection.sourceId)
            .length > 0 && (
            <div className="mt-6">
              <h4 className="mb-3 text-sm font-medium">Related observations</h4>
              {observations
                .filter((o) => o.sourceId === selection.sourceId)
                .map((o) => (
                  <p key={o.id} className="mb-2 text-sm text-muted-foreground">
                    {observationLabels[o.rule] ?? "Source observation"} ·{" "}
                    {o.key}
                  </p>
                ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
function FieldDifferences({ row }: { row: Change }) {
  const fields = row.fields.length
    ? row.fields
    : Object.keys(row.after?.fields ?? row.before?.fields ?? {});
  return (
    <div className="mt-4 pl-4">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="w-1/4 pb-2 font-normal">Field</th>
            <th className="pb-2 font-normal">Baseline value</th>
            <th className="pb-2 font-normal">Collected value</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field} className="border-t border-border">
              <td className="py-2 align-top text-muted-foreground">
                {fieldLabel(field)}
              </td>
              <td className="break-words py-2 pr-4 align-top">
                {row.before
                  ? String(row.before.fields[field] ?? "Not supplied")
                  : row.kind === "uncompared"
                    ? "No baseline available"
                    : "Not in baseline"}
              </td>
              <td className="break-words py-2 align-top">
                {row.after
                  ? String(row.after.fields[field] ?? "Not supplied")
                  : "Not in collected export"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
