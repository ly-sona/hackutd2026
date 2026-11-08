"use client";
import Link from "./workspace-link";
import { useAccess } from "./workspace-provider";
import { useCoordination } from "./coordination-data";
import { useScope } from "./scope-data";
import { incidentBase } from "@/lib/roles";
import { Badge } from "./ui/badge";
import { useIncident } from "./incident-data";
import { businessContinuityStatus } from "@/lib/incident-model";

type Operation = { id: string; name: string; status: string; tone: string };

export function AffectedOperations() {
  const access = useAccess();
  const coordination = useCoordination();
  return access.can("scope:view") ? (
    <ScopedOperations />
  ) : (
    <OperationTable
      rows={coordination.operations.map((operation) => ({
        ...operation,
        status: "Incident linked",
        tone: "border-border text-muted-foreground",
      }))}
    />
  );
}

function ScopedOperations() {
  const scope = useScope();
  const rows = scope.entities
    .filter((entity) => entity.kind === "Business Operation")
    .map((entity) => {
      const assessment = scope.assessments.find(
        (item) =>
          item.entityId === entity.id && item.dimension === "Availability",
      );
      const status = assessment?.status ?? "Unassessed";
      return {
        id: entity.id,
        name: entity.name,
        status:
          status === "Confirmed"
            ? "Availability affected"
            : status === "Suspected"
              ? "Under investigation"
              : status === "Ruled Out"
                ? "Impact ruled out"
                : "Incident linked",
        tone:
          status === "Confirmed"
            ? "border-red-400 text-red-400"
            : status === "Suspected"
              ? "border-amber-400 text-amber-400"
              : status === "Ruled Out"
                ? "border-emerald-400 text-emerald-400"
                : "border-border text-muted-foreground",
      };
    });
  return <OperationTable rows={rows} />;
}

function OperationTable({ rows }: { rows: Operation[] }) {
  const access = useAccess();
  const incident = useIncident();
  const displayedRows = rows.map((row) => {
    const status = businessContinuityStatus(incident.events, row.id);
    return status
      ? {
          ...row,
          status,
          tone:
            status === "Restricted"
              ? "border-red-400 text-red-400"
              : "border-emerald-400 text-emerald-400",
        }
      : row;
  });
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="border-b border-border">
            <th className="w-[60%] px-5 py-3 font-normal">Operation</th>
            <th className="px-4 py-3 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row) => (
            <tr className="border-b border-border last:border-0" key={row.id}>
              <td className="px-5 py-3 font-medium">
                {access.can("scope:view") ? (
                  <Link
                    className="hover:underline underline-offset-4"
                    href={`${incidentBase(access.organizationId, access.incidentId)}/scope?entity=${encodeURIComponent(row.id)}`}
                  >
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={`font-normal ${row.tone}`}>
                  {row.status}
                </Badge>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={2} className="px-5 py-4 text-muted-foreground">
                No business operations linked yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
