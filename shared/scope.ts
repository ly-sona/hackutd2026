// Pure shared scope rules. No identities, filesystem access, React, or database side effects.
export const assetTypes = [
  "User account",
  "Administrator account",
  "Server",
  "Database",
  "Application",
  "Identity service",
  "Storage service",
  "Business service",
] as const;
export const entityKinds = [
  "Incident",
  "Account",
  "System",
  "Dataset",
  "Record Group",
  "Record",
  "Evidence",
  "Business Operation",
  "Finding",
] as const;
export const relationshipTypes = [
  "CAN_ACCESS",
  "STORED_IN",
  "CONTAINS",
  "DEPENDS_ON",
  "SUPPORTS",
  "RELATED_TO",
  "POTENTIALLY_AFFECTS",
] as const;
export const impactTypes = [
  "Compromise",
  "Encryption",
  "Exfiltration",
  "Alteration",
  "Deletion",
  "Availability",
] as const;
export const impactStates = [
  "Unassessed",
  "Suspected",
  "Confirmed",
  "Ruled Out",
] as const;
export const compromiseStates = [
  "Unassessed",
  "Investigating",
  "Suspected Compromise",
  "Confirmed Compromise",
  "Ruled Out",
] as const;
export const categories = [
  "Personal information",
  "Financial information",
  "Employee information",
  "Authentication data",
  "Internal business records",
  "Other",
] as const;
export const sensitivities = [
  "Public",
  "Internal",
  "Confidential",
  "Restricted",
] as const;
export interface ScopeEntity {
  id: string;
  organizationId: string;
  kind: string;
  reference: string;
  name: string;
  description: string;
  owner: string;
  assetType: string;
  parentId: string;
  datasetId: string;
  groupId: string;
  dataCategory: string;
  sensitivity: string;
  recordCount: number;
  countKnown: boolean;
  defaultVisible: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ScopeRelationship {
  id: string;
  organizationId: string;
  incidentId: string;
  sourceId: string;
  targetId: string;
  type: string;
  status: string;
  justification: string;
  evidenceIds: string;
  createdBy: string;
  createdAt: string;
}
export interface ScopeAssessment {
  id: string;
  organizationId: string;
  incidentId: string;
  entityId: string;
  dimension: string;
  status: string;
  description: string;
  findingId: string;
  assessedBy: string;
  verifiedBy: string;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface ScopeEvidenceLink {
  id: string;
  organizationId: string;
  incidentId: string;
  entityId: string;
  assessmentId: string;
  evidenceId: string;
  annotation: string;
  excerpt: string;
  createdBy: string;
  createdAt: string;
}
export interface ScopeSummary {
  systemsUnderInvestigation: number;
  confirmedSystems: number;
  datasetsAtRisk: number;
  groupsUnderInvestigation: number;
  totalRecords: number;
  individuallyConfirmedRecords: number;
  potentialRecords: number;
  notIndividuallyAssessed: number;
  enumeratedRecords: number;
}
export interface ScopeLead {
  entityId: string;
  sourceId: string;
  path: string[];
  explanation: string;
}
export const isConfirmed = (status: string) =>
  status === "Confirmed" || status === "Confirmed Compromise";
export const isPending = (status: string) =>
  ["Suspected", "Suspected Compromise", "Investigating"].includes(status);
type Ref = Pick<ScopeEntity, "id" | "kind" | "name">;
type Relation = Pick<
  ScopeRelationship,
  "id" | "sourceId" | "targetId" | "type" | "status"
>;
type Assessment = Pick<ScopeAssessment, "entityId" | "dimension" | "status">;
export function potentialLeads(
  entities: readonly Ref[],
  relationships: readonly Relation[],
  assessments: readonly Assessment[],
): ScopeLead[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const leads = new Map<string, ScopeLead>();
  for (const assessment of assessments) {
    if (
      assessment.dimension !== "Compromise" ||
      (!isConfirmed(assessment.status) && !isPending(assessment.status))
    )
      continue;
    const source = byId.get(assessment.entityId);
    if (!source) continue;
    const visited = new Set([source.id]);
    const queue = [{ id: source.id, path: [] as string[] }];
    for (let i = 0; i < queue.length && i < 128; i++) {
      const current = queue[i];
      for (const edge of relationships) {
        if (edge.status === "Ruled Out") continue;
        const next =
          edge.sourceId === current.id &&
          ["CAN_ACCESS", "CONTAINS", "POTENTIALLY_AFFECTS"].includes(edge.type)
            ? edge.targetId
            : edge.targetId === current.id &&
                ["DEPENDS_ON", "STORED_IN"].includes(edge.type)
              ? edge.sourceId
              : undefined;
        if (!next || !byId.has(next) || visited.has(next)) continue;
        visited.add(next);
        const path = [...current.path, edge.id];
        queue.push({ id: next, path });
        if (!leads.has(next))
          leads.set(next, {
            entityId: next,
            sourceId: source.id,
            path,
            explanation: `${source.name} has a ${isConfirmed(assessment.status) ? "confirmed" : "suspected"} compromise assessment. ${path.length} documented relationship(s) identify a potential investigation path; relationship certainty must be reviewed. This is not proof of access, damage, or exfiltration.`,
          });
      }
    }
  }
  return [...leads.values()];
}
export interface CountEntity extends Ref {
  datasetId: string;
  groupId: string;
  recordCount: number;
  countKnown: boolean;
}
export function calculateScope(
  entities: readonly CountEntity[],
  records: readonly { id: string; datasetId: string }[],
  memberships: readonly { groupId: string; recordId: string }[],
  assessments: readonly Assessment[],
  leads: readonly Pick<ScopeLead, "entityId">[],
): ScopeSummary {
  const assessed = new Set(
    assessments.filter((a) => a.status !== "Unassessed").map((a) => a.entityId),
  );
  const confirmed = new Set(
    assessments
      .filter((a) => a.dimension !== "Compromise" && isConfirmed(a.status))
      .map((a) => a.entityId),
  );
  const atRisk = new Set([
    ...assessments
      .filter((a) => isPending(a.status) || isConfirmed(a.status))
      .map((a) => a.entityId),
    ...leads.map((l) => l.entityId),
  ]);
  const recordIds = new Set(records.map((r) => r.id));
  const individuallyConfirmed = new Set(
    [...confirmed].filter((id) => recordIds.has(id)),
  );
  const potential = new Set(
    records
      .filter((r) => atRisk.has(r.id) || atRisk.has(r.datasetId))
      .map((r) => r.id),
  );
  for (const membership of memberships)
    if (atRisk.has(membership.groupId) && recordIds.has(membership.recordId))
      potential.add(membership.recordId);
  for (const id of individuallyConfirmed) potential.delete(id);
  const systems = entities.filter((e) => e.kind === "System");
  return {
    systemsUnderInvestigation: systems.filter((e) => atRisk.has(e.id)).length,
    confirmedSystems: systems.filter((e) =>
      assessments.some(
        (a) =>
          a.entityId === e.id &&
          a.dimension === "Compromise" &&
          isConfirmed(a.status),
      ),
    ).length,
    datasetsAtRisk: entities.filter(
      (e) => e.kind === "Dataset" && atRisk.has(e.id),
    ).length,
    groupsUnderInvestigation: entities.filter(
      (e) => e.kind === "Record Group" && atRisk.has(e.id),
    ).length,
    totalRecords: entities
      .filter((e) => e.kind === "Dataset" && e.countKnown)
      .reduce((n, e) => n + e.recordCount, 0),
    individuallyConfirmedRecords: individuallyConfirmed.size,
    potentialRecords: potential.size,
    notIndividuallyAssessed: records.filter((r) => !assessed.has(r.id)).length,
    enumeratedRecords: recordIds.size,
  };
}
