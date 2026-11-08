"use client";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import type {
  InvestigationRun,
  InvestigationSource,
} from "../../shared/investigation";

export function useInvestigationData() {
  const access = useAccess();
  const [rows, ready] = useTable(tables.visibleInvestigationData);
  const scoped = rows.filter(
    (r) =>
      r.organizationId === access.organizationId &&
      r.incidentId === access.incidentId,
  );
  const get = <T,>(kind: string) =>
    scoped.filter((r) => r.kind === kind).map((r) => JSON.parse(r.body) as T);
  const runs = get<InvestigationRun>("run").sort(
    (a, b) => Number(b.createdAt) - Number(a.createdAt),
  );
  return {
    ready,
    metadata: get<{ mode: string; referenceVersion: string; scenario: string }>(
      "metadata",
    )[0],
    runs,
    run: runs[0],
    sources: get<InvestigationSource>("source"),
  };
}
