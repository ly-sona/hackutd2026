"use client";
import { createContext, useContext, useMemo, useEffect, useState } from "react";
import { useTable } from "spacetimedb/react";
import type { ScopeSummary } from "@/lib/scope";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import { api } from "@/lib/api";
import {
  sortEvents,
  type Incident,
  type Finding,
  type IncidentEvent,
  type Evidence,
  type EvidenceLink,
  type FindingRead,
} from "@/lib/incident-model";
const visits = new Map<
  string,
  { id: string; promise: Promise<{ cutoff: string }> }
>();
function useData() {
  const access = useAccess();
  const [rows, ready] = useTable(tables.visibleIncidentData);
  const [investigationRows] = useTable(tables.visibleInvestigationData);
  const [members] = useTable(tables.visibleMembers);
  const [window, setWindow] = useState<{
    key: string;
    cutoff: string;
    error?: string;
  }>();
  const visitKey = `${access.userId}:${access.organizationId}:${access.incidentId}`;
  useEffect(() => {
    let visit = visits.get(visitKey);
    if (!visit) {
      const id = crypto.randomUUID();
      visit = {
        id,
        promise: api<{ cutoff: string }>("incident/visit", {
          organizationId: access.organizationId,
          incidentId: access.incidentId,
          visitId: id,
        }),
      };
      visits.set(visitKey, visit);
    }
    let active = true;
    visit.promise
      .then((v) => {
        if (active) setWindow({ key: visitKey, cutoff: v.cutoff });
      })
      .catch((e: Error) => {
        visits.delete(visitKey);
        if (active) setWindow({ key: visitKey, cutoff: "0", error: e.message });
      });
    return () => {
      active = false;
    };
  }, [visitKey, access.organizationId, access.incidentId]);
  return useMemo(() => {
    const scoped = rows.filter(
      (r) =>
        r.organizationId === access.organizationId &&
        r.incidentId === access.incidentId,
    );
    const get = <T,>(kind: string) =>
      scoped.filter((r) => r.kind === kind).map((r) => JSON.parse(r.body) as T);
    return {
      ready,
      scopeSummary: get<ScopeSummary>("scopeSummary")[0],
      incident: get<Incident>("incident")[0],
      incidents: rows
        .filter(
          (r) =>
            r.kind === "incident" &&
            r.organizationId === access.organizationId &&
            !investigationRows.some(
              (m) =>
                m.incidentId === r.incidentId &&
                m.organizationId === r.organizationId &&
                m.kind === "metadata" &&
                (JSON.parse(m.body) as { retired: boolean }).retired,
            ),
        )
        .map((r) => JSON.parse(r.body) as Incident),
      findings: get<Finding>("finding"),
      events: sortEvents(get<IncidentEvent>("event")),
      evidence: get<Evidence>("evidence"),
      links: get<EvidenceLink>("link"),
      reads: get<FindingRead>("read"),
      members: members.filter(
        (m) =>
          m.organizationId === access.organizationId &&
          m.incidentId === access.incidentId &&
          m.status === "active",
      ),
      cutoff: window?.key === visitKey ? window.cutoff : undefined,
      visitError: window?.key === visitKey ? window.error : undefined,
    };
  }, [
    rows,
    investigationRows,
    ready,
    members,
    access.organizationId,
    access.incidentId,
    window,
    visitKey,
  ]);
}
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function IncidentDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useData();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useIncident() {
  const value = useContext(Context);
  if (!value) throw new Error("Incident data provider required.");
  return value;
}
