import { table, t } from "spacetimedb/server";
const scope = {
  organizationId: t.string(),
  incidentId: t.string(),
  incidentKey: t.string().index("btree"),
};
export const incidents = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    title: t.string(),
    description: t.string(),
    type: t.string(),
    severity: t.string(),
    status: t.string(),
    systems: t.string(),
    impact: t.string(),
    discoveredAt: t.u64(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    createdBy: t.string(),
    commanderId: t.string(),
  },
);
export const findings = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    title: t.string(),
    description: t.string(),
    category: t.string(),
    priority: t.string(),
    status: t.string(),
    observedAt: t.u64(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    reportedBy: t.string(),
    assignedTo: t.string(),
    relatedSystem: t.string(),
    verifiedBy: t.string(),
    verifiedAt: t.u64(),
  },
);
export const incidentEvents = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    ...scope,
    type: t.string(),
    actorId: t.string(),
    title: t.string(),
    description: t.string(),
    createdAt: t.u64(),
    observedAt: t.u64(),
    findingId: t.string(),
    evidenceIds: t.string(),
    status: t.string(),
    previousValue: t.string(),
    newValue: t.string(),
    correctsEventId: t.string(),
  },
);
export const evidence = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    filename: t.string(),
    contentType: t.string(),
    size: t.u64(),
    storageReference: t.string(),
    sha256: t.string(),
    description: t.string(),
    source: t.string(),
    status: t.string(),
    collectedAt: t.u64(),
    uploadedAt: t.u64(),
    uploadedBy: t.string(),
  },
);
export const evidenceLinks = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    evidenceId: t.string(),
    findingId: t.string(),
    eventId: t.string(),
    annotation: t.string(),
    excerpt: t.string(),
    futureReference: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
  },
);
export const findingReads = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    userId: t.string(),
    findingId: t.string(),
    readAt: t.u64(),
  },
);
export const incidentVisits = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    userId: t.string(),
    lastViewedAt: t.u64(),
  },
);
export const visitWindows = table(
  {},
  {
    id: t.string().primaryKey(),
    ...scope,
    userId: t.string(),
    visitId: t.string(),
    cutoff: t.u64(),
    openedAt: t.u64(),
  },
);
export const notifications = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    ...scope,
    recipientId: t.string().index("btree"),
    type: t.string(),
    title: t.string(),
    description: t.string(),
    createdAt: t.u64(),
    readAt: t.u64(),
    findingId: t.string(),
  },
);
export const incidentCounters = table(
  {},
  { organizationId: t.string().primaryKey(), next: t.u32() },
);
export const scenarioSeeds = table(
  {},
  { id: t.string().primaryKey(), createdAt: t.u64() },
);
export const incidentTables = {
  incidents,
  findings,
  incidentEvents,
  evidence,
  evidenceLinks,
  findingReads,
  incidentVisits,
  visitWindows,
  notifications,
  incidentCounters,
  scenarioSeeds,
};
