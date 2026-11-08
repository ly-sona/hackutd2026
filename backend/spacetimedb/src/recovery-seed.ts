import type { Ctx } from "./index";
import { appendEvent, type Ports } from "./incident-domain";
import { scoped, key, time, json } from "./recovery-access";
function seedSsoPrecaution(ctx: Ctx) {
  const marker = "acme-phase5-sso-trust-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) return;
  const s = scoped("acme", "IR-2041"),
    entityId = "acme:scope:ID-SSO",
    id = `${s.incidentKey}:${entityId}`,
    at = time(ctx);
  if (
    !ctx.db.scopeEntities.id.find(entityId) ||
    !ctx.db.scopeAssociations.id.find(`${s.incidentKey}:${entityId}`) ||
    ctx.db.evidence.id.find("EV-018")?.incidentKey !== s.incidentKey
  )
    throw new Error(
      "The original identity-service association and incident evidence are required.",
    );
  if (!ctx.db.trustRestrictions.id.find(id)) {
    const reason =
      "Precautionary restriction on normal corporate authentication while administrative access paths and the EV-018 containment discrepancy are investigated. This does not confirm identity-service compromise. Use independent AEGIS authorization for continuity decisions.";
    const row = {
      id,
      ...s,
      entityId,
      category: "Do Not Use",
      reason,
      evidenceIds: json(["EV-018"]),
      active: true,
      createdAt: at,
      updatedAt: at,
      updatedBy: "system",
    };
    ctx.db.trustRestrictions.insert(row);
    appendEvent(
      ctx,
      "acme",
      "IR-2041",
      "system",
      "trust",
      "Synthetic authentication precaution initialized",
      reason,
      { evidenceIds: row.evidenceIds, newValue: json(row) },
    );
  }
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: at });
}
export function seedRecovery(
  ctx: Ctx,
  data: Record<string, unknown>,
  p: Ports,
) {
  const marker = "acme-phase5-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) {
    // Move pre-separation bodies byte-for-byte, within one transaction. No artifact, snapshot fact or version changes.
    for (const report of ctx.db.incidentReports.iter())
      if (report.snapshot) {
        const existing = ctx.db.reportSnapshots.id.find(report.id);
        if (existing && existing.snapshot !== report.snapshot)
          throw new Error("Historical snapshot differs; refusing migration.");
        if (!existing)
          ctx.db.reportSnapshots.insert({
            id: report.id,
            snapshot: report.snapshot,
          });
        ctx.db.incidentReports.id.update({ ...report, snapshot: "" });
      }
    seedSsoPrecaution(ctx);
    return { seeded: false };
  }
  if (!ctx.db.scenarioSeeds.id.find("acme-phase4-v1"))
    return p.fail("INVALID_INPUT", "Seed Phases 2–4 first.");
  const fixtures = data.fixtures,
    records = data.records;
  if (
    !Array.isArray(fixtures) ||
    fixtures.length !== 3 ||
    !Array.isArray(records) ||
    records.length !== 3
  )
    return p.fail(
      "INVALID_INPUT",
      "Trusted synthetic fixture artifacts are required.",
    );
  const validated = fixtures.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.id !== "string" ||
      !["success", "failure", "fallback"].includes(v.outcome) ||
      !/^[-a-f0-9]{36}$/.test(v.storageReference) ||
      !/^([a-f0-9]{64})$/.test(v.sha256) ||
      !Number.isSafeInteger(v.size) ||
      v.size < 1 ||
      v.size > 100000 ||
      typeof v.integrity !== "boolean" ||
      typeof v.availability !== "boolean"
    )
      return p.fail("INVALID_INPUT", "Invalid synthetic artifact descriptor.");
    return {
      id: String(v.id),
      outcome: String(v.outcome),
      filename: String(v.filename),
      evidenceId: String(v.evidenceId),
      storageReference: String(v.storageReference),
      sha256: String(v.sha256),
      size: BigInt(v.size),
      integrity: Boolean(v.integrity),
      availability: Boolean(v.availability),
    };
  });
  const safe = records.map((r, i) => {
    if (
      !r ||
      r.id !== `SAFE-${String(i + 1).padStart(3, "0")}` ||
      typeof r.label !== "string" ||
      typeof r.serviceTier !== "string" ||
      typeof r.instruction !== "string"
    )
      return p.fail("INVALID_INPUT", "Invalid independent safe subset.");
    return {
      id: r.id as string,
      label: r.label as string,
      serviceTier: r.serviceTier as string,
      instruction: r.instruction as string,
    };
  });
  const org = "acme",
    inc = "IR-2041",
    s = scoped(org, inc),
    at = time(ctx),
    entity = (ref: string) => `${org}:scope:${ref}`,
    groupId = "acme:safe-support:v1";
  for (const fixture of validated)
    ctx.db.recoveryFixtures.insert({
      ...fixture,
      ...s,
      createdAt: at,
      safeRecords: json(safe),
    });
  ctx.db.recoverySimulationState.insert({
    id: s.incidentKey,
    profile: "failure",
    updatedAt: at,
  });
  for (const record of safe)
    ctx.db.safeSupportRecords.insert({
      ...record,
      id: `${groupId}:${record.id}`,
      organizationId: org,
      groupId,
    });
  const emergency = entity("OP-EMERGENCY-FORMS");
  if (!ctx.db.scopeEntities.id.find(emergency))
    ctx.db.scopeEntities.insert({
      id: emergency,
      organizationId: org,
      kind: "Business Operation",
      reference: "OP-EMERGENCY-FORMS",
      name: "Emergency Support Forms",
      description:
        "Independent synthetic support forms. Available means no known usage restriction, not independently verified safe.",
      owner: "Techniq synthetic response team",
      assetType: "Business service",
      parentId: "",
      datasetId: "",
      groupId: "",
      dataCategory: "Internal business records",
      sensitivity: "Internal",
      recordCount: 0,
      countKnown: false,
      defaultVisible: false,
      createdBy: "sam",
      createdAt: at,
      updatedAt: at,
    });
  if (!ctx.db.scopeAssociations.id.find(`${s.incidentKey}:${emergency}`))
    ctx.db.scopeAssociations.insert({
      id: `${s.incidentKey}:${emergency}`,
      ...s,
      entityId: emergency,
      createdBy: "sam",
      createdAt: at,
    });
  const purchasing = [...ctx.db.scopeEntities.organizationId.filter(org)].find(
    (e) =>
      e.kind === "Business Operation" &&
      e.reference !== "OP-SUPPORT" &&
      e.id !== emergency,
  )!;
  for (const [entityId, importance, status, explanation] of [
    [
      entity("OP-SUPPORT"),
      "Critical",
      "Restricted",
      "Normal customer lookup is restricted while the Customer Database is investigated. Approved recovery or a limited independent fallback may restore capability.",
    ],
    [
      purchasing.id,
      "High",
      "At Risk",
      "Normal purchasing depends on restricted corporate authentication. Independent authorization records can support continuity; AEGIS never sends money.",
    ],
    [
      emergency,
      "High",
      "Operational",
      "Independent support forms have no current usage restriction. Availability is not proof of safety.",
    ],
  ])
    ctx.db.businessOperations.insert({
      id: `${s.incidentKey}:${entityId}`,
      ...s,
      entityId,
      importance,
      status,
      explanation,
      operatingMode: "Normal",
      activeExecutionId: "",
      updatedBy: "maya",
      updatedAt: at,
    });
  for (const [id, category, reason, evidenceIds] of [
    [
      entity("SYS-CUSTOMER-DB"),
      "Do Not Use",
      "Do not use the normal customer lookup route until isolation and source trust are independently verified. EV-018 records traffic after the reported isolation time.",
      ["EV-018"],
    ],
    [
      entity("OP-SUPPORT"),
      "Do Not Use",
      "Normal customer-support access is restricted. Use only a separately approved recovery capability or temporary fallback.",
      ["EV-018"],
    ],
  ] as [string, string, string, string[]][]) {
    if (ctx.db.scopeEntities.id.find(id))
      ctx.db.trustRestrictions.insert({
        id: `${s.incidentKey}:${id}`,
        ...s,
        entityId: id,
        category,
        reason,
        evidenceIds: json(
          evidenceIds.filter(
            (e) => ctx.db.evidence.id.find(e)?.incidentKey === s.incidentKey,
          ),
        ),
        active: true,
        createdAt: at,
        updatedAt: at,
        updatedBy: "maya",
      });
  }
  for (const template of [
    {
      templateId: "restore-support",
      kind: "recovery",
      name: "Restore Customer Support Capability",
      description:
        "Start an approved, deterministic simulation of an independent recovery source. The original database remains under investigation.",
      policy: "technical_recovery",
      fallbackTemplateId: "temporary-support",
      expectedResult:
        "A simulated independent recovery source passes integrity and availability checks; original compromise assessments stay unchanged.",
    },
    {
      templateId: "temporary-support",
      kind: "fallback",
      name: "Activate Temporary Customer Support Access",
      description:
        "Grant approved users read-only, expiring access to three independently stored synthetic support records.",
      policy: "sensitive_access",
      fallbackTemplateId: "",
      expectedResult:
        "Limited read-only customer-support capability; original database restrictions remain in force.",
    },
  ])
    ctx.db.recoveryTemplates.insert({
      ...template,
      id: `${template.templateId}@1`,
      version: 1,
      steps: json([
        "Validate prerequisites",
        "Create investigation task",
        "Human approval",
        "Execute simulated action",
        "Verify outcome",
        "Record result",
      ]),
      verificationConditions: json(
        template.kind === "recovery"
          ? [
              "Independent source integrity passes",
              "Simulated service availability passes",
            ]
          : [
              "Approved users only",
              "Exact safe subset",
              "Read-only access",
              "Bounded expiration",
              "Current incident membership",
            ],
      ),
      approved: true,
    });
  const requestBase = {
    ...s,
    executionId: "",
    actionType: "operational_decision",
    requestedBy: "alex",
    justification:
      "Synthetic continuity request. Approval records authorize no external transaction.",
    evidenceIds: "[]",
    affectedEntityIds: "[]",
    parameters: "{}",
    contextFingerprint: "",
    createdAt: at,
    expiresAt: at + 3_600_000n,
    completedAt: 0n,
    result: "",
  };
  for (const [reference, title, description, operationId, policy] of [
    [
      "OP-008",
      "Recovery hardware",
      "$4,800 proposed replacement hardware. No purchase or payment is executed.",
      purchasing.id,
      "operational_decision",
    ],
    [
      "OP-009",
      "Temporary support access",
      "Review the predefined, restricted fallback procedure before creating a protected activation request.",
      entity("OP-SUPPORT"),
      "sensitive_access",
    ],
    [
      "OP-007",
      "Backup storage extension",
      "Synthetic backup storage request; authorization is separate from restoration or source verification.",
      entity("OP-SUPPORT"),
      "sensitive_export",
    ],
  ])
    ctx.db.approvalRequests.insert({
      ...requestBase,
      id: `${s.incidentKey}:${reference}`,
      displayReference: reference,
      title,
      description,
      operationId,
      policy,
      sensitivity: policy === "sensitive_export" ? "Critical" : "High",
      revisionToken: ctx.newUuidV7().toString(),
      status: reference === "OP-009" ? "Draft" : "Pending",
    });
  ctx.db.incidentReportingMetadata.insert({
    id: s.incidentKey,
    ...s,
    detectionSource: "Responder observation",
    reportedAt: ctx.db.incidents.id.find(s.incidentKey)!.createdAt,
    initialReporterId: ctx.db.incidents.id.find(s.incidentKey)!.createdBy,
    initialObservation: ctx.db.incidents.id.find(s.incidentKey)!.description,
    attackVector: "Unknown",
    actorCategory: "Unknown",
    actionCategory: "Unknown",
    assetCategory: "Servers and customer data",
    impactCategory: "Under investigation",
    classificationEvidenceIds: json(["EV-018"]),
    mitreMappings: "[]",
    rootCause: "",
    lessonsLearned: "",
    updatedBy: "maya",
    updatedAt: at,
  });
  ctx.db.legalReviews.insert({
    id: s.incidentKey,
    ...s,
    jurisdictions: "Not yet assessed",
    informationCategories:
      "Potential customer information; exact categories remain under review",
    obligations: "Not yet established; authorized legal assessment required",
    notificationAssessment: "Pending assessment",
    legalHold: "Under review",
    evidencePreservation:
      "Original synthetic evidence retained in private storage",
    clientNotification: "Not yet assessed",
    regulatoryNotification: "Not yet assessed",
    confidentiality: "Confidential incident response",
    privilegeDesignation: "Not asserted",
    reviewStatus: "Under review",
    reviewedBy: "priya",
    reviewedAt: at,
  });
  seedSsoPrecaution(ctx);
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: at });
  return { seeded: true };
}
