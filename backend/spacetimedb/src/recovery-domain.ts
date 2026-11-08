import type { Ctx, Reader } from "./index";
import { appendEvent, type Ports } from "./incident-domain";
import {
  createCoordinationTask,
  linkAutomatedTaskEvidence,
  notifyCoordination,
} from "./coord-domain";
import {
  has,
  currentAccess,
  associated,
  input,
  checkedEvidence,
  recoveryActor,
  recoveryId,
  deriveWarnings,
  operationReadiness,
  incidentContext,
  scoped,
  key,
  json,
  time,
  clock,
} from "./recovery-access";
import {
  approvalPolicies,
  policySatisfied,
  type ApprovalPolicy,
  attackVectors,
  actorCategories,
  actionCategories,
  techniqueCatalog,
} from "../../../shared/recovery";
import { seedRecovery } from "./recovery-seed";
import {
  reportAllowed,
  reportCommand,
  snapshotReport,
} from "./recovery-reports";
type Access = {
  organizationId: string;
  incidentId: string;
  userId: string;
  permissions: string;
};
type Request = NonNullable<
  ReturnType<Ctx["db"]["approvalRequests"]["id"]["find"]>
>;
type Execution = NonNullable<
  ReturnType<Ctx["db"]["recoveryExecutions"]["id"]["find"]>
