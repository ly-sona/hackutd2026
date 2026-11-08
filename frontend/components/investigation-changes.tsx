"use client";
import Link from "next/link";
import { incidentBase } from "@/lib/roles";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import {
  isImpact,
  type InvestigationProposal,
} from "../../shared/investigation-impact";

// Only render after a persisted acceptance. Links use existing screen contracts.
export function InvestigationChanges({
  content,
  findingId,
  relationshipId,
  taskId,
}: {
  content: InvestigationProposal;
  findingId?: string;
  relationshipId?: string;
  taskId?: string;
}) {
  const a = useAccess(),
    incident = useIncident(),
    base = incidentBase(a.organizationId, a.incidentId),
    impact = isImpact(content);
  const finding = incident.findings.find((f) => f.id === findingId);
  return (
    <div className="space-y-2 text-sm" data-testid="investigation-change">
      <p className="font-medium">
        {impact
          ? `${content.dimension} recorded as ${content.proposedStatus} · ${content.targetLabel}`
          : `${finding?.status ?? "Reviewed"} finding · ${finding?.title ?? content.title}`}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {impact ? (
          <Link
            className="underline underline-offset-4"
            href={`${base}/scope?entity=${encodeURIComponent(content.entityId)}`}
          >
            View assessment in Scope
          </Link>
        ) : (
          findingId && (
            <Link
              className="underline underline-offset-4"
              href={`${base}/overview?finding=${encodeURIComponent(findingId)}`}
            >
              View incident finding
            </Link>
          )
        )}
        {!impact && relationshipId && (
          <Link
            className="underline underline-offset-4"
            href={`${base}/scope?entity=${encodeURIComponent(content.entityId)}`}
          >
            View linked dataset
          </Link>
        )}
        {impact && content.dimension === "Availability" && (
          <Link
            className="underline underline-offset-4"
            href={`${base}/operations`}
          >
            View operation
          </Link>
        )}
        <Link
          className="underline underline-offset-4"
          href={`${base}/timeline`}
        >
          View Timeline
        </Link>
        {taskId && (
          <Link
            className="underline underline-offset-4"
            href={`${base}/team?task=${encodeURIComponent(taskId)}`}
          >
            View follow-up task
          </Link>
        )}
      </div>
    </div>
  );
}
