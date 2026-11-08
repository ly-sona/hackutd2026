"use client";
import { useRouter } from "next/navigation";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { incidentBase } from "@/lib/roles";
export function IncidentSelector() {
  const d = useIncident(),
    a = useAccess(),
    router = useRouter();
  return (
    <select
      aria-label="Select incident"
      className="w-24 min-w-0 truncate bg-transparent text-base sm:w-28 sm:text-lg"
      value={a.incidentId}
      onChange={(e) =>
        router.push(
          `${incidentBase(a.organizationId, e.target.value)}/overview`,
        )
      }
    >
      {d.incidents.length ? (
        d.incidents.map((i) => (
          <option key={i.id} value={i.incidentId}>
            {i.incidentId}
          </option>
        ))
      ) : (
        <option>{a.incidentId}</option>
      )}
    </select>
  );
}
