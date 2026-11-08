import type { Reader } from "./index";
import { json } from "./incident-domain";
// Gateway-only integrity descriptor, never a browser subscription or HTTP route.
export function referenceDescriptor(ctx: Reader) {
  const k = "acme:IR-2041";
  const tables = [
    "incidentInvestigations",
    "scenarioSeeds",
    "incidents",
    "findings",
    "incidentEvents",
    "evidence",
    "evidenceLinks",
    "scopeEntities",
    "scopeAssociations",
    "scopeRelationships",
    "scopeAssessments",
    "scopeEvidenceLinks",
    "scopeRecords",
    "scopeRecordMemberships",
    "conversations",
    "conversationParticipants",
    "messages",
    "tasks",
    "taskUpdates",
    "pages",
    "coordinationFindings",
    "coordinationEventVisibility",
    "trustRestrictions",
    "businessOperations",
    "recoveryExecutions",
    "recoverySteps",
    "approvalRequests",
    "approvalDecisions",
    "fallbackAccess",
    "safeSupportRecords",
    "incidentReportingMetadata",
    "legalReviews",
    "incidentReports",
    "reportSnapshots",
  ] as const;
  const conversations = new Set(
    [...ctx.db.conversations.incidentKey.filter(k)].map((r) => r.id),
  );
  const tasks = new Set(
    [...ctx.db.tasks.incidentKey.filter(k)].map((r) => r.id),
  );
  const reports = new Set(
    [...ctx.db.incidentReports.incidentKey.filter(k)].map((r) => r.id),
  );
  const events = new Set(
    [...ctx.db.incidentEvents.incidentKey.filter(k)].map((r) =>
      r.id.toString(),
    ),
  );
  const shared = new Set([
    "scopeEntities",
    "scopeRecords",
    "scopeRecordMemberships",
    "safeSupportRecords",
  ]);
  const rows: { table: string; id: string; body: string }[] = [];
  for (const table of tables)
    for (const raw of ctx.db[table].iter()) {
      const r = raw as unknown as Record<string, unknown>;
      if (
        table === "scenarioSeeds" ||
        r.incidentKey === k ||
        r.id === k ||
        (shared.has(table) && r.organizationId === "acme") ||
        ((table === "conversationParticipants" ||
          table === "coordinationFindings") &&
          conversations.has(String(r.conversationId))) ||
        (table === "taskUpdates" && tasks.has(String(r.taskId))) ||
        (table === "reportSnapshots" && reports.has(String(r.id))) ||
        (table === "coordinationEventVisibility" && events.has(String(r.id)))
      )
        rows.push({ table, id: String(r.id), body: json(r) });
    }
  const artifacts = [
    ...[...ctx.db.evidence.incidentKey.filter(k)].map((e) => ({
      id: e.id,
      storageReference: e.storageReference,
      sha256: e.sha256,
    })),
    ...[...ctx.db.incidentReports.incidentKey.filter(k)]
      .filter((r) => !!r.storageReference)
      .map((r) => ({
        id: r.id,
        storageReference: r.storageReference,
        sha256: r.sha256,
      })),
  ];
  return { version: "ir2041-reference-v1", rows, artifacts };
}