>;
function event(
  ctx: Ctx,
  r: { organizationId: string; incidentId: string },
  who: string,
  type: string,
  title: string,
  description: string,
) {
  return appendEvent(
    ctx,
    r.organizationId,
    r.incidentId,
    who,
    type,
    title,
    description,
  );
}
function notify(
  ctx: Ctx,
  r: Request | Execution,
  title: string,
  description: string,
  roles?: readonly string[],
) {
  const at = time(ctx);
  for (const m of ctx.db.incidentMemberships.organizationId.filter(
    r.organizationId,
  ))
    if (m.incidentId === r.incidentId) {
      const a = currentAccess(
          ctx,
          r.organizationId,
          r.incidentId,
          m.userId,
          at,
        ),
        role = ctx.db.memberships.id.find(
          `${r.organizationId}:${m.userId}`,
        )?.role;
      if (
        a &&
        has(a, "operations:view") &&
        (!roles || roles.includes(role ?? ""))
      )
        notifyCoordination(ctx, r, m.userId, "recovery", title, description);
    }
}
function eligible(ctx: Reader, r: Request, at: bigint) {
  return [...ctx.db.approvalDecisions.requestId.filter(r.id)].map((d) => {
    const a = currentAccess(ctx, r.organizationId, r.incidentId, d.userId, at),
      role = ctx.db.memberships.id.find(
        `${r.organizationId}:${d.userId}`,
      )?.role;
    return {
      ...d,
      eligible:
        has(a, "approvals:decide") &&
        role === d.role &&
        d.revisionToken ===
          `${r.revisionToken}:${ctx.db.memberships.id.find(`${r.organizationId}:${d.userId}`)?.updatedAt.microsSinceUnixEpoch}`,
    };
  });
}
function requesterEligible(ctx: Reader, r: Request, at: bigint) {
  return has(
    currentAccess(ctx, r.organizationId, r.incidentId, r.requestedBy, at),
    r.actionType === "close_incident"
      ? "reports:export"
      : r.executionId
        ? "recovery:start"
        : "operations:request",
  );
}
function validContext(ctx: Reader, r: Request) {
  return (
    !r.contextFingerprint ||
    r.contextFingerprint ===
      incidentContext(ctx, r.organizationId, r.incidentId)
  );
}
function newApproval(
  ctx: Ctx,
  e: Execution,
  title: string,
  policy: ApprovalPolicy,
  at: bigint,
) {
  const id = recoveryId(ctx, (id) => !!ctx.db.approvalRequests.id.find(id));
  const r = ctx.db.approvalRequests.insert({
    id,
    ...scoped(e.organizationId, e.incidentId),
    displayReference: `RC-${id.slice(-8)}`,
    title,
    description:
      "Approve the immutable procedure version, parameters, evidence and current trust context. Execution is a labeled simulation.",
    operationId: e.operationId,
    executionId: e.id,
    actionType: e.kind,
    policy,
    sensitivity: approvalPolicies[policy].sensitivity,
    requestedBy: e.requestedBy,
    justification: JSON.parse(e.parameters).justification,
    evidenceIds: e.triggerEvidenceIds,
    affectedEntityIds: json([e.operationId]),
    parameters: e.parameters,
    contextFingerprint: e.contextFingerprint,
    revisionToken: ctx.newUuidV7().toString(),
    status: "Pending",
    createdAt: at,
    expiresAt: at + 3_600_000n,
    completedAt: 0n,
    result: "",
  });
  notify(
    ctx,
    r,
    "Approval required: " + title,
    `Request ${r.displayReference}. Separate authorized reviewers are required.`,
    approvalPolicies[policy].roles,
  );
  event(
    ctx,
    r,
    e.requestedBy,
    "approval",
    "Recovery approval requested",
    `${r.displayReference}: ${title}.`,
  );
  return id;
}
export function recoveryCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  data: Record<string, unknown>,
  p: Ports,
): unknown {
  const at = time(ctx);
  if (action === "recovery.seed") return seedRecovery(ctx, data, p);
  if (action === "recovery.demo.profile") {
    if (
      ctx.env.AEGIS_DEVELOPMENT_MODE !== "true" &&
      ctx.env.AEGIS_TEST_MODE !== "true"
    )
      return p.fail(
        "ACCESS_DENIED",
        "Development fixture control is disabled.",
      );
    const i = input(data, p),
      profile = i.choice("profile", ["success", "failure"]),
      id = key(i.text("organizationId"), i.text("incidentId")),
      row = ctx.db.recoverySimulationState.id.find(id);
    if (!row) return p.fail("NOT_FOUND", "Synthetic scenario is not seeded.");
    ctx.db.recoverySimulationState.id.update({
      ...row,
      profile,
      updatedAt: at,
    });
    return { profile };
  }
  if (action.startsWith("recovery.test.")) {
    if (ctx.env.AEGIS_TEST_MODE !== "true")
      return p.fail("ACCESS_DENIED", "Test fixtures are disabled.");
    const i = input(data, p),
      id = i.text("id");
    if (action === "recovery.test.expire_approval") {
      const r = ctx.db.approvalRequests.id.find(id);
      if (!r) return p.fail("NOT_FOUND", "Request not found.");
      ctx.db.approvalRequests.id.update({ ...r, expiresAt: at - 1n });
      return {};
    }
    if (action === "recovery.test.expire_access") {
      const r = ctx.db.fallbackAccess.id.find(id);
      if (!r) return p.fail("NOT_FOUND", "Grant not found.");
      ctx.db.fallbackAccess.id.update({ ...r, expiresAt: at - 1n });
      return {};
    }
    return p.fail("INVALID_INPUT", "Unknown test fixture.");
  }
  if (action.startsWith("recovery.report."))
    return reportCommand(ctx, action, hash, data, p, at);
  const i = input(data, p),
    org = i.text("organizationId"),
    inc = i.text("incidentId"),
    k = key(org, inc);
  const permission =
    action === "recovery.close"
      ? "reports:export"
      : action === "recovery.start"
        ? "recovery:start"
        : action === "recovery.decide"
          ? "approvals:decide"
          : action === "recovery.trust"
            ? "trust:manage"
            : action === "recovery.classification"
              ? "classification:edit"
              : action === "recovery.legal"
                ? "legal:edit"
                : "recovery:manage";
  const { who, access } = recoveryActor(ctx, hash, org, inc, permission, p, at);
  // Stable operation UUIDs prevent double clicks, retries and reconnects from duplicating successful commands.
  const operationId = i.text("operationId"),
    operationKey = `${who}:${operationId}`;
  if (!/^[a-f0-9-]{36}$/i.test(operationId))
    return p.fail(
      "INVALID_INPUT",
      "A stable client operation UUID is required.",
    );
  const fingerprint = json({ action, data }),
    prior = ctx.db.recoveryOperations.id.find(operationKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      return p.fail(
        "CONFLICT",
        "Operation ID was already used for different content.",
      );
    return JSON.parse(prior.result);
  }
  const done = (result: unknown) => {
    ctx.db.recoveryOperations.insert({
      id: operationKey,
      action,
      fingerprint,
      result: json(result),
      createdAt: at,
    });
    return result;
  };
  if (action === "recovery.close") {
    const incident = ctx.db.incidents.id.find(k),
      reason = i.text("justification", 3000),
      evidenceIds = i.ids("evidenceIds");
    if (!incident || incident.status === "Closed")
      return p.fail("CONFLICT", "Incident is unavailable or already closed.");
    if (!has(access, "evidence:view"))
      return p.fail(
        "ACCESS_DENIED",
        "Closing requests require evidence access.",
      );
    checkedEvidence(ctx, org, inc, evidenceIds, p);
    if (!evidenceIds.length)
      return p.fail(
        "INVALID_INPUT",
        "Closure requires linked evidence and an explicit decision.",
      );
    if (
      [...ctx.db.approvalRequests.incidentKey.filter(k)].some(
        (r) =>
          r.actionType === "close_incident" &&
          ["Pending", "Approved"].includes(r.status),
      )
    )
      return p.fail("CONFLICT", "A closure request is already pending.");
    const id = recoveryId(ctx, (id) => !!ctx.db.approvalRequests.id.find(id));
    const r = ctx.db.approvalRequests.insert({
      id,
      ...scoped(org, inc),
      displayReference: `CL-${id.slice(-8)}`,
      title: "Close incident",
      description:
        "Separate human-approved closure. This never clears findings or scope assessments.",
      operationId: "",
      executionId: "",
      actionType: "close_incident",
      policy: "close_incident",
      sensitivity: "Critical",
      requestedBy: who,
      justification: reason,
      evidenceIds: json(evidenceIds),
      affectedEntityIds: "[]",
      parameters: json({ incidentUpdatedAt: incident.updatedAt }),
      contextFingerprint: incidentContext(ctx, org, inc),
      revisionToken: ctx.newUuidV7().toString(),
      status: "Pending",
      createdAt: at,
      expiresAt: at + 3600000n,
      completedAt: 0n,
      result: "",
    });
    event(ctx, r, who, "approval", "Incident closure requested", reason);
    notify(
      ctx,
      r,
      "Incident closure requires independent approval",
      reason,
      approvalPolicies.close_incident.roles,
    );
    return done({ requestId: id });
  }
  if (action === "recovery.start") {
    const templateId = i.text("templateId"),
      template = ctx.db.recoveryTemplates.id.find(`${templateId}@1`),
      entityId = i.text("entityId"),
      operation = ctx.db.businessOperations.id.find(`${k}:${entityId}`),
      justification = i.text("justification", 3000),
      beneficiaries = i.ids("beneficiaryIds", 10),
      parentId = i.text("parentExecutionId", 100, true),
      retryId = i.text("retryOfExecutionId", 100, true);
    if (
      !template?.approved ||
      !operation ||
      !associated(ctx, org, inc, entityId) ||
      !entityId.endsWith(":OP-SUPPORT")
    )
      return p.fail(
        "INVALID_INPUT",
        "The predefined procedure is unavailable for this operation.",
      );
    if (
      [...ctx.db.recoveryExecutions.incidentKey.filter(k)].some(
        (e) =>
          e.operationId === entityId &&
          !["Succeeded", "Failed", "Canceled"].includes(e.state),
      )
    )
      return p.fail(
        "CONFLICT",
        "This operation already has an active recovery or fallback.",
      );
    const parent = parentId
        ? ctx.db.recoveryExecutions.id.find(parentId)
        : undefined,
      retry = retryId ? ctx.db.recoveryExecutions.id.find(retryId) : undefined;
    if (
      parentId &&
      (!parent ||
        parent.incidentKey !== k ||
        parent.operationId !== entityId ||
        parent.state !== "Failed" ||
        parent.kind !== "recovery")
    )
      return p.fail(
        "INVALID_INPUT",
        "Fallback must reference a failed recovery from this operation.",
      );
    if (
      retryId &&
      (!retry ||
        retry.incidentKey !== k ||
        retry.state !== "Failed" ||
        retry.templateId !== templateId)
    )
      return p.fail(
        "INVALID_INPUT",
        "Retry requires a matching failed procedure.",
      );
    if (
      template.kind === "fallback" &&
      (!beneficiaries.length ||
        beneficiaries.some(
          (user) =>
            !has(currentAccess(ctx, org, inc, user, at), "fallback:read"),
        ))
    )
      return p.fail(
        "INVALID_INPUT",
        "Every fallback beneficiary needs active incident membership and fallback access permission.",
      );
    const fixtures = [...ctx.db.recoveryFixtures.incidentKey.filter(k)],
      profile =
        template.kind === "fallback"
          ? "fallback"
          : ctx.db.recoverySimulationState.id.find(k)?.profile,
      fixture = fixtures.find((f) => f.outcome === profile);
    const assigned = [
      ...ctx.db.incidentMemberships.organizationId.filter(org),
    ].find(
      (m) =>
        m.incidentId === inc &&
        ctx.db.memberships.id.find(`${org}:${m.userId}`)?.role === "analyst" &&
        has(currentAccess(ctx, org, inc, m.userId, at), "tasks:update"),
    );
    if (!fixture || !assigned)
      return p.fail(
        "UNAVAILABLE",
        "A trusted synthetic verification fixture and active analyst are required.",
      );
    const evidenceIds = [
      ...new Set(
        deriveWarnings(ctx, org, inc)
          .filter(
            (w) =>
              w.entityId === entityId ||
              w.entityId.endsWith(":SYS-CUSTOMER-DB"),
          )
          .flatMap((w) => w.evidenceIds),
      ),
    ];
    checkedEvidence(ctx, org, inc, evidenceIds, p);
    const id = recoveryId(ctx, (id) => !!ctx.db.recoveryExecutions.id.find(id)),
      taskId = recoveryId(ctx, (id) => !!ctx.db.tasks.id.find(id)),
      parameters = json({
        justification,
        beneficiaryIds: beneficiaries,
        groupId: "acme:safe-support:v1",
        accessLevel: "Read Only",
        durationSeconds: 3600,
      });
    const e = ctx.db.recoveryExecutions.insert({
      id,
      ...scoped(org, inc),
      templateId,
      templateVersion: template.version,
      kind: template.kind,
      operationId: entityId,
      requestedBy: who,
      createdAt: at,
      updatedAt: at,
      completedAt: 0n,
      state: "Running",
      failureReason: "",
      approvalId: "",
      taskId,
      parentExecutionId: parentId,
      parameters,
      contextFingerprint: incidentContext(ctx, org, inc),
      triggerEvidenceIds: json(evidenceIds),
      triggerAssessmentIds: json(
        [...ctx.db.scopeAssessments.incidentKey.filter(k)].map((a) => a.id),
      ),
      result: "",
      step: 0,
      nextAt: at + 1000n,
      attempt: retry ? retry.attempt + 1 : 1,
      retryOfExecutionId: retryId,
    });
    ctx.db.recoveryExecutionInternals.insert({
      id,
      fixtureId: fixture.id,
      safeRecords: fixture.safeRecords,
    });
    for (const [order, type] of (
      JSON.parse(template.steps) as string[]
    ).entries())
      ctx.db.recoverySteps.insert({
        id: `${id}:${order}`,
        executionId: id,
        order,
        type,
        state: "Pending",
        startedAt: 0n,
        completedAt: 0n,
        result: "",
        evidenceId: "",
      });
    createCoordinationTask(
      ctx,
      {
        id: taskId,
        ...scoped(org, inc),
        title: `Investigate and review: ${template.name}`,
        description: `Review source trust and verification evidence for workflow ${id}. Acknowledgment and automated verification do not complete this investigation.`,
        kind: "Investigation",
        priority: "High",
        status: "Open",
        assignedUserId: assigned.userId,
        backupUserId: "",
        createdBy: who,
        createdAt: at,
        updatedAt: at,
        dueAt: 0n,
        verifiedBy: "",
        verifiedAt: 0n,
        relatedFindingId: "",
        sourceMessageId: 0n,
        sourceConversationId: "",
        references: json(evidenceIds.map((id) => ({ kind: "evidence", id }))),
      },
      who,
    );
    ctx.db.businessOperations.id.update({
      ...operation,
      status: "Recovering",
      activeExecutionId: id,
      updatedAt: at,
      updatedBy: who,
    });
    event(
      ctx,
      e,
      who,
      "recovery",
      `${template.name} started`,
      `Execution ${id}; template v${template.version}; ${justification}. Infrastructure action is simulated.`,
    );
    return done({ executionId: id });
  }
  if (action === "recovery.decide") {
    const r = ctx.db.approvalRequests.id.find(i.text("requestId")),
      decision = i.choice("decision", ["Approve", "Reject"]),
      justification = i.text("justification", 3000),
      revision = i.text("revisionToken");
    if (!r || r.incidentKey !== k)
      return p.fail("NOT_FOUND", "Approval request not found.");
    const spec = approvalPolicies[r.policy as ApprovalPolicy];
    if (
      !spec ||
      r.status !== "Pending" ||
      r.expiresAt <= at ||
      r.revisionToken !== revision ||
      !validContext(ctx, r) ||
      !requesterEligible(ctx, r, at) ||
      eligible(ctx, r, at).some((d) => !d.eligible)
    )
      return p.fail(
        "CONFLICT",
        "Request expired, changed or is no longer pending. Start a new reviewed request.",
      );
    const role = ctx.db.memberships.id.find(`${org}:${who}`)!.role;
    if (
      r.requestedBy === who ||
      !(spec.roles as readonly string[]).includes(role)
    )
      return p.fail(
        "ACCESS_DENIED",
        "An independent eligible approver is required.",
      );
    if (
      [...ctx.db.approvalDecisions.requestId.filter(r.id)].some(
        (d) => d.userId === who,
      )
    )
      return p.fail("CONFLICT", "You have already decided this request.");
    ctx.db.approvalDecisions.insert({
      id: `${r.id}:${who}`,
      requestId: r.id,
      userId: who,
      role,
      decision,
      justification,
      decidedAt: at,
      revisionToken: `${revision}:${ctx.db.memberships.id.find(`${org}:${who}`)!.updatedAt.microsSinceUnixEpoch}`,
    });
    const approved =
      decision === "Approve" &&
      policySatisfied(
        r.policy as ApprovalPolicy,
        r.requestedBy,
        eligible(ctx, r, at),
      );
    const status =
      decision === "Reject" ? "Rejected" : approved ? "Approved" : "Pending";
    ctx.db.approvalRequests.id.update({
      ...r,
      status,
      completedAt: status === "Pending" ? 0n : at,
    });
    event(
      ctx,
      r,
      who,
      "approval",
      `${r.displayReference}: ${decision}`,
      `${justification}. Request state: ${status}.`,
    );
    notify(
      ctx,
      r,
      "Approval decision recorded",
      `${r.displayReference}: ${status}.`,
    );
    return done({ status });
  }
  if (action === "recovery.cancel") {
    const e = ctx.db.recoveryExecutions.id.find(i.text("executionId")),
      reason = i.text("justification", 3000);
    if (!e || e.incidentKey !== k)
      return p.fail("NOT_FOUND", "Execution not found.");
    if (["Succeeded", "Failed", "Canceled"].includes(e.state))
      return p.fail("CONFLICT", "This execution is already terminal.");
    cancelExecution(ctx, e, reason, who, at);
    return done({ state: "Canceled" });
  }
  if (action === "recovery.trust") {
    const entityId = i.text("entityId"),
      category = i.choice("category", [
        "Do Not Use",
        "Use With Caution",
        "Available",
      ]),
      reason = i.text("justification", 3000),
      evidenceIds = i.ids("evidenceIds");
    if (
      !associated(ctx, org, inc, entityId) ||
      !has(access, "scope:verify") ||
      !has(access, "evidence:view")
    )
      return p.fail(
        "ACCESS_DENIED",
        "Technical verification permission and incident entity access are required.",
      );
    checkedEvidence(ctx, org, inc, evidenceIds, p);
    if (!evidenceIds.length)
      return p.fail(
        "INVALID_INPUT",
        "Trust decisions require linked evidence.",
      );
    const id = `${k}:${entityId}`,
      old = ctx.db.trustRestrictions.id.find(id),
      r = {
        id,
        ...scoped(org, inc),
        entityId,
        category,
        reason,
        evidenceIds: json(evidenceIds),
        active: category !== "Available",
        createdAt: old?.createdAt ?? at,
        updatedAt: at,
        updatedBy: who,
      };
    if (old) ctx.db.trustRestrictions.id.update(r);
    else ctx.db.trustRestrictions.insert(r);
    appendEvent(
      ctx,
      org,
      inc,
      who,
      "trust",
      `Trust restriction: ${category}`,
      reason,
      {
        evidenceIds: json(evidenceIds),
        previousValue: old ? json(old) : "",
        newValue: json(r),
      },
    );
    return done({ entityId });
  }
  if (action === "recovery.classification") {
    const old = ctx.db.incidentReportingMetadata.id.find(k),
      evidenceIds = i.ids("evidenceIds"),
      detectionSource = i.text("detectionSource", 300),
      initialObservation = i.text("initialObservation", 3000),
      attackVector = i.choice("attackVector", attackVectors),
      actorCategory = i.choice("actorCategory", actorCategories),
      actionCategory = i.choice("actionCategory", actionCategories),
      assetCategory = i.text("assetCategory", 300),
      impactCategory = i.text("impactCategory", 300),
      rootCause = i.text("rootCause", 3000, true),
      lessonsLearned = i.text("lessonsLearned", 3000, true),
      reportedAt = Number(data.reportedAt),
      maps = data.mitreMappings ?? [];
    if (
      !Number.isSafeInteger(reportedAt) ||
      reportedAt < 0 ||
      reportedAt > Number(at) ||
      !Array.isArray(maps) ||
      maps.length > 20
    )
      return p.fail("INVALID_INPUT", "Invalid reporting metadata.");
    checkedEvidence(ctx, org, inc, evidenceIds, p);
    for (const m of maps) {
      if (
        !m ||
        typeof m !== "object" ||
        typeof m.techniqueId !== "string" ||
        !Object.prototype.hasOwnProperty.call(
          techniqueCatalog,
          m.techniqueId,
        ) ||
        typeof m.findingId !== "string" ||
        ctx.db.findings.id.find(m.findingId)?.incidentKey !== k ||
        ctx.db.coordinationFindings.id.find(m.findingId) ||
        !Array.isArray(m.evidenceIds) ||
        !m.evidenceIds.length
      )
        return p.fail(
          "INVALID_INPUT",
          "ATT&CK mappings require a recognized technique, shared finding and evidence.",
        );
      checkedEvidence(ctx, org, inc, m.evidenceIds, p);
    }
    const row = {
      id: k,
      ...scoped(org, inc),
      detectionSource,
      reportedAt: BigInt(reportedAt),
      initialReporterId: old?.initialReporterId ?? who,
      initialObservation,
      attackVector,
      actorCategory,
      actionCategory,
      assetCategory,
      impactCategory,
      classificationEvidenceIds: json(evidenceIds),
      mitreMappings: json(maps),
      rootCause,
      lessonsLearned,
      updatedBy: who,
      updatedAt: at,
    };
    if (old) ctx.db.incidentReportingMetadata.id.update(row);
    else ctx.db.incidentReportingMetadata.insert(row);
    event(
      ctx,
      row,
      who,
      "classification",
      "Incident classification updated",
      "Human-authored classification and report metadata updated; unknown values remain explicit.",
    );
    return done({});
  }
  if (action === "recovery.legal") {
    const fields = [
      "jurisdictions",
      "informationCategories",
      "obligations",
      "notificationAssessment",
      "legalHold",
      "evidencePreservation",
      "clientNotification",
      "regulatoryNotification",
      "confidentiality",
      "privilegeDesignation",
      "reviewStatus",
    ] as const;
    const values = Object.fromEntries(
      fields.map((f) => [f, i.text(f, 3000)]),
    ) as Record<(typeof fields)[number], string>;
    if (
      !["Under review", "Completed", "Not assessed"].includes(
        values.reviewStatus,
      )
    )
      return p.fail("INVALID_INPUT", "Invalid review state.");
    const row = {
      id: k,
      ...scoped(org, inc),
      ...values,
      reviewedBy: who,
      reviewedAt: at,
    };
    if (ctx.db.legalReviews.id.find(k)) ctx.db.legalReviews.id.update(row);
    else ctx.db.legalReviews.insert(row);
    event(
      ctx,
      row,
      who,
      "legal",
      "Restricted legal review updated",
      "Authorized reviewer updated legal considerations. Details remain permission restricted.",
    );
    return done({});
  }
  return p.fail("INVALID_INPUT", "Unknown recovery command.");
}
function step(
  ctx: Ctx,
  e: Execution,
  n: number,
  result: string,
  evidenceId = "",
  state = "Completed",
) {
  const row = ctx.db.recoverySteps.id.find(`${e.id}:${n}`);
  if (!row) throw new Error("Missing persisted workflow step.");
  const at = time(ctx);
  ctx.db.recoverySteps.id.update({
    ...row,
    state,
    startedAt: row.startedAt || at,
    completedAt: at,
    result,
    evidenceId,
  });
}
function cancelExecution(
  ctx: Ctx,
  e: Execution,
  reason: string,
  who: string,
  at: bigint,
) {
  ctx.db.recoveryExecutions.id.update({
    ...e,
    state: "Canceled",
    failureReason: reason,
    result: "Execution canceled; original restrictions preserved.",
    completedAt: at,
    updatedAt: at,
    nextAt: 0n,
  });
  for (const g of ctx.db.fallbackAccess.executionId.filter(e.id))
    if (!g.revokedAt)
      ctx.db.fallbackAccess.id.update({ ...g, revokedAt: at, reason });
  const r = ctx.db.approvalRequests.id.find(e.approvalId);
  if (r && ["Pending", "Approved"].includes(r.status))
    ctx.db.approvalRequests.id.update({
      ...r,
      status: "Canceled",
      result: reason,
      completedAt: at,
    });
  const operation = ctx.db.businessOperations.id.find(
    `${e.incidentKey}:${e.operationId}`,
  );
  if (operation?.activeExecutionId === e.id)
    ctx.db.businessOperations.id.update({
      ...operation,
      status: "Restricted",
      operatingMode: "Normal",
      updatedAt: at,
      updatedBy: who,
    });
  event(
    ctx,
    e,
    who,
    "recovery",
    "Recovery or fallback canceled",
    `${e.id}: ${reason}. History preserved.`,
  );
  notify(ctx, e, "Recovery canceled", reason);
}
function fail(ctx: Ctx, e: Execution, reason: string, at: bigint) {
  ctx.db.recoveryExecutions.id.update({
    ...e,
    state: "Failed",
    failureReason: reason,
    result: reason,
    completedAt: at,
    updatedAt: at,
    nextAt: 0n,
  });
  const operation = ctx.db.businessOperations.id.find(
    `${e.incidentKey}:${e.operationId}`,
  );
  if (operation?.activeExecutionId === e.id)
    ctx.db.businessOperations.id.update({
      ...operation,
      status: "Restricted",
      operatingMode: "Normal",
      updatedAt: at,
      updatedBy: "system",
    });
  event(
    ctx,
    e,
    "system",
    "recovery",
    "Recovery verification failed",
    `${e.id}: ${reason}. Original restrictions remain. A separate fallback request and fresh approvals are required.`,
  );
  const originalTask = ctx.db.tasks.id.find(e.taskId),
    followupId = `${e.id}:follow-up`;
  const analyst = [
    ...ctx.db.incidentMemberships.organizationId.filter(e.organizationId),
  ].find(
    (m) =>
      m.incidentId === e.incidentId &&
      has(
        currentAccess(ctx, e.organizationId, e.incidentId, m.userId, at),
        "scope:verify",
      ),
  );
  if (originalTask && analyst && !ctx.db.tasks.id.find(followupId)) {
    const artifact = ctx.db.recoverySteps.id.find(`${e.id}:4`)?.evidenceId;
    const references = JSON.parse(originalTask.references) as {
      kind: string;
      id: string;
    }[];
    if (artifact && !references.some((r) => r.id === artifact))
      references.push({ kind: "evidence", id: artifact });
    createCoordinationTask(
      ctx,
      {
        ...originalTask,
        id: followupId,
        title: "Investigate failed recovery",
        description: `${reason} Review the failed workflow ${e.id} and determine whether an independently approved fallback is appropriate.`,
        assignedUserId: has(
          currentAccess(
            ctx,
            e.organizationId,
            e.incidentId,
            originalTask.assignedUserId,
            at,
          ),
          "scope:verify",
        )
          ? originalTask.assignedUserId
          : analyst.userId,
        createdBy: "system",
        status: "Open",
        verifiedBy: "",
        verifiedAt: 0n,
        dueAt: 0n,
        createdAt: at,
        updatedAt: at,
        references: json(references),
      },
      "system",
    );
  }
  notify(ctx, e, "Recovery failed; fallback available", reason);
}
export function processRecovery(ctx: Ctx) {
  const at = time(ctx);
  for (const r of ctx.db.approvalRequests.iter())
    if (["Pending", "Approved"].includes(r.status)) {
      const decisions = eligible(ctx, r, at),
        invalid =
          r.expiresAt <= at ||
          !requesterEligible(ctx, r, at) ||
          !validContext(ctx, r) ||
          decisions.some((d) => !d.eligible);
      if (invalid) {
        ctx.db.approvalRequests.id.update({
          ...r,
          status: r.expiresAt <= at ? "Expired" : "Invalidated",
          completedAt: at,
          result: "Approval context or approver eligibility changed.",
        });
        event(
          ctx,
          r,
          "system",
          "approval",
          "Approval invalidated",
          `${r.displayReference}: expired or context/eligibility changed.`,
        );
      } else if (r.status === "Approved" && !r.executionId) {
        if (r.actionType === "close_incident") {
          const incident = ctx.db.incidents.id.find(r.incidentKey);
          if (
            !incident ||
            String(incident.updatedAt) !==
              String(JSON.parse(r.parameters).incidentUpdatedAt) ||
            !policySatisfied("close_incident", r.requestedBy, decisions)
          ) {
            ctx.db.approvalRequests.id.update({
              ...r,
              status: "Invalidated",
              completedAt: at,
              result: "Incident or closure authority changed.",
            });
            continue;
          }
          ctx.db.incidents.id.update({
            ...incident,
            status: "Closed",
            updatedAt: at,
          });
          appendEvent(
            ctx,
            r.organizationId,
            r.incidentId,
            "system",
            "status",
            "Incident closed after independent approval",
            r.justification,
            {
              previousValue: incident.status,
              newValue: "Closed",
              evidenceIds: r.evidenceIds,
            },
          );
          ctx.db.approvalRequests.id.update({
            ...r,
            status: "Executed",
            completedAt: at,
            result:
              "Incident closed after separate analyst and commander approval. Findings and scope history preserved.",
          });
          continue;
        }
        ctx.db.approvalRequests.id.update({
          ...r,
          status: "Recorded",
          completedAt: at,
          result:
            "Authorization recorded. No external purchase, export or infrastructure action was executed.",
        });
        event(
          ctx,
          r,
          "system",
          "approval",
          "Operational authorization recorded",
          `${r.displayReference}. No external transaction executed.`,
        );
      }
    }
  for (const e of ctx.db.recoveryExecutions.iter()) {
    if (e.state === "Fallback Active") {
      const grants = [...ctx.db.fallbackAccess.executionId.filter(e.id)],
        active = grants.filter(
          (g) =>
            !g.revokedAt &&
            g.expiresAt > at &&
            has(
              currentAccess(ctx, g.organizationId, g.incidentId, g.userId, at),
              "fallback:read",
            ),
        );
      for (const g of grants)
        if (
          !g.revokedAt &&
          (g.expiresAt <= at ||
            !has(
              currentAccess(ctx, g.organizationId, g.incidentId, g.userId, at),
              "fallback:read",
            ))
        )
          ctx.db.fallbackAccess.id.update({
            ...g,
            revokedAt: at,
            reason: "Expired or membership revoked",
          });
      if (!active.length)
        cancelExecution(
          ctx,
          e,
          "Temporary fallback access expired or was revoked.",
          "system",
          at,
        );
      continue;
    }
    if (
      ![
        "Running",
        "Awaiting Approval",
        "Executing",
        "Awaiting Verification",
      ].includes(e.state) ||
      e.nextAt > at
    )
      continue;
    if (
      !has(
        currentAccess(ctx, e.organizationId, e.incidentId, e.requestedBy, at),
        "recovery:start",
      )
    ) {
      fail(ctx, e, "Requester no longer has active recovery authority.", at);
      continue;
    }
    if (
      e.contextFingerprint !==
      incidentContext(ctx, e.organizationId, e.incidentId)
    ) {
      fail(
        ctx,
        e,
        "Trust evidence or assessment context changed. A new reviewed request is required.",
        at,
      );
      continue;
    }
    const template = ctx.db.recoveryTemplates.id.find(
      `${e.templateId}@${e.templateVersion}`,
    );
    if (!template?.approved) {
      fail(ctx, e, "Approved procedure version is unavailable.", at);
      continue;
    }
    if (e.state === "Running") {
      step(ctx, e, 0, "Prerequisites and current incident access validated.");
      step(
        ctx,
        e,
        1,
        `Investigation task ${e.taskId} created. Its completion remains independently verified.`,
      );
      const approvalId = newApproval(
        ctx,
        e,
        template.name,
        template.policy as ApprovalPolicy,
        at,
      );
      ctx.db.recoveryExecutions.id.update({
        ...e,
        state: "Awaiting Approval",
        approvalId,
        step: 2,
        updatedAt: at,
        nextAt: at + 1000n,
      });
      event(
        ctx,
        e,
        "system",
        "recovery",
        "Recovery awaiting approval",
        `${e.id}: independent ${approvalPolicies[template.policy as ApprovalPolicy].roles.join(" + ")} decision required.`,
      );
      continue;
    }
    const r = ctx.db.approvalRequests.id.find(e.approvalId);
    if (
      !r ||
      !["Pending", "Approved", "Executed"].includes(r.status) ||
      r.expiresAt <= at ||
      !validContext(ctx, r) ||
      eligible(ctx, r, at).some((d) => !d.eligible)
    ) {
      fail(ctx, e, "Approval rejected, expired or invalidated.", at);
      continue;
    }
    if (e.state === "Awaiting Approval") {
      if (r.status !== "Approved") continue;
      if (
        !policySatisfied(
          r.policy as ApprovalPolicy,
          r.requestedBy,
          eligible(ctx, r, at),
        )
      ) {
        fail(
          ctx,
          e,
          "Required independent approvals are not currently valid.",
          at,
        );
        continue;
      }
      step(
        ctx,
        e,
        2,
        "All required independent approvals are currently valid.",
      );
      ctx.db.approvalRequests.id.update({
        ...r,
        status: "Executed",
        completedAt: at,
        result: "Approved immutable simulation started.",
      });
      ctx.db.recoveryExecutions.id.update({
        ...e,
        state: "Executing",
        step: 3,
        updatedAt: at,
        nextAt: at + 1000n,
      });
      event(
        ctx,
        e,
        "system",
        "recovery",
        "Approved recovery executing",
        `${e.id}: deterministic infrastructure simulation started.`,
      );
      continue;
    }
    if (
      !policySatisfied(
        r.policy as ApprovalPolicy,
        r.requestedBy,
        eligible(ctx, r, at),
      )
    ) {
      fail(ctx, e, "Approvals lost eligibility before verification.", at);
      continue;
    }
    if (e.state === "Executing") {
      step(
        ctx,
        e,
        3,
        "Predefined simulated action executed. No external infrastructure modified.",
      );
      ctx.db.recoveryExecutions.id.update({
        ...e,
        state: "Awaiting Verification",
        step: 4,
        updatedAt: at,
        nextAt: at + 1000n,
      });
      event(
        ctx,
        e,
        "system",
        "recovery",
        "Recovery verification pending",
        `${e.id}: checking deterministic synthetic artifact and capability conditions.`,
      );
      continue;
    }
    const internal = ctx.db.recoveryExecutionInternals.id.find(e.id),
      fixture = internal
        ? ctx.db.recoveryFixtures.id.find(internal.fixtureId)
        : undefined;
    if (!fixture) throw new Error("Missing private verification fixture.");
    const parameters = JSON.parse(e.parameters) as {
      beneficiaryIds: string[];
      groupId: string;
      accessLevel: string;
      durationSeconds: number;
    };
    const safe = [
      ...ctx.db.safeSupportRecords.groupId.filter(parameters.groupId),
    ]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({
        id: r.id.substring(r.id.lastIndexOf(":") + 1),
        label: r.label,
        serviceTier: r.serviceTier,
        instruction: r.instruction,
      }));
    const fallbackValid =
      e.kind !== "fallback" ||
      (json(safe) === internal!.safeRecords &&
        parameters.accessLevel === "Read Only" &&
        parameters.durationSeconds === 3600 &&
        parameters.beneficiaryIds.length > 0 &&
        parameters.beneficiaryIds.every((u) =>
          has(
            currentAccess(ctx, e.organizationId, e.incidentId, u, at),
            "fallback:read",
          ),
        ));
    const success = fixture.integrity && fixture.availability && fallbackValid;
    if (!ctx.db.evidence.id.find(fixture.evidenceId))
      ctx.db.evidence.insert({
        id: fixture.evidenceId,
        ...scoped(e.organizationId, e.incidentId),
        filename: fixture.filename,
        contentType: "application/json",
        size: fixture.size,
        storageReference: fixture.storageReference,
        sha256: fixture.sha256,
        description:
          "Predefined synthetic verification artifact; not a live infrastructure scan. Workflow-specific result is recorded in immutable steps and incident events.",
        source: "AEGIS deterministic recovery simulation",
        status: "Synthetic",
        collectedAt: fixture.createdAt,
        uploadedAt: at,
        uploadedBy: "system",
      });
    const result = `Synthetic verification: integrity ${fixture.integrity ? "passed" : "failed"}; availability ${fixture.availability ? "passed" : "failed"}${e.kind === "fallback" ? `; safe subset, read-only policy and current beneficiaries ${fallbackValid ? "passed" : "failed"}` : ""}.`;
    step(
      ctx,
      e,
      4,
      result,
      fixture.evidenceId,
      success ? "Completed" : "Failed",
    );
    linkAutomatedTaskEvidence(ctx, e.taskId, fixture.evidenceId, result);
    if (!success) {
      step(
        ctx,
        e,
        5,
        "Failure recorded. Original restrictions and investigation remain open.",
      );
      fail(ctx, e, result, at);
      continue;
    }
    const state = e.kind === "fallback" ? "Fallback Active" : "Succeeded";
    if (e.kind === "fallback")
      for (const userId of parameters.beneficiaryIds)
        ctx.db.fallbackAccess.insert({
          id: `${e.id}:${userId}`,
          ...scoped(e.organizationId, e.incidentId),
          executionId: e.id,
          userId,
          allowedGroupId: parameters.groupId,
          accessLevel: "Read Only",
          activatedAt: at,
          expiresAt: at + 3_600_000n,
          revokedAt: 0n,
          reason: "Approved limited independent synthetic support subset",
        });
    step(
      ctx,
      e,
      5,
      `${state}. Original database restrictions and all scope assessments preserved.`,
    );
    ctx.db.recoveryExecutions.id.update({
      ...e,
      state,
      result,
      completedAt: at,
      updatedAt: at,
      nextAt: 0n,
      step: 5,
    });
    const operation = ctx.db.businessOperations.id.find(
      `${e.incidentKey}:${e.operationId}`,
    );
    if (operation?.activeExecutionId === e.id)
      ctx.db.businessOperations.id.update({
        ...operation,
        status: "Operational",
        operatingMode:
          e.kind === "fallback"
            ? "Limited read-only fallback"
            : "Verified simulated independent capability",
        updatedAt: at,
        updatedBy: "system",
      });
    event(
      ctx,
      e,
      "system",
      "recovery",
      `${state}: customer-support capability`,
      `${e.id}: ${result} Original system compromise remains unchanged; incident and investigation task remain open.`,
    );
    notify(ctx, e, state, result);
  }
}
export function recoveryProjection(ctx: Reader, access: Access[]) {
  const rows: {
      id: string;
      kind: string;
      organizationId: string;
      incidentId: string;
      body: string;
    }[] = [],
    seen = new Set<string>(),
    at = clock(ctx);
  for (const a of access) {
    const k = key(a.organizationId, a.incidentId);
    if (seen.has(k) || !has(a, "operations:view")) continue;
    seen.add(k);
    const emit = (kind: string, id: string, body: unknown) =>
      rows.push({
        id: `${k}:${kind}:${id}`,
        kind,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        body: json(body),
      });
    emit("policy", k, {
      now: at,
      simulation:
        "Infrastructure actions and verification use deterministic synthetic fixtures. AEGIS workflow, approvals, access controls and reports are functional.",
    });
    for (const w of deriveWarnings(ctx, a.organizationId, a.incidentId))
      if (has(a, "scope:view") || w.kind === "Business Operation")
        emit("warning", w.id, {
          ...w,
          evidenceIds: has(a, "evidence:view") ? w.evidenceIds : [],
          assessmentIds: has(a, "scope:view") ? w.assessmentIds : [],
          relationshipIds: has(a, "scope:view") ? w.relationshipIds : [],
          sourceEntityIds: has(a, "scope:view") ? w.sourceEntityIds : [],
          findingIds: has(a, "scope:view") ? w.findingIds : [],
        });
    for (const o of ctx.db.businessOperations.incidentKey.filter(k))
      emit("operation", o.id, {
        ...o,
        name: ctx.db.scopeEntities.id.find(o.entityId)?.name,
        readiness: operationReadiness(ctx, o),
      });
    for (const t of ctx.db.recoveryTemplates.iter()) emit("template", t.id, t);
    for (const e of ctx.db.recoveryExecutions.incidentKey.filter(k)) {
      const { contextFingerprint, ...safe } = e;
      emit("execution", e.id, {
        ...safe,
        triggerEvidenceIds: has(a, "evidence:view")
          ? e.triggerEvidenceIds
          : "[]",
        triggerAssessmentIds: has(a, "scope:view")
          ? e.triggerAssessmentIds
          : "[]",
      });
      for (const s of ctx.db.recoverySteps.executionId.filter(e.id))
        emit("step", s.id, {
          ...s,
          evidenceId: has(a, "evidence:view") ? s.evidenceId : "",
        });
    }
    for (const r of ctx.db.approvalRequests.incidentKey.filter(k)) {
      const { contextFingerprint, ...safe } = r;
      emit("request", r.id, {
        ...safe,
        evidenceIds: has(a, "evidence:view") ? r.evidenceIds : "[]",
        policyDefinition: approvalPolicies[r.policy as ApprovalPolicy],
      });
      for (const d of eligible(ctx, r, at)) emit("decision", d.id, d);
    }
    for (const g of ctx.db.fallbackAccess.incidentKey.filter(k))
      if (g.userId === a.userId || has(a, "recovery:manage"))
        emit("grant", g.id, g);
    const meta = ctx.db.incidentReportingMetadata.id.find(k);
    if (meta && has(a, "classification:edit")) emit("metadata", meta.id, meta);
    const legal = ctx.db.legalReviews.id.find(k);
    if (legal && has(a, "legal:view")) emit("legal", legal.id, legal);
    if (reportAllowed(a))
      for (const r of ctx.db.incidentReports.incidentKey.filter(k))
        if (
          reportAllowed(a, r.includeLegal) &&
          (JSON.parse(r.requiredPermissions) as string[]).every((p) =>
            has(a, p),
          )
        ) {
          const { snapshot, storageReference, ...safe } = r;
          emit("report", r.id, safe);
        }
  }
  return rows;
}
export function recoveryRead(
  ctx: Reader,
  hash: string,
  data: Record<string, unknown>,
  p: Ports,
  at: bigint,
): unknown {
  const i = input(data, p),
    org = i.text("organizationId"),
    inc = i.text("incidentId"),
    operation = i.text("operation"),
    { access, who } = recoveryActor(
      ctx,
      hash,
      org,
      inc,
      "incident:view",
      p,
      at,
    ),
    k = key(org, inc);
  if (operation === "fallback.records") {
    if (!has(access, "fallback:read"))
      return p.fail("ACCESS_DENIED", "Fallback read permission required.");
    const e = ctx.db.recoveryExecutions.id.find(i.text("executionId")),
      g = e ? ctx.db.fallbackAccess.id.find(`${e.id}:${who}`) : undefined;
    if (
      !e ||
      e.incidentKey !== k ||
      e.state !== "Fallback Active" ||
      !g ||
      g.revokedAt ||
      g.expiresAt <= at ||
      g.accessLevel !== "Read Only"
    )
      return p.fail("ACCESS_DENIED", "No active approved fallback grant.");
    return {
      accessLevel: g.accessLevel,
      expiresAt: g.expiresAt,
      records: [...ctx.db.safeSupportRecords.groupId.filter(g.allowedGroupId)]
        .filter((r) => r.organizationId === org)
        .map(({ id, label, serviceTier, instruction }) => ({
          id: id.substring(id.lastIndexOf(":") + 1),
          label,
          serviceTier,
          instruction,
        })),
    };
  }
  if (operation === "report.preview") {
    if (!reportAllowed(access, data.includeLegal === true))
      return p.fail(
        "ACCESS_DENIED",
        "All report source permissions are required.",
      );
    return snapshotReport(
      ctx,
      org,
      inc,
      who,
      i.choice("type", ["Executive Summary", "Detailed Incident Report"]),
      data.includeLegal === true,
      at,
    );
  }
  if (operation === "report.prepared" || operation === "report.descriptor") {
    const r = ctx.db.incidentReports.id.find(i.text("reportId"));
    if (!r || r.incidentKey !== k)
      return p.fail("NOT_FOUND", "Report not found.");
    if (
      !reportAllowed(access, r.includeLegal) ||
      !(JSON.parse(r.requiredPermissions) as string[]).every((p) =>
        has(access, p),
      )
    )
      return p.fail(
        "ACCESS_DENIED",
        "Current source permissions are required.",
      );
    if (operation === "report.prepared")
      return {
        snapshot: JSON.parse(
          ctx.db.reportSnapshots.id.find(r.id)?.snapshot ?? r.snapshot,
        ),
        status: r.status,
      };
    if (r.status !== "Ready")
      return p.fail("NOT_FOUND", "Report artifact is not ready.");
    return {
      storageReference: r.storageReference,
      sha256: r.sha256,
      size: r.size,
      filename: `AEGIS-${inc}-v${r.version}.html`,
    };
  }
  return p.fail("INVALID_INPUT", "Unknown recovery query.");
}
