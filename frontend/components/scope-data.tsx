"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import {
  readScope,
  type ScopeEntity,
  type ScopeRelationship,
  type ScopeAssessment,
  type ScopeEvidenceLink,
  type ScopeSummary,
  type ScopeLead,
} from "@/lib/scope";
export interface RecordResult {
  entity: ScopeEntity;
  relationships: ScopeRelationship[];
}
export interface RecordPage {
  records: ScopeEntity[];
  total: number;
  totalInGroup: number;
  offset: number;
  limit: number;
}
function useData() {
  const a = useAccess(),
    [rows, ready] = useTable(tables.visibleScopeData),
    [loaded, setLoaded] = useState<RecordResult[]>([]);
  const canRecords = a.can("scope:records");
  const scope = useMemo(
    () => ({ organizationId: a.organizationId, incidentId: a.incidentId }),
    [a.organizationId, a.incidentId],
  );
  const data = useMemo(() => {
    const scoped = rows.filter(
      (r) =>
        r.organizationId === a.organizationId && r.incidentId === a.incidentId,
    );
    const get = <T,>(kind: string) =>
      scoped.filter((r) => r.kind === kind).map((r) => JSON.parse(r.body) as T);
    const records = canRecords ? loaded : [];
    return {
      entities: [
        ...new Map(
          [
            ...get<ScopeEntity>("entity").filter(
              (e) => canRecords || e.kind !== "Record",
            ),
            ...records.map((r) => r.entity),
          ].map((e) => [e.id, e]),
        ).values(),
      ],
      relationships: [
        ...new Map(
          [
            ...get<ScopeRelationship>("relationship"),
            ...records.flatMap((r) => r.relationships),
          ].map((e) => [e.id, e]),
        ).values(),
      ],
      assessments: get<ScopeAssessment>("assessment"),
      links: get<ScopeEvidenceLink>("evidenceLink"),
      leads: get<ScopeLead>("lead"),
      summary: get<ScopeSummary>("summary")[0],
    };
  }, [rows, a.organizationId, a.incidentId, canRecords, loaded]);
  const loadRecord = useCallback(
    async (id: string) => {
      const result = await readScope<RecordResult>(
        { organizationId: a.organizationId, incidentId: a.incidentId },
        "entity",
        { entityId: id },
      );
      if (result.entity.kind === "Record")
        setLoaded((old) => [...old.filter((r) => r.entity.id !== id), result]);
      return result.entity;
    },
    [a.organizationId, a.incidentId],
  );
  return { ...data, ready, scope, loadRecord };
}
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function ScopeDataProvider({ children }: { children: React.ReactNode }) {
  const value = useData();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useScope() {
  const value = useContext(Context);
  if (!value) throw new Error("Scope data required.");
  return value;
}
