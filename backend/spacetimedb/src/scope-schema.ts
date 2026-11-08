import { table, t } from "spacetimedb/server";
const incident = {
  organizationId: t.string(),
  incidentId: t.string(),
  incidentKey: t.string().index("btree"),
};
export const scopeEntities = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string().index("btree"),
    kind: t.string(),
    reference: t.string(),
    name: t.string(),
    description: t.string(),
    owner: t.string(),
    assetType: t.string(),
    parentId: t.string(),
    datasetId: t.string(),
    groupId: t.string(),
    dataCategory: t.string(),
    sensitivity: t.string(),
    recordCount: t.u32(),
    countKnown: t.bool(),
    defaultVisible: t.bool(),
    createdBy: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
);
export const scopeAssociations = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    entityId: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
  },
);
export const scopeRelationships = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    sourceId: t.string(),
    targetId: t.string(),
    type: t.string(),
    status: t.string(),
    justification: t.string(),
    evidenceIds: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
  },
);
export const scopeAssessments = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    entityId: t.string(),
    dimension: t.string(),
    status: t.string(),
    description: t.string(),
    findingId: t.string(),
    assessedBy: t.string(),
    verifiedBy: t.string(),
    verifiedAt: t.u64(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
);
export const scopeEvidenceLinks = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    entityId: t.string(),
    assessmentId: t.string(),
    evidenceId: t.string(),
    annotation: t.string(),
    excerpt: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
  },
);
export const scopeRecords = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string(),
    datasetId: t.string().index("btree"),
    groupId: t.string(),
    reference: t.string(),
    dataCategory: t.string(),
    sensitivity: t.string(),
    syntheticMetadata: t.string(),
  },
);
export const scopeRecordMemberships = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string(),
    groupId: t.string().index("btree"),
    recordId: t.string().index("btree"),
  },
);
export const scopeTables = {
  scopeEntities,
  scopeAssociations,
  scopeRelationships,
  scopeAssessments,
  scopeEvidenceLinks,
  scopeRecords,
  scopeRecordMemberships,
};
