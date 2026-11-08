"use client";
import Link from "next/link";
import { useAccess } from "./workspace-provider";
import { useInvestigationData } from "./investigation-data";
import { incidentBase } from "@/lib/roles";
export function InvestigationStatus() {
  const a = useAccess(),
    d = useInvestigationData();
  if (!d.ready) return null;
  if (d.metadata?.mode === "reference")
    return (
      <p className="mb-4 text-xs text-muted-foreground">
        Established Case · Preserved reference incident
      </p>
    );
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
      data-testid="investigation-status"
    >
      <Link
        className="text-foreground underline underline-offset-4"
        href={`${incidentBase(a.organizationId, a.incidentId)}/investigation`}
      >
        {d.run ? "Open Investigation" : "Start Investigation"}
      </Link>
      {d.run && (
        <span>
          Collection: {d.run.collectionStatus} · Deterministic analysis:{" "}
          {d.run.deterministicStatus} · Agent: {d.run.agentStatus}
          {d.agent?.pending ? ` · ${d.agent.pending} awaiting review` : ""}
        </span>
      )}
    </div>
  );
}
