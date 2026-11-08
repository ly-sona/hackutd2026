import { canReadFinding } from "./coord-access";
import type { Ctx, Reader } from "./index";
import {
  appendEvent,
  incidentCommand,
  json,
  key,
  time,
  type Ports,
} from "./incident-domain";
import {
  assetTypes,
  relationshipTypes,
  impactTypes,
  impactStates,
  compromiseStates,
  categories,
  sensitivities,
  potentialLeads,
  calculateScope,
  type ScopeEntity,
} from "../../../shared/scope";
import { seedScope } from "./scope-seed";
type Access = {
  userId: string;
  organizationId: string;
  incidentId: string;
  permissions: string;
};
type Ref = Pick<
  ScopeEntity,
  | "id"
  | "organizationId"
  | "kind"
  | "reference"
  | "name"
  | "parentId"
  | "datasetId"
  | "groupId"
>;
const associationId = (k: string, id: string) => `${k}:${id}`;
function recordEntity(row: {
  id: string;
  organizationId: string;
  datasetId: string;
  groupId: string;
  reference: string;
  dataCategory: string;
  sensitivity: string;
}): ScopeEntity {
  return {
    ...row,
    kind: "Record",
    name: row.reference,
    description:
      "Synthetic individual record. Group membership and an access path do not establish individual access or exfiltration.",
    owner: "",
    assetType: "",
    parentId: row.groupId,
    recordCount: 1,
    countKnown: true,
    defaultVisible: false,
    createdBy: "seed",
    createdAt: "0",
    updatedAt: "0",
  };
}
export function scopeEntity(
  ctx: Reader,
  org: string,
  inc: string,
  id: string,
  p: Ports,
): Ref {
  const k = key(org, inc);
  const entity = ctx.db.scopeEntities.id.find(id);
  if (
    entity?.organizationId === org &&
    ctx.db.scopeAssociations.id.find(associationId(k, id))
  )
    return entity;
  const record = ctx.db.scopeRecords.id.find(id);
  if (
    record?.organizationId === org &&
    ctx.db.scopeAssociations.id.find(associationId(k, record.groupId))
  )
    return recordEntity(record);
  if (id.startsWith("evidence:")) {
    const e = ctx.db.evidence.id.find(id.slice(9));
    if (e?.incidentKey === k)
      return {
        id,
        organizationId: org,
        kind: "Evidence",
        reference: e.id,
        name: e.filename,
        parentId: "",
        datasetId: "",
        groupId: "",
      };
  }
  if (id.startsWith("finding:")) {
    if (ctx.db.coordinationFindings.id.find(id.slice(8)))
      return p.fail(
        "ACCESS_DENIED",
        "Conversation-derived findings must be reviewed in their source conversation.",
      );
    const f = ctx.db.findings.id.find(id.slice(8));
    if (f?.incidentKey === k)
      return {
        id,
        organizationId: org,
        kind: "Finding",
        reference: f.id,
        name: f.title,
        parentId: "",
        datasetId: "",
        groupId: "",
      };
  }
  if (id === `incident:${inc}` && ctx.db.incidents.id.find(k))
    return {
      id,
      organizationId: org,
      kind: "Incident",
      reference: inc,
      name: ctx.db.incidents.id.find(k)!.title,
      parentId: "",
      datasetId: "",
      groupId: "",
    };
  return p.fail(
    "NOT_FOUND",
    "Entity is unavailable in this organization and incident.",
  );
}
function input(d: Record<string, unknown>, p: Ports) {
  const text = (field: string, max = 200, optional = false) => {
    const v = d[field];
    if (optional && (v === undefined || v === "")) return "";
    if (typeof v !== "string" || !v.trim() || v.length > max)
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return v.trim();
  };
  const choice = (field: string, values: readonly string[]) => {
    const v = text(field);
    if (!values.includes(v))
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return v;
  };
  const ids = (field: string) => {
    const v = d[field] ?? [];
    if (
      !Array.isArray(v) ||
      v.length > 20 ||
      v.some((x) => typeof x !== "string" || x.length > 200)
    )
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return [...new Set(v)] as string[];
  };
  return { text, choice, ids };
}
function validateEvidence(
  ctx: Reader,
  hash: string,
  org: string,
  inc: string,
  ids: string[],
  p: Ports,
  at: bigint,
) {
  if (ids.length) p.authorize(ctx, hash, org, inc, "evidence:view", at);
  for (const id of ids)
    if (ctx.db.evidence.id.find(id)?.incidentKey !== key(org, inc))
      return p.fail(
        "INVALID_INPUT",
        "Supporting evidence must be from this incident.",
      );
}
function compatibility(type: string, source: Ref, target: Ref) {
  if (type === "RELATED_TO") return true;
  if (type === "CAN_ACCESS")
    return (
      source.kind === "Account" && ["System", "Dataset"].includes(target.kind)
    );
  if (type === "CONTAINS")
    return (
      (source.kind === "System" && target.kind === "Dataset") ||
      (source.kind === "Dataset" && target.kind === "Record Group") ||
      (source.kind === "Record Group" && target.kind === "Record")
    );
  if (type === "STORED_IN")
    return source.kind === "Dataset" && target.kind === "System";
  if (type === "DEPENDS_ON")
    return (
      ["System", "Business Operation"].includes(source.kind) &&
      target.kind === "System"
    );
  if (type === "SUPPORTS")
    return (
      source.kind === "Evidence" &&
      [
        "System",
        "Account",
        "Dataset",
        "Record Group",
        "Record",
        "Finding",
      ].includes(target.kind)
    );
  return (
    type === "POTENTIALLY_AFFECTS" &&
    ["Account", "System", "Dataset", "Record Group"].includes(source.kind) &&
    [
      "System",
      "Dataset",
      "Record Group",
      "Record",
      "Business Operation",
    ].includes(target.kind)
  );
}
export function scopeCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  if (action === "scope.seed") return seedScope(ctx, p);
  const { text, choice, ids } = input(d, p),
    org = text("organizationId", 100),
    inc = text("incidentId", 100),
    k = key(org, inc),
    at = time(ctx);
  const { actor } = p.authorize(ctx, hash, org, inc, "scope:edit", at),
    who = actor.userId;
  if (!ctx.db.incidents.id.find(k))
    return p.fail("NOT_FOUND", "Incident not found.");
  const scope = { organizationId: org, incidentId: inc, incidentKey: k };
  const event = (
    title: string,
    description: string,
    entityId: string,
    previous: unknown,
    next: unknown,
    evidenceIds: string[] = [],
  ) =>
    appendEvent(ctx, org, inc, who, "scope", title, description, {
      evidenceIds: json(evidenceIds),
      previousValue: previous ? json(previous) : "",
      newValue: json({ scopeEntityId: entityId, ...(next as object) }),
      status: "Documented",
    });
  if (action === "scope.asset.create" || action === "scope.asset.update") {
    const old = action.endsWith("update")
      ? ctx.db.scopeEntities.id.find(text("entityId"))
      : undefined;
    if (action.endsWith("update")) {
      scopeEntity(ctx, org, inc, text("entityId"), p);
      if (
        !old ||
        !["Account", "System", "Business Operation"].includes(old.kind)
      )
        return p.fail("INVALID_INPUT", "Select an asset.");
    }
    const name = text("name"),
      description = text("description", 4000),
      owner = text("owner", 200, true),
      assetType = old?.assetType ?? choice("assetType", assetTypes),
      reference = old?.reference ?? text("reference", 60),
      status = choice("status", compromiseStates),
      evidenceIds = ids("evidenceIds"),
      justification = text("justification", 2000);
    if (!/^[A-Za-z0-9_.-]{1,60}$/.test(reference))
      return p.fail(
        "INVALID_INPUT",
        "Use letters, numbers, dots, underscores or hyphens for the asset identifier.",
      );
    const id = old?.id ?? `${org}:scope:${reference}`;
    if (!old && ctx.db.scopeEntities.id.find(id))
      return p.fail(
        "CONFLICT",
        "Asset identifier already exists. Associate the existing asset instead.",
      );
    validateEvidence(ctx, hash, org, inc, evidenceIds, p, at);
    if (status === "Confirmed Compromise") {
      p.authorize(ctx, hash, org, inc, "scope:verify", at);
      if (!evidenceIds.length)
        return p.fail(
          "INVALID_INPUT",
          "Confirmed compromise requires supporting evidence.",
        );
    }
    const previous = ctx.db.scopeAssessments.id.find(`${k}:${id}:Compromise`);
    const entity = {
      id,
      organizationId: org,
      kind: assetType.includes("account")
        ? "Account"
        : assetType === "Business service"
          ? "Business Operation"
          : "System",
      reference,
      name,
      description,
      owner,
      assetType,
      parentId: "",
      datasetId: "",
      groupId: "",
      dataCategory: "Other",
      sensitivity: "Internal",
      recordCount: 0,
      countKnown: false,
      defaultVisible: true,
      createdBy: old?.createdBy ?? who,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    if (old) ctx.db.scopeEntities.id.update(entity);
    else {
      ctx.db.scopeEntities.insert(entity);
      ctx.db.scopeAssociations.insert({
        id: associationId(k, id),
        ...scope,
        entityId: id,
        createdBy: who,
        createdAt: at,
      });
      ctx.db.scopeRelationships.insert({
        id: `${k}:RELATED_TO:incident:${inc}:${id}`,
        ...scope,
        sourceId: `incident:${inc}`,
        targetId: id,
        type: "RELATED_TO",
        status: "Confirmed",
        justification: "Incident inventory association; no compromise implied.",
        evidenceIds: "[]",
        createdBy: who,
        createdAt: at,
      });
    }
    const assessment = {
      id: `${k}:${id}:Compromise`,
      ...scope,
      entityId: id,
      dimension: "Compromise",
      status,
      description: justification,
      findingId: "",
      assessedBy: who,
      verifiedBy: status === "Confirmed Compromise" ? who : "",
      verifiedAt: status === "Confirmed Compromise" ? at : 0n,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
    };
    if (previous) ctx.db.scopeAssessments.id.update(assessment);
    else ctx.db.scopeAssessments.insert(assessment);
    for (const evidenceId of evidenceIds)
      ctx.db.scopeEvidenceLinks.insert({
        id: ctx.newUuidV4().toString(),
        ...scope,
        entityId: id,
        assessmentId: assessment.id,
        evidenceId,
        annotation: justification,
        excerpt: "",
        createdBy: who,
        createdAt: at,
      });
    event(
      old ? "Asset updated: " + name : "Asset added: " + name,
      justification,
      id,
      old ? { entity: old, assessment: previous } : undefined,
      { entity, assessment },
      evidenceIds,
    );
    return { entityId: id };
  }
  if (action === "scope.associate") {
    const id = text("entityId"),
      entity = ctx.db.scopeEntities.id.find(id),
      justification = text("justification", 2000);
    if (
      !entity ||
      entity.organizationId !== org ||
      !["Account", "System", "Business Operation"].includes(entity.kind)
    )
      return p.fail("INVALID_INPUT", "Select an asset from this organization.");
    if (ctx.db.scopeAssociations.id.find(associationId(k, id)))
      return p.fail("CONFLICT", "Asset is already associated.");
    ctx.db.scopeAssociations.insert({
      id: associationId(k, id),
      ...scope,
      entityId: id,
      createdBy: who,
      createdAt: at,
    });
    ctx.db.scopeRelationships.insert({
      id: `${k}:RELATED_TO:incident:${inc}:${id}`,
      ...scope,
      sourceId: `incident:${inc}`,
      targetId: id,
      type: "RELATED_TO",
      status: "Confirmed",
      justification,
      evidenceIds: "[]",
      createdBy: who,
      createdAt: at,
    });
    event("Asset associated: " + entity.name, justification, id, null, {
      entityId: id,
    });
    return { entityId: id };
  }
  if (action === "scope.relationship") {
    const source = scopeEntity(ctx, org, inc, text("sourceId"), p),
      target = scopeEntity(ctx, org, inc, text("targetId"), p),
      type = choice("type", relationshipTypes),
      status = choice("status", [
        "Unverified",
        "Suspected",
        "Confirmed",
        "Ruled Out",
      ]),
      justification = text("justification", 2000),
      evidenceIds = ids("evidenceIds");
    if (source.id === target.id || !compatibility(type, source, target))
      return p.fail(
        "INVALID_INPUT",
        "Relationship is incompatible with the selected entity types.",
      );
    if (source.kind === "Record" || target.kind === "Record")
      p.authorize(ctx, hash, org, inc, "scope:records", at);
    if (source.kind === "Evidence") evidenceIds.push(source.reference);
    if (target.kind === "Evidence") evidenceIds.push(target.reference);
    validateEvidence(ctx, hash, org, inc, evidenceIds, p, at);
    if (status === "Confirmed") {
      p.authorize(ctx, hash, org, inc, "scope:verify", at);
      if (!evidenceIds.length)
        return p.fail(
          "INVALID_INPUT",
          "Verified relationships require evidence.",
        );
    }
    const id = `${k}:${type}:${source.id}:${target.id}`;
    if (
      ctx.db.scopeRelationships.id.find(id) ||
      (type === "CONTAINS" &&
        ctx.db.scopeRecordMemberships.id.find(`${source.id}:${target.id}`))
    )
      return p.fail("CONFLICT", "This relationship already exists.");
    if (
      type === "CONTAINS" &&
      target.kind === "Record" &&
      target.datasetId !== source.datasetId
    )
      return p.fail(
        "INVALID_INPUT",
        "Record and group must belong to the same dataset.",
      );
    const row = {
      id,
      ...scope,
      sourceId: source.id,
      targetId: target.id,
      type,
      status,
      justification,
      evidenceIds: json(evidenceIds),
      createdBy: who,
      createdAt: at,
    };
    ctx.db.scopeRelationships.insert(row);
    if (type === "CONTAINS" && target.kind === "Record")
      ctx.db.scopeRecordMemberships.insert({
        id: `${source.id}:${target.id}`,
        organizationId: org,
        groupId: source.id,
        recordId: target.id,
      });
    event(
      "Relationship added: " + type,
      justification,
      source.id,
      null,
      { relationship: row },
      evidenceIds,
    );
    return { relationshipId: id };
  }
  if (action === "scope.assessment") {
    const entity = scopeEntity(ctx, org, inc, text("entityId"), p),
      dimension = choice("dimension", impactTypes),
      status = choice(
        "status",
        dimension === "Compromise" ? compromiseStates : impactStates,
      ),
      description = text("description", 4000),
      justification = text("justification", 2000),
      evidenceIds = ids("evidenceIds"),
      findingId = text("findingId", 200, true),
      annotation = text("annotation", 2000, true),
      excerpt = text("excerpt", 2000, true);
    if (
      ["Evidence", "Finding", "Incident"].includes(entity.kind) ||
      (dimension === "Compromise" &&
        !["Account", "System", "Business Operation"].includes(entity.kind))
    )
      return p.fail(
        "INVALID_INPUT",
        "Choose an impact dimension applicable to this entity.",
      );
    if (entity.kind === "Record")
      p.authorize(ctx, hash, org, inc, "scope:records", at);
    validateEvidence(ctx, hash, org, inc, evidenceIds, p, at);
    if (
      findingId &&
      (ctx.db.coordinationFindings.id.find(findingId) ||
        ctx.db.findings.id.find(findingId)?.incidentKey !== k)
    )
      return p.fail(
        "INVALID_INPUT",
        "Related finding must belong to this incident.",
      );
    if (status === "Confirmed" || status === "Confirmed Compromise") {
      p.authorize(ctx, hash, org, inc, "scope:verify", at);
      if (!evidenceIds.length)
        return p.fail(
          "INVALID_INPUT",
          "Confirmation requires existing supporting evidence and human verification.",
        );
    }
    const id = `${k}:${entity.id}:${dimension}`,
      old = ctx.db.scopeAssessments.id.find(id);
    const row = {
      id,
      ...scope,
      entityId: entity.id,
      dimension,
      status,
      description,
      findingId,
      assessedBy: who,
      verifiedBy: status.startsWith("Confirmed") ? who : "",
      verifiedAt: status.startsWith("Confirmed") ? at : 0n,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    if (old) ctx.db.scopeAssessments.id.update(row);
    else ctx.db.scopeAssessments.insert(row);
    for (const evidenceId of evidenceIds)
      ctx.db.scopeEvidenceLinks.insert({
        id: ctx.newUuidV4().toString(),
        ...scope,
        entityId: entity.id,
        assessmentId: id,
        evidenceId,
        annotation: annotation || justification,
        excerpt,
        createdBy: who,
        createdAt: at,
      });
    event(
      `${dimension} assessment ${old ? "updated" : "added"}: ${entity.name}`,
      `${description}\nJustification: ${justification}`,
      entity.id,
      old,
      { assessment: row },
      evidenceIds,
    );
    return { assessmentId: id };
  }
  if (action === "scope.evidence.link") {
    const id = text("entityId"),
      entity = scopeEntity(ctx, org, inc, id, p),
      evidenceId = text("evidenceId", 200),
      assessmentId = text("assessmentId", 600, true),
      annotation = text("annotation", 2000),
      excerpt = text("excerpt", 2000, true);
    if (entity.kind === "Record")
      p.authorize(ctx, hash, org, inc, "scope:records", at);
    validateEvidence(ctx, hash, org, inc, [evidenceId], p, at);
    if (assessmentId) {
      const assessment = ctx.db.scopeAssessments.id.find(assessmentId);
      if (assessment?.incidentKey !== k || assessment.entityId !== id)
        return p.fail(
          "INVALID_INPUT",
          "Assessment does not belong to this entity.",
        );
    }
    const row = {
      id: ctx.newUuidV4().toString(),
      ...scope,
      entityId: id,
      assessmentId,
      evidenceId,
      annotation,
      excerpt,
      createdBy: who,
      createdAt: at,
    };
    ctx.db.scopeEvidenceLinks.insert(row);
    event(
      "Scope evidence linked: " + entity.name,
      annotation,
      id,
      null,
      { link: row },
      [evidenceId],
    );
    return { linkId: row.id };
  }
  if (action === "scope.finding") {
    const entity = scopeEntity(ctx, org, inc, text("entityId"), p);
    if (entity.kind === "Record")
      p.authorize(ctx, hash, org, inc, "scope:records", at);
    const result = incidentCommand(
      ctx,
      "incident.finding.create",
      hash,
      d,
      p,
    ) as { findingId: string };
    ctx.db.scopeRelationships.insert({
      id: ctx.newUuidV4().toString(),
      ...scope,
      sourceId: entity.id,
      targetId: `finding:${result.findingId}`,
      type: "RELATED_TO",
      status: "Confirmed",
      justification:
        "Responder explicitly linked this functional Phase 2 finding.",
      evidenceIds: "[]",
      createdBy: who,
      createdAt: at,
    });
    event(
      "Scope finding linked: " + entity.name,
      "Follow-up investigation finding recorded.",
      entity.id,
      null,
      { findingId: result.findingId },
    );
    return result;
  }
  return p.fail("INVALID_INPUT", "Unknown scope action.");
}
export function scopeSnapshot(ctx: Reader, org: string, inc: string) {
  const k = key(org, inc),
    associations = [...ctx.db.scopeAssociations.incidentKey.filter(k)],
    entities = associations.flatMap((a) => {
      const e = ctx.db.scopeEntities.id.find(a.entityId);
      return e?.organizationId === org ? [e] : [];
    }),
    relationships = [...ctx.db.scopeRelationships.incidentKey.filter(k)],
    assessments = [...ctx.db.scopeAssessments.incidentKey.filter(k)],
    links = [...ctx.db.scopeEvidenceLinks.incidentKey.filter(k)];
  const records = entities
    .filter((e) => e.kind === "Dataset")
    .flatMap((e) =>
      [...ctx.db.scopeRecords.datasetId.filter(e.id)].filter(
        (r) => r.organizationId === org,
      ),
    );
  const memberships = entities
    .filter((e) => e.kind === "Record Group")
    .flatMap((e) =>
      [...ctx.db.scopeRecordMemberships.groupId.filter(e.id)].filter(
        (m) => m.organizationId === org,
      ),
    );
  const leads = potentialLeads(entities, relationships, assessments),
    summary = calculateScope(
      entities,
      records,
      memberships,
      assessments,
      leads,
    );
  return {
    entities,
    relationships,
    assessments,
    links,
    records,
    memberships,
    leads,
    summary,
  };
}
export function scopeProjection(ctx: Reader, access: Access[]) {
  const rows: {
      id: string;
      kind: string;
      organizationId: string;
      incidentId: string;
      body: string;
    }[] = [],
    seen = new Set<string>();
  for (const a of access) {
    const k = key(a.organizationId, a.incidentId);
    if (seen.has(k)) continue;
    seen.add(k);
    const allowed = JSON.parse(a.permissions) as string[];
    if (!allowed.includes("scope:view")) continue;
    const s = scopeSnapshot(ctx, a.organizationId, a.incidentId),
      canRecords = allowed.includes("scope:records");
    const emit = (kind: string, id: string, value: unknown) =>
      rows.push({
        id: `${k}:${kind}:${id}`,
        kind,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        body: json(value),
      });
    for (const e of s.entities) emit("entity", e.id, e);
    const entityIds = new Set(s.entities.map((e) => e.id));
    // Reuse actual Phase 2 records for virtual nodes. No duplicate incident/finding/evidence stores.
    const virtual = (
      kind: string,
      id: string,
      reference: string,
      name: string,
      description: string,
    ) => {
      entityIds.add(id);
      emit("entity", id, {
        id,
        organizationId: a.organizationId,
        kind,
        reference,
        name,
        description,
        owner: "",
        assetType: "",
        parentId: "",
        datasetId: "",
        groupId: "",
        dataCategory: "Other",
        sensitivity: "Internal",
        recordCount: 0,
        countKnown: false,
        defaultVisible: kind === "Evidence" && reference === "EV-018",
        createdBy: "",
        createdAt: "0",
        updatedAt: "0",
      });
    };
    const incident = ctx.db.incidents.id.find(k);
    if (incident)
      virtual(
        "Incident",
        `incident:${a.incidentId}`,
        a.incidentId,
        incident.title,
        incident.description,
      );
    for (const f of ctx.db.findings.incidentKey.filter(k))
      if (canReadFinding(ctx, a, f.id))
        virtual("Finding", `finding:${f.id}`, f.id, f.title, f.description);
    if (allowed.includes("evidence:view"))
      for (const e of ctx.db.evidence.incidentKey.filter(k))
        virtual(
          "Evidence",
          `evidence:${e.id}`,
          e.id,
          e.filename,
          e.description,
        );
    const anchor = s.records.find((r) => r.reference === "C-1044");
    if (canRecords && anchor) {
      emit("entity", anchor.id, {
        ...recordEntity(anchor),
        defaultVisible: true,
      });
      entityIds.add(anchor.id);
      for (const m of s.memberships.filter((m) => m.recordId === anchor.id))
        if (
          !ctx.db.scopeRelationships.id.find(
            `${k}:CONTAINS:${m.groupId}:${m.recordId}`,
          )
        )
          emit("relationship", m.id, membershipRelationship(m, a.incidentId));
    }
    for (const r of s.relationships)
      if (entityIds.has(r.sourceId) && entityIds.has(r.targetId))
        emit(
          "relationship",
          r.id,
          allowed.includes("evidence:view") ? r : { ...r, evidenceIds: "[]" },
        );
    for (const r of s.assessments)
      if (canRecords || !s.records.some((record) => record.id === r.entityId))
        emit("assessment", r.id, r);
    if (allowed.includes("evidence:view"))
      for (const l of s.links)
        if (canRecords || !s.records.some((record) => record.id === l.entityId))
          emit("evidenceLink", l.id, l);
    for (const l of s.leads) emit("lead", l.entityId, l);
    emit("summary", k, s.summary);
  }
  return rows;
}
function membershipRelationship(
  m: { id: string; organizationId: string; groupId: string; recordId: string },
  incidentId: string,
) {
  return {
    id: `membership:${m.id}`,
    organizationId: m.organizationId,
    incidentId,
    sourceId: m.groupId,
    targetId: m.recordId,
    type: "CONTAINS",
    status: "Confirmed",
    justification:
      "Explicit synthetic group membership; no impact or access implied.",
    evidenceIds: "[]",
    createdBy: "seed",
    createdAt: "0",
  };
}
export function scopeRead(
  ctx: Reader,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
  at: bigint,
): unknown {
  const { text } = input(d, p),
    org = text("organizationId", 100),
    inc = text("incidentId", 100),
    operation = text("operation", 30);
  p.authorize(
    ctx,
    hash,
    org,
    inc,
    operation === "inventory"
      ? "scope:edit"
      : operation === "records"
        ? "scope:records"
        : "scope:view",
    at,
  );
  if (!ctx.db.incidents.id.find(key(org, inc)))
    return p.fail("NOT_FOUND", "Incident not found.");
  if (operation === "inventory")
    return [...ctx.db.scopeEntities.organizationId.filter(org)].filter((e) =>
      ["System", "Account", "Business Operation"].includes(e.kind),
    );
  if (operation === "entity") {
    const id = text("entityId"),
      ref = scopeEntity(ctx, org, inc, id, p);
    if (ref.kind === "Evidence")
      p.authorize(ctx, hash, org, inc, "evidence:view", at);
    if (ref.kind === "Record")
      p.authorize(ctx, hash, org, inc, "scope:records", at);
    const record = ctx.db.scopeRecords.id.find(id);
    if (!record)
      return {
        entity: ctx.db.scopeEntities.id.find(id) ?? ref,
        relationships: [],
      };
    const groups = [
      ...ctx.db.scopeRecordMemberships.recordId.filter(id),
    ].filter((m) =>
      ctx.db.scopeAssociations.id.find(associationId(key(org, inc), m.groupId)),
    );
    return {
      entity: recordEntity(record),
      relationships: groups.map(
        (m) =>
          ctx.db.scopeRelationships.id.find(
            `${key(org, inc)}:CONTAINS:${m.groupId}:${m.recordId}`,
          ) ?? membershipRelationship(m, inc),
      ),
    };
  }
  if (operation === "records") {
    const group = scopeEntity(ctx, org, inc, text("groupId"), p);
    if (group.kind !== "Record Group")
      return p.fail("INVALID_INPUT", "Select a record group.");
    const query = text("query", 100, true).toLowerCase(),
      dimension = text("dimension", 30, true),
      status = text("status", 40, true),
      offset = Number(d.offset ?? 0),
      limit = Number(d.limit ?? 25);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (dimension &&
        !impactTypes.includes(dimension as (typeof impactTypes)[number])) ||
      (status &&
        !impactStates.includes(status as (typeof impactStates)[number]))
    )
      return p.fail("INVALID_INPUT", "Invalid record query or pagination.");
    const assessments = [
      ...ctx.db.scopeAssessments.incidentKey.filter(key(org, inc)),
    ];
    const all = [...ctx.db.scopeRecordMemberships.groupId.filter(group.id)]
      .flatMap((m) => {
        const r = ctx.db.scopeRecords.id.find(m.recordId);
        return r?.organizationId === org && r.datasetId === group.datasetId
          ? [r]
          : [];
      })
      .sort((a, b) => a.reference.localeCompare(b.reference));
    const filtered = all.filter(
      (r) =>
        (!query || r.reference.toLowerCase().includes(query)) &&
        (!status ||
          assessments.some(
            (a) =>
              a.entityId === r.id &&
              (!dimension || a.dimension === dimension) &&
              a.status === status,
          ) ||
          (status === "Unassessed" &&
            !assessments.some(
              (a) =>
                a.entityId === r.id &&
                (!dimension || a.dimension === dimension) &&
                a.status !== "Unassessed",
            ))),
    );
    return {
      records: filtered.slice(offset, offset + limit).map(recordEntity),
      total: filtered.length,
      totalInGroup: all.length,
      offset,
      limit,
    };
  }
  return p.fail("INVALID_INPUT", "Unknown scope read operation.");
}
