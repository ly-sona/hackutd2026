import type {
  AgentObservation,
  Citation,
  GroundedProposal,
} from "./agent-investigation";
import type { SourceRecord } from "./investigation";
import { connectors } from "./investigation";
export const IMPACT_VERSION = "aegis-impact-v1";
export type ImpactDimension = (typeof import("./scope").impactTypes)[number];
export interface ImpactProposal {
  kind: "assessment";
  candidateKey: string;
  entityId: string;
  targetLabel: string;
  assessmentId: string;
  dimension: ImpactDimension;
  proposedStatus: "Suspected" | "Unassessed" | "Investigating";
  title: string;
  claim: string;
  rationale: string;
  uncertainty: string;
  missingInformation: string;
  observationIds: string[];
  citations: Citation[];
  toolVersion: string;
  previousAssessment: string;
  manualReason: string;
  priority?: never;
}
export type InvestigationProposal = GroundedProposal | ImpactProposal;
export const isImpact = (
  value: InvestigationProposal,
): value is ImpactProposal => "kind" in value && value.kind === "assessment";
export const dimensionLabels: Record<ImpactDimension, string> = {
  Compromise: "Suspicious access",
  Encryption: "Encryption indicators",
  Exfiltration: "Possible exposure",
  Alteration: "Unexpected alterations",
  Deletion: "Missing records",
  Availability: "Availability issues",
};
export const observationLabels: Record<string, string> = {
  "unexplained-field-change": "Unexpected field change",
  "source-declared-change-reference":
    "Change with an unverified approval reference",
  "missing-export-entry": "Record missing from export",
  "new-signin-source": "Unusual sign-in source",
  "traffic-after-reported-isolation":
    "Network activity after reported isolation",
  "reported-service-interruption": "Reported service interruption",
  "comparison-unavailable": "No baseline available",
};
export function sourceName(sourceId: string) {
  return (
    connectors.find((c) => sourceId.endsWith(`:source:${c.id}`))?.name ??
    "Source"
  );
}
export function observationDimension(
  o: AgentObservation,
): ImpactDimension | undefined {
  if (
    o.rule === "unexplained-field-change" &&
    o.sourceId.endsWith(":source:customers")
  )
    return "Alteration";
  return (
    {
      "missing-export-entry": "Deletion",
      "new-signin-source": "Compromise",
      "traffic-after-reported-isolation": "Exfiltration",
      "reported-service-interruption": "Availability",
    } as Record<string, ImpactDimension>
  )[o.rule];
}
export function findingLabel(p: GroundedProposal) {
  return (
    (
      {
        "Investigate containment": "Network activity after reported isolation",
        "Investigate account activity": "Unusual sign-in source",
        "Investigate source change": "Unexpected source change",
        "Investigate service interruption": "Reported service interruption",
      } as Record<string, string>
    )[p.interpretation] ?? p.title
  );
}
export function observationCitations(o: AgentObservation): Citation[] {
  return (JSON.parse(o.provenance) as Omit<Citation, "observationId">[]).map(
    (r) => ({ ...r, observationId: o.id }),
  );
}
export type ImpactBase = Omit<
  ImpactProposal,
  "previousAssessment" | "manualReason"
>;
export function deriveImpactCandidates(
  observations: AgentObservation[],
  record: (ref: Citation) => SourceRecord,
  incidentKey: string,
): ImpactBase[] {
  const results: ImpactBase[] = [];
  const targets = new Set<string>();
  const latest = (o: AgentObservation) =>
    observationCitations(o)
      .map(record)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  for (const o of observations) {
    const dimension = observationDimension(o);
    if (!dimension) continue;
    let selected = [o],
      entityId = `${o.sourceId}:system`,
      proposedStatus: ImpactBase["proposedStatus"] = "Suspected";
    let title = "",
      claim = "",
      uncertainty = "",
      missingInformation = "";
    const label = sourceName(o.sourceId),
      row = latest(o);
    if (dimension === "Alteration") {
      if (!row || row.fields.approvedChange) continue;
      entityId = `${o.sourceId}:record:${o.key}`;
      title = `Unexpected change to ${o.key}`;
      claim = `${o.key} differs from the supplied baseline in the cited fields. The change's cause and authorization are unverified.`;
      uncertainty =
        "A field difference does not establish malicious modification or a trustworthy baseline.";
      missingInformation =
        "Verify the change authorization and baseline provenance with an independent source.";
    } else if (dimension === "Deletion") {
      entityId = `${o.sourceId}:dataset`;
      proposedStatus = "Unassessed";
      title = `${o.key} missing from export`;
      claim = `${o.key} was present in the baseline and is absent from the collected export. Record deletion is not established.`;
      uncertainty =
        "Missing export entries can reflect coverage, filtering or collection failure. This assessment records an unresolved deletion question.";
      missingInformation =
        "Obtain an explicit deletion event or independently verified complete source inventory.";
    } else if (dimension === "Availability") {
      title = `Reported interruption: ${o.key}`;
      claim = `The service snapshot reports ${o.key} as unavailable.`;
      uncertainty =
        "This is a source-reported outage, not independently verified availability or proof of compromise.";
      missingInformation =
        "Independently verify the service state and affected dependencies.";
    } else if (dimension === "Compromise") {
      proposedStatus = "Investigating";
      title = `Unusual sign-in: ${o.key}`;
      claim = `A successful sign-in from a source absent in the supplied baseline requires investigation of ${label}.`;
      uncertainty =
        "A new sign-in source alone does not prove unauthorized access or account compromise.";
      missingInformation =
        "Verify account authorization, source ownership and the legitimacy of the sign-in.";
    } else if (dimension === "Exfiltration") {
      if (!row) continue;
      const identity = observations.find((other) => {
        if (other.rule !== "new-signin-source" || other.sourceId === o.sourceId)
          return false;
        const r = latest(other);
        return (
          r &&
          typeof row.fields.accountId === "string" &&
          typeof row.fields.source === "string" &&
          row.fields.accountId === r.fields.accountId &&
          row.fields.source === r.fields.source &&
          !!row.observedAt &&
          !!r.observedAt &&
          Math.abs(Date.parse(row.observedAt) - Date.parse(r.observedAt)) <=
            30 * 60_000
        );
      });
      if (!identity) continue;
      selected = [o, identity];
      title = "Possible exposure after reported isolation";
      claim =
        "Traffic after reported isolation correlates with a new sign-in source by explicit account, source and observed time. Review possible exposure at the network system.";
      uncertainty =
        "Transferred contents and destination authorization are unknown. No dataset or individual record is identified as exfiltrated.";
      missingInformation =
        "Obtain authorized-boundary context and content-specific independent transfer evidence before confirming exfiltration.";
    } else continue;
    const targetKey = `${entityId}:${dimension}`;
    if (targets.has(targetKey)) continue;
    targets.add(targetKey);
    const citations = selected.flatMap(observationCitations);
    citations.forEach(record);
    results.push({
      kind: "assessment",
      candidateKey: `${targetKey}:${selected
        .map((o) => o.id)
        .sort()
        .join(":")}`,
      entityId,
      targetLabel: `${label} · ${o.key}`,
      assessmentId: `${incidentKey}:${entityId}:${dimension}`,
      dimension,
      proposedStatus,
      title,
      claim,
      rationale: `Evidence-derived ${dimension.toLowerCase()} candidate using ${IMPACT_VERSION}. Applying it uses the existing Scope assessment rules.`,
      uncertainty,
      missingInformation,
      observationIds: selected.map((o) => o.id),
      citations,
      toolVersion: IMPACT_VERSION,
    });
    if (results.length === 12) break;
  }
  return results;
}
