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
    [summary, setSummary] = useState<Summary & { runId: string }>(),
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
        if (active) setSummary({ ...r, runId: run.id });
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
        autoInvestigate: true,
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
    <div
      aria-label="Snapshot monitoring"
      className="flex flex-wrap items-start gap-3"
    >
      <label className="relative text-[11px] text-muted-foreground">
        <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap">
          Snapshot history
        </span>
        <select
          aria-label="Snapshot history"
          className="h-8 w-auto min-w-44 rounded-md border border-border bg-background px-2 text-xs text-foreground [field-sizing:content]"
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
        <Button
          size="sm"
          variant="outline"
          className="!h-8 !px-3 !text-sm"
          disabled={busy}
          onClick={collect}
          title="Collect the next snapshot and investigate it automatically"
        >
          {busy ? "Starting…" : "Collect next snapshot"}
        </Button>
      )}
      {run.previousRunId && summary?.runId === run.id && (
        <details className="basis-full text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Snapshot changes · Revision {summary.revision}
          </summary>
          <p
            className="mt-2 max-w-2xl leading-5"
            data-testid="reassessment-summary"
          >
            Compared with the preserved prior snapshot:{" "}
            <span className="text-foreground">
              {summary.sources.reduce((n, s) => n + (s.counts.added ?? 0), 0)}{" "}
              added
            </span>
            ,{" "}
            <span className="text-foreground">
              {summary.sources.reduce(
                (n, s) => n + (s.counts.modified ?? 0),
                0,
              )}{" "}
              modified
            </span>
            ,{" "}
            <span className="text-foreground">
              {summary.sources.reduce((n, s) => n + (s.counts.missing ?? 0), 0)}{" "}
              missing
            </span>
            ,{" "}
            {summary.sources.reduce((n, s) => n + (s.counts.unchanged ?? 0), 0)}{" "}
            unchanged. {summary.observations} new observations. Prior decisions
            remain intact; missing entries do not establish deletion.
          </p>
        </details>
      )}
      {(parent?.revision ?? 1) >= 2 && (
        <span className="basis-full text-xs text-muted-foreground">
          Latest demo snapshot · Further revisions unavailable
        </span>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm text-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
