import type { Ctx } from "./index";
import type { Ports } from "./incident-domain";
export function seedScope(ctx: Ctx, p: Ports): unknown {
  const version = "acme-phase3-v1";
  if (ctx.db.scenarioSeeds.id.find(version)) {
    reconcileInventoryAssociations(ctx);
    return { seeded: false, version };
  }
  if (!ctx.db.scenarioSeeds.id.find("acme-phase2-v1"))
    return p.fail(
      "INVALID_INPUT",
      "Seed Phase 2 and its original evidence first.",
    );
  for (const id of [
    "EV-012",
    "EV-018",
    "EV-021",
    "EV-024",
    "EV-025",
    "EV-027",
    "EV-028",
  ])
    if (!ctx.db.evidence.id.find(id))
      return p.fail("INVALID_INPUT", "Phase 2 evidence is missing.");
  const at = BigInt(Date.parse("2026-11-07T09:30:00-06:00")),
    org = "acme",
    inc = "IR-2041",
    k = `${org}:${inc}`;
  const id = (ref: string) => `${org}:scope:${ref}`;
  const associate = (entityId: string, incident = inc) => {
    const pk = `${org}:${incident}:${entityId}`;
    if (!ctx.db.scopeAssociations.id.find(pk))
      ctx.db.scopeAssociations.insert({
        id: pk,
        organizationId: org,
        incidentId: incident,
        incidentKey: `${org}:${incident}`,
        entityId,
        createdBy: "maya",
        createdAt: at,
      });
  };
  function entity(
    reference: string,
    kind: string,
    name: string,
    options: Partial<{
      assetType: string;
      parent: string;
      dataset: string;
      count: number;
      known: boolean;
      visible: boolean;
      category: string;
      sensitivity: string;
      owner: string;
      description: string;
    }> = {},
  ) {
    const entityId = id(reference);
    if (!ctx.db.scopeEntities.id.find(entityId))
      ctx.db.scopeEntities.insert({
        id: entityId,
        organizationId: org,
        kind,
        reference,
        name,
        description:
          options.description ??
          "Synthetic inventory context. Membership and connectivity do not establish compromise.",
        owner: options.owner ?? "Acme synthetic response team",
        assetType: options.assetType ?? "",
        parentId: options.parent ? id(options.parent) : "",
        datasetId: options.dataset
          ? id(options.dataset)
          : kind === "Dataset"
            ? entityId
            : "",
        groupId: "",
        dataCategory: options.category ?? "Other",
        sensitivity: options.sensitivity ?? "Internal",
        recordCount: options.count ?? 0,
        countKnown: options.known ?? false,
        defaultVisible: options.visible ?? false,
        createdBy: "maya",
        createdAt: at,
        updatedAt: at,
      });
    associate(entityId);
    return entityId;
  }
  entity("A-09", "Account", "Administrator A-09", {
    assetType: "Administrator account",
    visible: true,
    category: "Authentication data",
    description:
      "Suspicious administrator activity is under review. Compromise remains suspected.",
  });
  for (const [ref, name] of [
    ["U-21", "Service owner U-21"],
    ["SVC-API", "API service account"],
    ["SVC-WORKER", "Worker service account"],
    ["U-22", "Support operator U-22"],
  ])
    entity(ref, "Account", name, {
      assetType: "User account",
      category: "Authentication data",
    });
  for (const [ref, name, type] of [
    ["SYS-CUSTOMER-DB", "Customer Database", "Database"],
    ["APP-PORTAL", "Customer Portal", "Application"],
    ["ID-SSO", "Corporate Identity Service", "Identity service"],
    ["SVR-API", "Customer API server", "Server"],
    ["SVR-WORKER", "Background worker", "Server"],
    ["STO-ARCHIVE", "Archive storage", "Storage service"],
    ["STO-BACKUP", "Backup storage", "Storage service"],
    ["NET-EDGE", "Network edge sensor", "Server"],
  ])
    entity(ref, "System", name, {
      assetType: type,
      visible: ref === "SYS-CUSTOMER-DB",
    });
  entity("DS-CUSTOMERS", "Dataset", "Customer Records", {
    parent: "SYS-CUSTOMER-DB",
    category: "Personal information",
    sensitivity: "Restricted",
    count: 1240,
    known: true,
    visible: true,
    description:
      "1,240 enumerated synthetic records. This is inventory size, not a verified exposure total.",
  });
  entity("DS-AUTH", "Dataset", "Authentication audit records", {
    parent: "ID-SSO",
    category: "Authentication data",
    sensitivity: "Restricted",
    description: "Record inventory not enumerated in this MVP.",
  });
  entity("DS-FINANCE", "Dataset", "Vendor response records", {
    parent: "STO-ARCHIVE",
    category: "Financial information",
    sensitivity: "Confidential",
    description: "Record inventory not enumerated in this MVP.",
  });
  for (const [ref, name, dataset, count, known] of [
    ["RG-OCTOBER", "October Customers", "DS-CUSTOMERS", 1240, true],
    ["RG-REVIEW", "Priority Review Customers", "DS-CUSTOMERS", 100, true],
    ["RG-WEST", "West Region Customers", "DS-CUSTOMERS", 200, true],
    ["RG-AUTH", "Administrator audit window", "DS-AUTH", 0, false],
    ["RG-FINANCE", "November vendor review", "DS-FINANCE", 0, false],
  ] as const)
    entity(ref, "Record Group", name, {
      parent: dataset,
      dataset,
      count,
      known,
      visible: ref === "RG-OCTOBER",
      category:
        dataset === "DS-CUSTOMERS"
          ? "Personal information"
          : "Internal business records",
      sensitivity: "Restricted",
      description:
        ref === "RG-OCTOBER"
          ? "October cohort: all 1,240 synthetic records. Individual access remains unconfirmed."
          : ref === "RG-REVIEW"
            ? "Overlapping subset C-1001 through C-1100; do not sum with the October cohort."
            : "Synthetic membership criteria; group size does not imply compromised records.",
    });
  entity("OP-SUPPORT", "Business Operation", "Customer Support", {
    visible: true,
    description:
      "Availability restrictions were reported; this is independent of whether records were exfiltrated.",
  });
  entity("OP-PURCHASING", "Business Operation", "Vendor Purchasing");
  function relationship(
    sourceId: string,
    targetId: string,
    type: string,
    status = "Unverified",
    justification = "Synthetic inventory relationship; no observed attack or record access is implied.",
    evidenceIds: string[] = [],
  ) {
    const pk = `${k}:${type}:${sourceId}:${targetId}`;
    if (!ctx.db.scopeRelationships.id.find(pk))
      ctx.db.scopeRelationships.insert({
        id: pk,
        organizationId: org,
        incidentId: inc,
        incidentKey: k,
        sourceId,
        targetId,
        type,
        status,
        justification,
        evidenceIds: JSON.stringify(evidenceIds),
        createdBy: "maya",
        createdAt: at,
      });
  }
  for (const ref of [
    "SYS-CUSTOMER-DB",
    "APP-PORTAL",
    "ID-SSO",
    "SVR-API",
    "SVR-WORKER",
    "STO-ARCHIVE",
    "STO-BACKUP",
    "NET-EDGE",
  ])
    relationship(
      id("A-09"),
      id(ref),
      "CAN_ACCESS",
      "Unverified",
      "Inventory access capability under review; this does not establish actual use.",
    );
  for (const [account, system] of [
    ["U-21", "APP-PORTAL"],
    ["SVC-API", "SYS-CUSTOMER-DB"],
    ["SVC-API", "SVR-API"],
    ["SVC-WORKER", "SVR-WORKER"],
    ["SVC-WORKER", "STO-ARCHIVE"],
    ["U-22", "APP-PORTAL"],
  ])
    relationship(id(account), id(system), "CAN_ACCESS");
  for (const [source, target] of [
    ["APP-PORTAL", "SVR-API"],
    ["SVR-API", "SYS-CUSTOMER-DB"],
    ["SVR-WORKER", "SYS-CUSTOMER-DB"],
    ["SYS-CUSTOMER-DB", "STO-BACKUP"],
    ["OP-SUPPORT", "SYS-CUSTOMER-DB"],
    ["OP-SUPPORT", "APP-PORTAL"],
    ["OP-PURCHASING", "ID-SSO"],
  ])
    relationship(id(source), id(target), "DEPENDS_ON");
  for (const [system, dataset] of [
    ["SYS-CUSTOMER-DB", "DS-CUSTOMERS"],
    ["ID-SSO", "DS-AUTH"],
    ["STO-ARCHIVE", "DS-FINANCE"],
  ]) {
    relationship(
      id(system),
      id(dataset),
      "CONTAINS",
      "Confirmed",
      "Explicit synthetic inventory structure; not an impact assessment.",
    );
    relationship(
      id(dataset),
      id(system),
      "STORED_IN",
      "Confirmed",
      "Explicit synthetic inventory structure; not an impact assessment.",
    );
  }
  for (const [dataset, group] of [
    ["DS-CUSTOMERS", "RG-OCTOBER"],
    ["DS-CUSTOMERS", "RG-REVIEW"],
    ["DS-CUSTOMERS", "RG-WEST"],
    ["DS-AUTH", "RG-AUTH"],
    ["DS-FINANCE", "RG-FINANCE"],
  ])
    relationship(
      id(dataset),
      id(group),
      "CONTAINS",
      "Confirmed",
      "Explicit synthetic group membership definition.",
    );
  const recordId = (n: number) => `${org}:record:C-${n}`;
  for (let n = 1001; n <= 2240; n++) {
    const rid = recordId(n);
    if (!ctx.db.scopeRecords.id.find(rid))
      ctx.db.scopeRecords.insert({
        id: rid,
        organizationId: org,
        datasetId: id("DS-CUSTOMERS"),
        groupId: id("RG-OCTOBER"),
        reference: `C-${n}`,
        dataCategory: "Personal information",
        sensitivity: "Restricted",
        syntheticMetadata: JSON.stringify({
          synthetic: true,
          cohort: "October",
          region: n <= 1200 ? "West" : "Other",
        }),
      });
    for (const group of [
      "RG-OCTOBER",
      ...(n <= 1100 ? ["RG-REVIEW"] : []),
      ...(n <= 1200 ? ["RG-WEST"] : []),
    ]) {
      const pk = `${id(group)}:${rid}`;
      if (!ctx.db.scopeRecordMemberships.id.find(pk))
        ctx.db.scopeRecordMemberships.insert({
          id: pk,
          organizationId: org,
          groupId: id(group),
          recordId: rid,
        });
    }
  }
  function assess(
    entityId: string,
    dimension: string,
    status: string,
    description: string,
    evidenceIds: string[],
    findingId = "",
  ) {
    const pk = `${k}:${entityId}:${dimension}`;
    if (ctx.db.scopeAssessments.id.find(pk)) return;
    ctx.db.scopeAssessments.insert({
      id: pk,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      entityId,
      dimension,
      status,
      description,
      findingId,
      assessedBy: "alex",
      verifiedBy: "",
      verifiedAt: 0n,
      createdAt: at,
      updatedAt: at,
    });
    for (const evidenceId of evidenceIds) {
      const linkId = `seed:${pk}:${evidenceId}`;
      if (!ctx.db.scopeEvidenceLinks.id.find(linkId))
        ctx.db.scopeEvidenceLinks.insert({
          id: linkId,
          organizationId: org,
          incidentId: inc,
          incidentKey: k,
          entityId,
          assessmentId: pk,
          evidenceId,
          annotation: description,
          excerpt: evidenceId === "EV-018" ? "09:21" : "",
          createdBy: "alex",
          createdAt: at,
        });
    }
  }
  assess(
    id("A-09"),
    "Compromise",
    "Suspected Compromise",
    "Suspicious administrator activity remains an assessment; no confirmed compromise.",
    [],
    "",
  );
  assess(
    id("SYS-CUSTOMER-DB"),
    "Compromise",
    "Investigating",
    "Isolation was reported at 09:18; later traffic does not establish its source or successful containment.",
    ["EV-012", "EV-018"],
    "IR-2041:F-04",
  );
  assess(
    id("DS-CUSTOMERS"),
    "Exfiltration",
    "Suspected",
    "EV-021 documents an unusual transfer; contents remain unknown.",
    ["EV-021"],
    "IR-2041:F-03",
  );
  assess(
    id("RG-OCTOBER"),
    "Exfiltration",
    "Suspected",
    "Potential exposure only. The 1,240 inventory count is not a count of exfiltrated records.",
    ["EV-018", "EV-021"],
    "IR-2041:F-03",
  );
  assess(
    id("RG-REVIEW"),
    "Exfiltration",
    "Suspected",
    "Overlapping investigation subset; do not double-count these 100 records.",
    ["EV-021"],
  );
  assess(
    id("OP-SUPPORT"),
    "Availability",
    "Suspected",
    "Business availability restriction is a reported impact, independent of exfiltration.",
    ["EV-028"],
    "IR-2041:F-06",
  );
  for (const [number, dimension] of [
    [1044, "Exfiltration"],
    [1050, "Encryption"],
    [1060, "Alteration"],
  ] as const)
    assess(
      recordId(number),
      dimension,
      "Suspected",
      "Preliminary individual investigation. Existing evidence does not verify this record was affected.",
      ["EV-018"],
    );
  for (const dimension of [
    "Encryption",
    "Alteration",
    "Deletion",
    "Availability",
  ])
    assess(
      recordId(1044),
      dimension,
      "Unassessed",
      "Not yet individually assessed. No inference from a dataset-level claim.",
      [],
    );
  assess(
    id("DS-CUSTOMERS"),
    "Encryption",
    "Unassessed",
    "Encryption is a separate dimension from possible exfiltration.",
    [],
  );
  assess(
    id("SYS-CUSTOMER-DB"),
    "Availability",
    "Suspected",
    "Platform availability interruption was reported.",
    ["EV-028"],
  );
  for (const [ev, target] of [
    ["EV-018", "SYS-CUSTOMER-DB"],
    ["EV-021", "DS-CUSTOMERS"],
    ["EV-012", "SYS-CUSTOMER-DB"],
    ["EV-028", "OP-SUPPORT"],
  ])
    relationship(
      `evidence:${ev}`,
      id(target),
      "SUPPORTS",
      "Unverified",
      "Evidence supports the bounded observation only, not every possible downstream claim.",
      [ev],
    );
  relationship(
    `evidence:EV-018`,
    "finding:IR-2041:F-02",
    "SUPPORTS",
    "Confirmed",
    "Existing Phase 2 observation and its actual network artifact.",
    ["EV-018"],
  );
  relationship(
    id("SYS-CUSTOMER-DB"),
    "finding:IR-2041:F-04",
    "RELATED_TO",
    "Confirmed",
    "Existing Phase 2 containment investigation.",
  );
  relationship(
    `incident:${inc}`,
    id("A-09"),
    "RELATED_TO",
    "Confirmed",
    "Explicit incident association.",
  );
  relationship(
    `incident:${inc}`,
    id("SYS-CUSTOMER-DB"),
    "RELATED_TO",
    "Confirmed",
    "Explicit incident association.",
  );
  // The same account in another incident has its own independent assessment and no customer-group assignment.
  associate(id("A-09"), "IR-2042");
  associate(id("ID-SSO"), "IR-2042");
  const otherKey = "acme:IR-2042";
  const otherAssessment = `${otherKey}:${id("A-09")}:Compromise`;
  if (!ctx.db.scopeAssessments.id.find(otherAssessment))
    ctx.db.scopeAssessments.insert({
      id: otherAssessment,
      organizationId: org,
      incidentId: "IR-2042",
      incidentKey: otherKey,
      entityId: id("A-09"),
      dimension: "Compromise",
      status: "Investigating",
      description:
        "Independent account-owner review for IR-2042; no copied IR-2041 assessment.",
      findingId: "IR-2042:F-07",
      assessedBy: "maya",
      verifiedBy: "",
      verifiedAt: 0n,
      createdAt: at,
      updatedAt: at,
    });
  for (const incidentId of ["IR-2041", "IR-2042"])
    ctx.db.incidentEvents.insert({
      id: 0n,
      organizationId: org,
      incidentId,
      incidentKey: `acme:${incidentId}`,
      type: "scope",
      actorId: "maya",
      title: "Synthetic scope inventory registered",
      description:
        "Versioned inventory and preliminary assessments added. Group sizes and potential paths are not verified affected-record counts.",
      createdAt: at,
      observedAt: at,
      findingId: "",
      evidenceIds: incidentId === "IR-2041" ? '["EV-018"]' : "[]",
      status: "Synthetic inventory",
      previousValue: "",
      newValue: JSON.stringify({
        scopeEntityId: id("A-09"),
        seedVersion: version,
      }),
      correctsEventId: "",
    });
  ctx.db.scenarioSeeds.insert({ id: version, createdAt: at });
  reconcileInventoryAssociations(ctx);
  return { seeded: true, version, records: 1240 };
}

