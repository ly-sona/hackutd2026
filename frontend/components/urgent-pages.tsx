"use client";
import { useState, useRef } from "react";
import Link from "./workspace-link";
import { useCoordination } from "./coordination-data";
import { useAccess } from "./workspace-provider";
import { Button } from "./ui/button";
import { incidentBase } from "@/lib/roles";
import { incidentTime } from "@/lib/incident-model";
import { api } from "@/lib/api";
export function UrgentPages() {
  const a = useAccess(),
    d = useCoordination(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    requestIds = useRef(new Map<string, string>());
  const pending = d.allPages.filter(
    (p) => p.pagedUserId === a.userId && p.status === "Awaiting Acknowledgment",
  );
  if (!pending.length) return null;
  return (
    <aside
      aria-label="Urgent pages"
      className="mb-6 space-y-3 rounded-md border border-red-400/50 bg-red-400/5 p-4"
    >
      <h2 className="text-sm font-semibold text-red-300">
        Urgent · Explicit acknowledgment required
      </h2>
      {pending.map((p) => (
        <div
          key={p.id}
          data-testid="urgent-page"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="min-w-0 text-sm">
            <Link
              className="underline"
              href={`${incidentBase(p.organizationId, p.incidentId)}/team?task=${encodeURIComponent(p.taskId)}&page=${encodeURIComponent(p.id)}`}
            >
              {p.incidentId} ·{" "}
              {d.tasks.find((t) => t.id === p.taskId)?.title ??
                "Open paged task"}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.parentPageId
                ? "Escalated to you · No further automatic escalation"
                : `Server deadline: ${incidentTime(p.acknowledgmentDeadline)}`}{" "}
              · Receipt does not complete work.
            </p>
          </div>
          <Button
            size="sm"
            disabled={!!busy}
            onClick={async () => {
              setBusy(p.id);
              setError("");
              try {
                const requestId =
                  requestIds.current.get(p.id) ?? crypto.randomUUID();
                requestIds.current.set(p.id, requestId);
                await api("coordination", {
                  action: "page.acknowledge",
                  organizationId: p.organizationId,
                  incidentId: p.incidentId,
                  pageId: p.id,
                  clientRequestId: requestId,
                });
                requestIds.current.delete(p.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === p.id ? "Acknowledging…" : "Acknowledge receipt"}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </aside>
  );
}
