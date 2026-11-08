"use client";
import { createContext, useContext, useMemo, useRef, useCallback } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { api } from "@/lib/api";
import {
  orderMessages,
  type Conversation,
  type Message,
  type Task,
  type Page,
  type TaskUpdate,
  type Responder,
  type ReferenceOption,
  type OperationReference,
} from "@/lib/coordination";
function useData() {
  const a = useAccess(),
    incident = useIncident();
  const [rows, ready] = useTable(tables.visibleCoordinationData);
  const [scopeRows] = useTable(tables.visibleScopeData);
  return useMemo(() => {
    const scoped = rows.filter(
      (r) =>
        r.organizationId === a.organizationId && r.incidentId === a.incidentId,
    );
    const get = <T,>(kind: string) =>
      scoped.filter((r) => r.kind === kind).map((r) => JSON.parse(r.body) as T);
    const tasks = get<Task>("task"),
      responders = get<Responder>("responder"),
      operations = get<OperationReference>("operation");
    const scope = scopeRows.filter(
      (r) =>
        r.organizationId === a.organizationId && r.incidentId === a.incidentId,
    );
    const options: ReferenceOption[] = [
      ...incident.evidence.map((e) => ({
        kind: "evidence" as const,
        id: e.id,
        label: `${e.id} · ${e.filename}`,
      })),
      ...incident.findings.map((f) => ({
        kind: "finding" as const,
        id: f.id,
        label: `Finding · ${f.title}`,
      })),
      ...scope
        .filter((r) => r.kind === "entity")
        .map(
          (r) =>
            JSON.parse(r.body) as { id: string; name: string; kind: string },
        )
        .filter((e) => !["Evidence", "Finding", "Incident"].includes(e.kind))
        .map((e) => ({
          kind: "scope" as const,
          id: e.id,
          label: `${e.kind} · ${e.name}`,
        })),
      ...scope
        .filter((r) => r.kind === "assessment")
        .map(
          (r) =>
            JSON.parse(r.body) as {
              id: string;
              entityId: string;
              dimension: string;
              status: string;
            },
        )
        .map((e) => ({
          kind: "assessment" as const,
          id: e.id,
          entityId: e.entityId,
          label: `Assessment · ${e.entityId.split(":").at(-1)} · ${e.dimension}: ${e.status}`,
        })),
      ...operations
        .filter(
          (o) =>
            !scope.some(
              (r) => r.kind === "entity" && r.id === `entity:${o.id}`,
            ),
        )
        .map((o) => ({
          kind: "scope" as const,
          id: o.id,
          label: `Business Operation · ${o.name}`,
        })),
      ...tasks.map((t) => ({
        kind: "task" as const,
        id: t.id,
        label: `Task · ${t.title}`,
      })),
    ];
    return {
      ready,
      conversations: get<Conversation>("conversation"),
      messages: orderMessages(get<Message>("message")),
      tasks,
      pages: get<Page>("page"),
      allPages: rows
        .filter((r) => r.kind === "page")
        .map((r) => JSON.parse(r.body) as Page),
      updates: get<TaskUpdate>("taskUpdate"),
      responders,
      options: [
        ...new Map(options.map((o) => [`${o.kind}:${o.id}`, o])).values(),
      ],
      operations,
      policy: get<{ now: string; acknowledgmentSeconds: number }>("policy")[0],
      findingSources: get<{
        id: string;
        conversationId: string;
        sourceMessageId: string;
      }>("findingSource"),
      name: (id: string) =>
        responders.find((r) => r.id === id)?.name ??
        incident.members.find((m) => m.userId === id)?.name ??
        id,
    };
  }, [rows, ready, scopeRows, a.organizationId, a.incidentId, incident]);
}
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function CoordinationDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const d = useData();
  return <Context.Provider value={d}>{children}</Context.Provider>;
}
export function useCoordination() {
  const d = useContext(Context);
  if (!d) throw new Error("Coordination provider required.");
  return d;
}
// Keep the same UUID when retrying identical failed content. Editing the request creates a new operation.
export function useCoordinationCommand() {
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
        fingerprint = JSON.stringify(body);
      const request = pending.current.get(fingerprint) ?? crypto.randomUUID();
      pending.current.set(fingerprint, request);
      const result = await api<T>("coordination", {
        ...body,
        clientRequestId: request,
      });
      if (pending.current.get(fingerprint) === request)
        pending.current.delete(fingerprint);
      return result;
    },
    [a.organizationId, a.incidentId],
  );
}
