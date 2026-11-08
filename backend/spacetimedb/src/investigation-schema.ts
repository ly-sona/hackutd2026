import { table, t } from "spacetimedb/server";
const incident = {
  organizationId: t.string(),
  incidentId: t.string(),
  incidentKey: t.string().index("btree"),
};
export const incidentInvestigations = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    mode: t.string(),
    referenceVersion: t.string(),
    retired: t.bool(),
    scenario: t.string(),
  },
);
export const investigationSources = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    connectorId: t.string(),
    version: t.string(),
    status: t.string(),
    latestSnapshotId: t.string(),
  },
);
export const analysisRuns = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    operationKey: t.string().unique(),
    fingerprint: t.string(),
    actorId: t.string(),
    membershipRevision: t.string(),
    assignmentRevision: t.string(),
    sourceIds: t.string(),
    status: t.string(),
    collectionStatus: t.string(),
    deterministicStatus: t.string(),
    agentStatus: t.string(),
    completedSnapshots: t.u32(),
    expectedSnapshots: t.u32(),
    analyzedSources: t.u32(),
    leaseToken: t.string(),
    leaseUntil: t.u64(),
    deadline: t.u64(),
    error: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
);
export const sourceSnapshots = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    runId: t.string().index("btree"),
    sourceId: t.string(),
    role: t.string(),
    revision: t.u32(),
    evidenceId: t.string(),
    storageReference: t.string(),
    sha256: t.string(),
    size: t.u32(),
    collectedAt: t.string(),
    ingestedAt: t.u64(),
    coverage: t.string(),
    recordCount: t.u32(),
    stagedCount: t.u32(),
    status: t.string(),
  },
);
export const snapshotRecordVersions = table(
  {},
  {
    id: t.string().primaryKey(),
    snapshotId: t.string().index("btree"),
    key: t.string(),
    sha256: t.string(),
    body: t.string(),
    location: t.string(),
  },
);
export const analysisObservations = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    runId: t.string().index("btree"),
    sourceId: t.string(),
    key: t.string(),
    rule: t.string(),
    ruleVersion: t.string(),
    description: t.string(),
    provenance: t.string(),
  },
);

// Independent immutable manifest and execution checkpoint; no session secret.
export const agentRuns = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    collectionRunId: t.string().index("btree"),
    operationKey: t.string().unique(),
    fingerprint: t.string(),
    actorId: t.string(),
    membershipRevision: t.string(),
    assignmentRevision: t.string(),
    deadline: t.u64(),
    manifest: t.string(),
    context: t.string(),
    status: t.string(),
    error: t.string(),
    model: t.string(),
    modelEndpoint: t.string(),
    promptVersion: t.string(),
    requests: t.u32(),
    attempts: t.u32(),
    trace: t.string(),
    leaseToken: t.string(),
    leaseUntil: t.u64(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
);
export const analysisProposals = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    agentRunId: t.string().index("btree"),
    content: t.string(),
    status: t.string(),
    reviewerId: t.string(),
    justification: t.string(),
    decisionFingerprint: t.string(),
    findingId: t.string(),
    relationshipId: t.string(),
    createdAt: t.u64(),
    reviewedAt: t.u64(),
  },
);
export const investigationTables = {
  incidentInvestigations,
  investigationSources,
  analysisRuns,
  sourceSnapshots,
  snapshotRecordVersions,
  analysisObservations,
  agentRuns,
  analysisProposals,
};
