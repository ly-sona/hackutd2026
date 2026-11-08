import { table, t } from "spacetimedb/server";
const incident = {
  organizationId: t.string(),
  incidentId: t.string(),
  incidentKey: t.string().index("btree"),
};
export const conversations = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    type: t.string(),
    title: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
  },
);
export const conversationParticipants = table(
  {},
  {
    id: t.string().primaryKey(),
    conversationId: t.string().index("btree"),
    userId: t.string(),
  },
);
export const messages = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    ...incident,
    conversationId: t.string().index("btree"),
    senderId: t.string(),
    content: t.string(),
    references: t.string(),
    createdAt: t.u64(),
    correctionOf: t.u64(),
  },
);
export const conversationReads = table(
  {},
  {
    id: t.string().primaryKey(),
    conversationId: t.string(),
    userId: t.string(),
    lastReadMessageId: t.u64(),
  },
);
export const tasks = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    title: t.string(),
    description: t.string(),
    kind: t.string(),
    priority: t.string(),
    status: t.string(),
    assignedUserId: t.string(),
    backupUserId: t.string(),
    createdBy: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
    dueAt: t.u64(),
    verifiedBy: t.string(),
    verifiedAt: t.u64(),
    relatedFindingId: t.string(),
    sourceMessageId: t.u64(),
    sourceConversationId: t.string(),
    references: t.string(),
  },
);
export const taskUpdates = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    ...incident,
    taskId: t.string().index("btree"),
    actorId: t.string(),
    previousStatus: t.string(),
    newStatus: t.string(),
    comment: t.string(),
    createdAt: t.u64(),
  },
);
export const pages = table(
  {},
  {
    id: t.string().primaryKey(),
    ...incident,
    taskId: t.string(),
    requestedBy: t.string(),
    pagedUserId: t.string(),
    backupUserId: t.string(),
    status: t.string(),
    createdAt: t.u64(),
    acknowledgmentDeadline: t.u64(),
    acknowledgedBy: t.string(),
    acknowledgedAt: t.u64(),
    escalatedAt: t.u64(),
    parentPageId: t.string(),
    reason: t.string(),
  },
);
export const responderAvailability = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string().index("btree"),
    userId: t.string(),
    status: t.string(),
    updatedAt: t.u64(),
  },
);
export const coordinationOperations = table(
  {},
  {
    id: t.string().primaryKey(),
    action: t.string(),
    fingerprint: t.string(),
    result: t.string(),
    createdAt: t.u64(),
  },
);
export const coordinationNotificationTargets = table(
  {},
  {
    id: t.u64().primaryKey(),
    conversationId: t.string(),
    taskId: t.string(),
    pageId: t.string(),
  },
);
export const coordinationEventVisibility = table(
  {},
  {
    id: t.u64().primaryKey(),
    conversationId: t.string(),
  },
);
export const coordinationFindings = table(
  {},
  {
    id: t.string().primaryKey(),
    conversationId: t.string(),
    sourceMessageId: t.u64(),
  },
);
export const coordinationTables = {
  conversations,
  conversationParticipants,
  messages,
  conversationReads,
  tasks,
  taskUpdates,
  pages,
  responderAvailability,
  coordinationOperations,
  coordinationNotificationTargets,
  coordinationEventVisibility,
  coordinationFindings,
};
