import { table, t } from "spacetimedb/server";
const scope = {
  organizationId: t.string(),
  incidentId: t.string(),
  incidentKey: t.string().index("btree"),
};
export const trustRestrictions = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    entityId: t.string(),
    category: t.string(),
    reason: t.string(),
    evidenceIds: t.string(),
    active: t.bool(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    updatedBy: t.string(),
  },
);
export const businessOperations = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    entityId: t.string(),
    importance: t.string(),
    status: t.string(),
    explanation: t.string(),
    operatingMode: t.string(),
    activeExecutionId: t.string(),
    updatedAt: t.u64(),
    updatedBy: t.string(),
  },
);
export const recoveryTemplates = table(
  {},
  {
    id: t.string().primaryKey(),
    templateId: t.string(),
    version: t.u32(),
    kind: t.string(),
    name: t.string(),
    description: t.string(),
    policy: t.string(),
    steps: t.string(),
    verificationConditions: t.string(),
    fallbackTemplateId: t.string(),
    expectedResult: t.string(),
    approved: t.bool(),
  },
);
export const recoveryExecutions = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    templateId: t.string(),
    templateVersion: t.u32(),
    kind: t.string(),
    operationId: t.string(),
    requestedBy: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    completedAt: t.u64(),
    state: t.string(),
    failureReason: t.string(),
    approvalId: t.string(),
    taskId: t.string(),
    parentExecutionId: t.string(),
    parameters: t.string(),
    contextFingerprint: t.string(),
    triggerEvidenceIds: t.string(),
    triggerAssessmentIds: t.string(),
    result: t.string(),
    step: t.u32(),
    nextAt: t.u64(),
    attempt: t.u32(),
    retryOfExecutionId: t.string(),
  },
);
export const recoverySteps = table(
  {},
  {
    id: t.string().primaryKey(),
    executionId: t.string().index("btree"),
    order: t.u32(),
    type: t.string(),
    state: t.string(),
    startedAt: t.u64(),
    completedAt: t.u64(),
    result: t.string(),
    evidenceId: t.string(),
  },
);
export const approvalRequests = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    displayReference: t.string(),
    title: t.string(),
    description: t.string(),
    operationId: t.string(),
    executionId: t.string(),
    actionType: t.string(),
    policy: t.string(),
    sensitivity: t.string(),
    requestedBy: t.string(),
    justification: t.string(),
    evidenceIds: t.string(),
    affectedEntityIds: t.string(),
    parameters: t.string(),
    contextFingerprint: t.string(),
    revisionToken: t.string(),
    status: t.string(),
    createdAt: t.u64(),
    expiresAt: t.u64(),
    completedAt: t.u64(),
    result: t.string(),
  },
);
export const approvalDecisions = table(
  {},
  {
    id: t.string().primaryKey(),
    requestId: t.string().index("btree"),
    userId: t.string(),
    role: t.string(),
    decision: t.string(),
    justification: t.string(),
    decidedAt: t.u64(),
    revisionToken: t.string(),
  },
);
export const fallbackAccess = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    executionId: t.string().index("btree"),
    userId: t.string(),
    allowedGroupId: t.string(),
    accessLevel: t.string(),
    activatedAt: t.u64(),
    expiresAt: t.u64(),
    revokedAt: t.u64(),
    reason: t.string(),
  },
);
export const safeSupportRecords = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string(),
    groupId: t.string().index("btree"),
    label: t.string(),
    serviceTier: t.string(),
    instruction: t.string(),
  },
);
export const recoveryFixtures = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    outcome: t.string(),
    evidenceId: t.string(),
    filename: t.string(),
    storageReference: t.string(),
    sha256: t.string(),
    size: t.u64(),
    integrity: t.bool(),
    availability: t.bool(),
    createdAt: t.u64(),
    safeRecords: t.string(),
  },
);
export const recoverySimulationState = table(
  {},
  { id: t.string().primaryKey(), profile: t.string(), updatedAt: t.u64() },
);
export const recoveryExecutionInternals = table(
  {},
  {
    id: t.string().primaryKey(),
    fixtureId: t.string(),
    safeRecords: t.string(),
  },
);
export const recoveryOperations = table(
  {},
  {
    id: t.string().primaryKey(),
    action: t.string(),
    fingerprint: t.string(),
    result: t.string(),
    createdAt: t.u64(),
  },
);
// Additive metadata extension: existing incident title/status/severity and source tables remain authoritative.
export const incidentReportingMetadata = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    detectionSource: t.string(),
    reportedAt: t.u64(),
    initialReporterId: t.string(),
    initialObservation: t.string(),
    attackVector: t.string(),
    actorCategory: t.string(),
    actionCategory: t.string(),
    assetCategory: t.string(),
    impactCategory: t.string(),
    classificationEvidenceIds: t.string(),
    mitreMappings: t.string(),
    rootCause: t.string(),
    lessonsLearned: t.string(),
    updatedBy: t.string(),
    updatedAt: t.u64(),
  },
);
export const legalReviews = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    jurisdictions: t.string(),
    informationCategories: t.string(),
    obligations: t.string(),
    notificationAssessment: t.string(),
    legalHold: t.string(),
    evidencePreservation: t.string(),
    clientNotification: t.string(),
    regulatoryNotification: t.string(),
    confidentiality: t.string(),
    privilegeDesignation: t.string(),
    reviewStatus: t.string(),
    reviewedBy: t.string(),
    reviewedAt: t.u64(),
  },
);
export const incidentReports = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    type: t.string(),
    version: t.u32(),
    generatedBy: t.string(),
    generatedAt: t.u64(),
    sourceCutoff: t.u64(),
    audience: t.string(),
    requiredPermissions: t.string(),
    includeLegal: t.bool(),
    storageReference: t.string(),
    sha256: t.string(),
    size: t.u64(),
    status: t.string(),
    snapshot: t.string(),
  },
);
// Large immutable bodies are never read by the live report-history projection.
// incidentReports.snapshot is retained empty for additive schema compatibility.
export const reportSnapshots = table(
  {},
  { id: t.string().primaryKey(), snapshot: t.string() },
);
export const recoveryTables = {
  trustRestrictions,
  businessOperations,
  recoveryTemplates,
  recoveryExecutions,
  recoverySteps,
  approvalRequests,
  approvalDecisions,
  fallbackAccess,
  safeSupportRecords,
  recoveryFixtures,
  recoverySimulationState,
  recoveryExecutionInternals,
  recoveryOperations,
  incidentReportingMetadata,
  legalReviews,
  incidentReports,
  reportSnapshots,
};
