"use client";
import Link from "next/link";
import { Button } from "./ui/button";
import { useAccess } from "./workspace-provider";
import { useInvestigationData } from "./investigation-data";
import { incidentBase } from "@/lib/roles";
export function InvestigationStatus({
  prominent = false,
  inline = false,
}: {
  prominent?: boolean;
  inline?: boolean;
}) {
  const a = useAccess(),
    d = useInvestigationData();
  if (!d.ready) return null;
  if (d.metadata?.mode === "reference")
    return inline ? null : (
      <p className="mb-4 text-xs text-muted-foreground">
        Established Case · Preserved reference incident
      </p>
    );
  const label = d.run ? "Open Investigation" : "Start Investigation";
  const summary = d.run
    ? `Collection: ${d.run.collectionStatus} · Deterministic analysis: ${d.run.deterministicStatus} · Agent: ${d.run.agentStatus}${d.agent?.pending ? ` · ${d.agent.pending} awaiting review` : ""}`
    : undefined;
  const agentFailed =
    d.agent &&
    ["Failed", "Unavailable", "Revoked", "Canceled"].includes(d.agent.status);
  return (
    <Button
      asChild
      variant={prominent ? "default" : "outline"}
      className={prominent ? "!h-12 !px-8 !text-lg" : undefined}
    >
      <Link
        aria-label={label}
        title={summary}
        data-testid="investigation-status"
        href={`${incidentBase(a.organizationId, a.incidentId)}/investigation`}
      >
        {label}
        {agentFailed && (
          <span className="text-xs text-red-400"> · Analysis incomplete</span>
        )}
        {!!d.agent?.pending && (
          <span className="text-xs text-amber-300">
            {" "}
            · {d.agent.pending} awaiting review
          </span>
        )}
      </Link>
    </Button>
  );
}
