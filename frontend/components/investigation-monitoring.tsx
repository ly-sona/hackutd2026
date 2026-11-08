"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useAccess } from "./workspace-provider";
import { Button } from "./ui/button";
import type { InvestigationRun } from "../../shared/investigation";

interface Summary {
  revision: number;
  previousRunId: string;
  observations: number;
  sources: {
    sourceId: string;
    counts: Record<string, number>;
    coverage: string;
  }[];
  limitations: string;
}
export function InvestigationMonitoring({
  run,
  runs,
  canCollect,
  onSelect,
}: {
  run: InvestigationRun;
  runs: InvestigationRun[];
  canCollect: boolean;
  onSelect: (id: string | undefined) => void;
}) {
  const a = useAccess(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [summary, setSummary] = useState<Summary>(),
    operation = useRef<string | undefined>(undefined);
  const canRead = a.can("scope:records") && a.can("evidence:view"),
    org = a.organizationId,
    inc = a.incidentId;
  useEffect(() => {
    let active = true;
    if (!canRead) return;
    api<Summary>("investigation", {
      action: "read",
      kind: "monitoring",
      organizationId: org,
      incidentId: inc,
      runId: run.id,
    })
      .then((r) => {
        if (active) setSummary(r);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [run.id, run.updatedAt, canRead, org, inc]);
  async function collect() {
    setBusy(true);
    setError("");
    operation.current ??= crypto.randomUUID();
    try {
      await api("investigation", {
        action: "refresh",
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        runId: parent!.id,
        operationId: operation.current,
      });
      operation.current = undefined;
      onSelect(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const parent = runs.find((r) => r.status === "Complete");
  const available =
    !!parent &&
    (parent.revision ?? 1) < 2 &&
    !runs.some((r) => ["Queued", "Collecting", "Analyzing"].includes(r.status));
  return (
    <section
      aria-label="Snapshot monitoring"
      className="mb-6 border-y border-border py-4"
    >
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm">
          Snapshot history{" "}
          <select
            aria-label="Snapshot history"
            className="ml-3 border border-border bg-background px-2 py-1"
            value={run.id}
            onChange={(e) => onSelect(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                Revision {r.revision ?? 1} · {r.status} ·{" "}
                {new Date(Number(r.createdAt)).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </label>
        {canCollect && available && (
          <Button size="sm" disabled={busy} onClick={collect}>
            Collect next snapshot
          </Button>
        )}
      </div>
      {run.previousRunId && summary && (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-testid="reassessment-summary"
        >
          Compared with the preserved prior snapshot:{" "}
          {summary.sources.reduce((n, s) => n + (s.counts.added ?? 0), 0)}{" "}
          added,{" "}
          {summary.sources.reduce((n, s) => n + (s.counts.modified ?? 0), 0)}{" "}
          modified,{" "}
          {summary.sources.reduce((n, s) => n + (s.counts.missing ?? 0), 0)}{" "}
          missing,{" "}
          {summary.sources.reduce((n, s) => n + (s.counts.unchanged ?? 0), 0)}{" "}
          unchanged. {summary.observations} new observations. Prior human
          decisions remain intact; missing entries do not establish deletion.
        </p>
      )}
      {(parent?.revision ?? 1) >= 2 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Latest allowlisted demo snapshot collected. Further synthetic
          revisions are unavailable.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-300">
          {error}
        </p>
      )}
    </section>
  );
}
