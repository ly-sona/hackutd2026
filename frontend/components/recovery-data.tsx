"use client";
import { createContext, useContext, useMemo, useCallback, useRef } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import { api } from "@/lib/api";
import type {
  Warning,
  BusinessOperation,
  RecoveryTemplate,
  RecoveryExecution,
  RecoveryStep,
  ApprovalRequest,
  ApprovalDecision,
  FallbackGrant,
  SavedReport,
  ReportingMetadata,
  LegalReview,
} from "@/lib/recovery";
function useData() {
  const a = useAccess(),
    [rows, ready] = useTable(tables.visibleRecoveryData);
  return useMemo(() => {
    const scoped = rows.filter(
        (r) =>
          r.organizationId === a.organizationId &&
          r.incidentId === a.incidentId,
      ),
      get = <T,>(kind: string) =>
        scoped
          .filter((r) => r.kind === kind)
          .map((r) => JSON.parse(r.body) as T);
    return {
      ready,
      warnings: get<Warning>("warning"),
      operations: get<BusinessOperation>("operation"),
      templates: get<RecoveryTemplate>("template"),
      executions: get<RecoveryExecution>("execution").sort(
        (a, b) => Number(b.createdAt) - Number(a.createdAt),
      ),
      steps: get<RecoveryStep>("step").sort((a, b) => a.order - b.order),
      requests: get<ApprovalRequest>("request").sort(
        (a, b) => Number(b.createdAt) - Number(a.createdAt),
      ),
      decisions: get<ApprovalDecision>("decision"),
      grants: get<FallbackGrant>("grant"),
      reports: get<SavedReport>("report").sort((a, b) => b.version - a.version),
      metadata: get<ReportingMetadata>("metadata")[0],
      legal: get<LegalReview>("legal")[0],
      now: get<{ now: string }>("policy")[0]?.now ?? "0",
    };
  }, [rows, ready, a.organizationId, a.incidentId]);
}
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function RecoveryDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const d = useData();
  return <Context.Provider value={d}>{children}</Context.Provider>;
}
export function useRecovery() {
  const d = useContext(Context);
  if (!d) throw new Error("Recovery provider required.");
  return d;
}
export function useRecoveryCommand() {
  const a = useAccess(),
    pending = useRef(new Map<string, string>());
  return useCallback(
    async <T,>(action: string, payload: object): Promise<T> => {
      const body = {
          ...payload,
          organizationId: a.organizationId,
          incidentId: a.incidentId,
          action,
        },
        fingerprint = JSON.stringify(body),
        id = pending.current.get(fingerprint) ?? crypto.randomUUID();
      pending.current.set(fingerprint, id);
      const result = await api<T>("recovery", { ...body, operationId: id });
      pending.current.delete(fingerprint);
      return result;
    },
    [a.organizationId, a.incidentId],
  );
}