// Reconcile only fixed fixture-owned associations; never rewrite assessments or user work.
function reconcileInventoryAssociations(ctx: Ctx) {
  const at = BigInt(Date.parse("2026-11-07T09:30:00-06:00"));
  for (const incidentId of ["IR-2041", "IR-2042"]) {
    const k = `acme:${incidentId}`;
    let added = 0;
    for (const association of ctx.db.scopeAssociations.incidentKey.filter(k)) {
      if (association.createdBy !== "maya" || association.createdAt !== at)
        continue;
      const entity = ctx.db.scopeEntities.id.find(association.entityId);
      if (!entity || entity.organizationId !== "acme") continue;
      const id = `${k}:RELATED_TO:incident:${incidentId}:${entity.id}`;
      if (ctx.db.scopeRelationships.id.find(id)) continue;
      ctx.db.scopeRelationships.insert({
        id,
        organizationId: "acme",
        incidentId,
        incidentKey: k,
        sourceId: `incident:${incidentId}`,
        targetId: entity.id,
        type: "RELATED_TO",
        status: "Confirmed",
        justification:
          "Explicit synthetic inventory association; no compromise, access or impact implied.",
        evidenceIds: "[]",
        createdBy: "maya",
        createdAt: at,
      });
      added++;
    }
    if (added)
      ctx.db.incidentEvents.insert({
        id: 0n,
        organizationId: "acme",
        incidentId,
        incidentKey: k,
        type: "scope",
        actorId: "maya",
        title: "Scope inventory associations documented",
        description: `${added} missing fixture inventory associations linked to their existing incident. Assessments remain independent.`,
        createdAt: at,
        observedAt: at,
        findingId: "",
        evidenceIds: "[]",
        status: "Synthetic inventory",
        previousValue: "",
        newValue: JSON.stringify({
          scopeEntityId: "acme:scope:A-09",
          inventoryAssociations: added,
        }),
        correctsEventId: "",
      });
  }
}
