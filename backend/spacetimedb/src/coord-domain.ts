import type { Ctx, Reader } from "./index";
import {
  appendEvent,
  incidentCommand,
  json,
  key,
  time,
  type Ports,
} from "./incident-domain";
import { matrix, isRole, type Permission } from "./permissions";
import {
  canReadConversation,
  canReadFinding,
  canReadTask,
  ensureRoom,
  responderAccess,
  visibleReference,
  type CoordinationAccess,
} from "./coord-access";
import {
  availabilityStatuses,
  canTransition,
  pageAckSeconds,
  priorities,
  taskStatuses,
  type Reference,
} from "../../../shared/coordination";
import { seedCoordination } from "./coord-seed";
type Task = NonNullable<ReturnType<Ctx["db"]["tasks"]["id"]["find"]>>;
type Page = NonNullable<ReturnType<Ctx["db"]["pages"]["id"]["find"]>>;
const activeStatus = "Awaiting Acknowledgment";
const terminalTask = (task: Task) =>
  ["Completed", "Canceled"].includes(task.status);
const permits = (a: CoordinationAccess | undefined, p: string) =>
  !!a && (JSON.parse(a.permissions) as string[]).includes(p);
export function notifyCoordination(
  ctx: Ctx,
  task: { organizationId: string; incidentId: string },
  recipientId: string,
  type: string,
  title: string,
  description: string,
  target: { conversationId?: string; taskId?: string; pageId?: string } = {},
) {
  const row = ctx.db.notifications.insert({
    id: 0n,
    organizationId: task.organizationId,
    incidentId: task.incidentId,
    incidentKey: key(task.organizationId, task.incidentId),
    recipientId,
    type,
    title,
    description,
    createdAt: time(ctx),
    readAt: 0n,
    findingId: "",
  });
  ctx.db.coordinationNotificationTargets.insert({
    id: row.id,
    conversationId: target.conversationId ?? "",
    taskId: target.taskId ?? "",
    pageId: target.pageId ?? "",
  });
}
function event(
  ctx: Ctx,
  task: Task,
  actor: string,
  type: string,
  title: string,
  description: string,
  extra: object = {},
) {
  const row = appendEvent(
    ctx,
    task.organizationId,
    task.incidentId,
    actor || "system",
    type,
    title,
    description,
    {
      newValue: json({ taskId: task.id, ...extra }),
      findingId: task.relatedFindingId,
    },
  );
  if (task.sourceConversationId)
    ctx.db.coordinationEventVisibility.insert({
      id: row.id,
      conversationId: task.sourceConversationId,
    });
}
function targetAccess(ctx: Reader, task: Task, userId: string, at: bigint) {
  const a = responderAccess(
    ctx,
    task.organizationId,
    task.incidentId,
    userId,
    at,
  );
  return permits(a, "tasks:update") &&
    a &&
    (!task.sourceConversationId ||
      canReadConversation(ctx, a, task.sourceConversationId)) &&
    (JSON.parse(task.references) as Reference[]).every((r) =>
      visibleReference(ctx, a, r),
    )
    ? a
    : undefined;
}
export function fallbackFor(
  ctx: Reader,
  task: Task,
  target: string,
  preferred: string,
  at: bigint,
) {
  const incident = ctx.db.incidents.id.find(task.incidentKey);
  const candidates = [
    ...new Set([
      preferred,
      incident?.commanderId ?? "",
      ...[
        ...ctx.db.incidentMemberships.organizationId.filter(
          task.organizationId,
        ),
      ]
        .filter(
          (m) =>
            m.incidentId === task.incidentId &&
            ctx.db.memberships.id.find(`${task.organizationId}:${m.userId}`)
              ?.role === "commander",
        )
        .map((m) => m.userId),
    ]),
  ].filter((id) => id && id !== target && targetAccess(ctx, task, id, at));
  return (
    candidates.find(
      (id) =>
        ctx.db.responderAvailability.id.find(`${task.organizationId}:${id}`)
          ?.status === "Available",
    ) ??
    candidates[0] ??
    ""
  );
}
function cancelPage(ctx: Ctx, page: Page, actor: string, reason: string) {
  if (page.status !== activeStatus) return;
  ctx.db.pages.id.update({ ...page, status: "Canceled", reason });
  const task = ctx.db.tasks.id.find(page.taskId)!;
  event(ctx, task, actor, "page", "Page canceled", reason, { pageId: page.id });
  notifyCoordination(
    ctx,
    task,
    page.requestedBy,
    "page.canceled",
    "Page canceled",
    reason,
    { taskId: task.id, pageId: page.id },
  );
}
export function processPages(ctx: Ctx) {
  const at = time(ctx);
  for (const page of ctx.db.pages.iter()) {
    if (page.status !== activeStatus) continue;
    const task = ctx.db.tasks.id.find(page.taskId);
    if (!task) continue;
    if (terminalTask(task)) {
      cancelPage(ctx, page, "", "The task is completed or canceled.");
      continue;
    }
    const recipient = targetAccess(ctx, task, page.pagedUserId, at);
    if (page.parentPageId) {
      if (!recipient)
        cancelPage(
          ctx,
          page,
          "",
          "Backup no longer has incident or task access. No further automatic escalation.",
        );
      continue;
    }
    if (recipient && page.acknowledgmentDeadline > at) continue;
    const backup = fallbackFor(
      ctx,
      task,
      page.pagedUserId,
      page.backupUserId,
      at,
    );
    if (!backup) {
      cancelPage(
        ctx,
        page,
        "",
        "No eligible backup or Incident Commander remains. Requester must reassign the task.",
      );
      continue;
    }
    const childId = `${page.id}:backup`;
    // All changes occur in the scheduler transaction. A terminal parent and deterministic child make duplicate ticks harmless.
    ctx.db.pages.id.update({
      ...page,
      status: "Escalated",
      escalatedAt: at,
      reason: recipient
        ? "Acknowledgment deadline elapsed."
        : "Recipient access was revoked or expired.",
    });
    if (!ctx.db.pages.id.find(childId)) {
      ctx.db.pages.insert({
        ...page,
        id: childId,
        pagedUserId: backup,
        backupUserId: "",
        status: activeStatus,
        createdAt: at,
        acknowledgmentDeadline: 0n,
        acknowledgedBy: "",
        acknowledgedAt: 0n,
        escalatedAt: 0n,
        parentPageId: page.id,
        reason:
          "One-level escalation. Explicit acknowledgment required; no further automatic escalation.",
      });
      notifyCoordination(
        ctx,
        task,
        backup,
        "page.escalated",
        "Urgent page escalated: " + task.title,
        "Please acknowledge receipt. Task and finding verification remain separate.",
        { taskId: task.id, pageId: childId },
      );
      notifyCoordination(
        ctx,
        task,
        page.requestedBy,
        "page.escalated",
        "Page escalated",
        `Backup responder: ${ctx.db.users.id.find(backup)?.displayName ?? backup}.`,
        { taskId: task.id, pageId: childId },
      );
      event(
        ctx,
        task,
        "",
        "page",
        "Page escalated",
        `Unacknowledged page escalated once to ${ctx.db.users.id.find(backup)?.displayName ?? backup}.`,
        { pageId: childId, parentPageId: page.id },
      );
    }
  }
}
// Persisted state may outlive many publishes/restarts. Never assume a generated UUID is absent.
function coordinationId(ctx: Ctx, exists: (id: string) => boolean) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = ctx.newUuidV7().toString();
    if (!exists(id)) return id;
  }
  throw new Error("Unable to allocate a unique coordination identifier.");
}
function issuePage(ctx: Ctx, task: Task, actor: string, backup: string) {
  const at = time(ctx),
    id = coordinationId(ctx, (id) => !!ctx.db.pages.id.find(id));
  const seconds = pageAckSeconds(
    ctx.env.AEGIS_DEVELOPMENT_MODE === "true" ||
      ctx.env.AEGIS_TEST_MODE === "true",
    ctx.env.AEGIS_PAGE_ACK_SECONDS,
  );
  ctx.db.pages.insert({
    id,
    organizationId: task.organizationId,
    incidentId: task.incidentId,
    incidentKey: task.incidentKey,
    taskId: task.id,
    requestedBy: actor,
    pagedUserId: task.assignedUserId,
    backupUserId: backup,
    status: activeStatus,
    createdAt: at,
    acknowledgmentDeadline: at + BigInt(seconds) * 1000n,
    acknowledgedBy: "",
    acknowledgedAt: 0n,
    escalatedAt: 0n,
    parentPageId: "",
    reason: "Acknowledgment confirms receipt only.",
  });
  notifyCoordination(
    ctx,
    task,
    task.assignedUserId,
    "page.issued",
    "Urgent page: " + task.title,
    "Acknowledge receipt explicitly. This does not complete the task.",
    { taskId: task.id, pageId: id },
  );
  event(
    ctx,
    task,
    actor,
    "page",
    "Responder paged",
    `${ctx.db.users.id.find(task.assignedUserId)?.displayName ?? task.assignedUserId}; server acknowledgment deadline ${seconds}s.`,
    { pageId: id },
  );
  return id;
}
export function coordinationCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  if (action === "coord.seed") return seedCoordination(ctx, notifyCoordination);
  const text = (field: string, max = 200, optional = false) => {
    const v = d[field];
    if (optional && (v === undefined || v === "")) return "";
    if (typeof v !== "string" || !v.trim() || v.length > max)
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return v.trim();
  };
  const org = text("organizationId", 100),
    inc = text("incidentId", 100),
    k = key(org, inc),
    at = time(ctx);
  const permission: Permission =
    action === "coord.message.send" || action === "coord.dm.create"
      ? "messages:send"
      : action === "coord.message.read"
        ? "messages:view"
        : action === "coord.availability"
          ? "availability:update"
          : action === "coord.task.create"
            ? "tasks:create"
            : action === "coord.page.create" || action === "coord.page.cancel"
              ? "pages:create"
              : action === "coord.page.acknowledge"
                ? "pages:acknowledge"
                : action === "coord.finding.create"
                  ? "findings:create"
                  : "tasks:update";
  const auth = p.authorize(ctx, hash, org, inc, permission, at),
    who = auth.actor.userId;
  const a: CoordinationAccess = {
    userId: who,
    organizationId: org,
    incidentId: inc,
    permissions: json(isRole(auth.member.role) ? matrix[auth.member.role] : []),
  };
  if (!ctx.db.incidents.id.find(k))
    return p.fail("NOT_FOUND", "Incident not found.");
  const clientRequestId = text("clientRequestId", 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(clientRequestId))
    return p.fail("INVALID_INPUT", "A stable client request ID is required.");
  const opId = `${k}:${who}:${clientRequestId}`,
    fingerprint = json(d),
    prior = ctx.db.coordinationOperations.id.find(opId);
  if (prior) {
    if (prior.action !== action || prior.fingerprint !== fingerprint)
      return p.fail(
        "CONFLICT",
        "Request ID was already used for different content.",
      );
    return JSON.parse(prior.result);
  }
  const finish = (result: unknown) => {
    ctx.db.coordinationOperations.insert({
      id: opId,
      action,
      fingerprint,
      result: json(result),
      createdAt: at,
    });
    return result;
  };
  const choice = (field: string, values: readonly string[]) => {
    const v = text(field);
    return values.includes(v)
      ? v
      : p.fail("INVALID_INPUT", `Invalid ${field}.`);
  };
  const timestamp = (field: string) => {
    const n = Number(d[field] ?? 0);
    return Number.isSafeInteger(n) && n >= 0 && n <= 8640000000000000
      ? BigInt(n)
      : p.fail("INVALID_INPUT", `Invalid ${field}.`);
  };
  const conversation = (id: string) => {
    const c = ctx.db.conversations.id.find(id);
    if (!c || !canReadConversation(ctx, a, id))
      return p.fail("NOT_FOUND", "Conversation unavailable.");
    return c;
  };
  const taskFor = (id: string) => {
    const task = ctx.db.tasks.id.find(id);
    return task && canReadTask(ctx, a, id)
      ? task
      : p.fail("NOT_FOUND", "Task unavailable.");
  };
  const sourceMessage = () => {
    const id = text("sourceMessageId", 30);
    if (!/^\d+$/.test(id))
      return p.fail("INVALID_INPUT", "Invalid source message.");
    const message = ctx.db.messages.id.find(BigInt(id));
    if (!message || message.incidentKey !== k)
      return p.fail("NOT_FOUND", "Source message unavailable.");
    conversation(message.conversationId);
    return message;
  };
  const refs = (value: unknown): Reference[] => {
    if (!Array.isArray(value) || value.length > 20)
      return p.fail("INVALID_INPUT", "Select at most 20 references.");
    const rows = value.map((v) => {
      if (
        !v ||
        typeof v !== "object" ||
        typeof v.id !== "string" ||
        v.id.length > 600 ||
        !["evidence", "finding", "scope", "assessment", "task"].includes(
          v.kind,
        ) ||
        !visibleReference(ctx, a, v)
      )
        return p.fail(
          "ACCESS_DENIED",
          "Reference unavailable in this incident or role.",
        );
      return { kind: v.kind, id: v.id } as Reference;
    });
    return [...new Map(rows.map((r) => [`${r.kind}:${r.id}`, r])).values()];
  };
  const restrictedConversation = (references: Reference[], source = "") => {
    let restriction = source;
    for (const r of references) {
      const c =
        r.kind === "finding"
          ? ctx.db.coordinationFindings.id.find(r.id)?.conversationId
          : r.kind === "task"
            ? ctx.db.tasks.id.find(r.id)?.sourceConversationId
            : "";
      if (c) {
        if (restriction && restriction !== c)
          return p.fail(
            "ACCESS_DENIED",
            "Private references cannot be shared outside their source conversation.",
          );
        restriction = c;
      }
    }
    return restriction;
  };
  const validAssignee = (task: Task, id: string) => {
    if (!targetAccess(ctx, task, id, at))
      return p.fail(
        "INVALID_INPUT",
        "Select an active incident responder authorized for this task and its references.",
      );
  };
  const pagePlan = (task: Task) => {
    p.authorize(ctx, hash, org, inc, "pages:create", at);
    if (terminalTask(task) || !["Critical", "High"].includes(task.priority))
      return p.fail(
        "INVALID_INPUT",
        "Only an open High or Critical task can page a responder.",
      );
    validAssignee(task, task.assignedUserId);
    if (
      [...ctx.db.pages.incidentKey.filter(k)].some(
        (row) => row.taskId === task.id && row.status === activeStatus,
      )
    )
      return p.fail("CONFLICT", "This task already has a pending page.");
    const availability = ctx.db.responderAvailability.id.find(
      `${org}:${task.assignedUserId}`,
    )?.status;
    if (
      ["Busy", "Unavailable"].includes(availability ?? "") &&
      d.confirmAvailability !== true
    )
      return p.fail(
        "INVALID_INPUT",
        `Responder is ${availability}. Confirm paging despite this availability.`,
      );
    if (task.backupUserId) validAssignee(task, task.backupUserId);
    const backup = fallbackFor(
      ctx,
      task,
      task.assignedUserId,
      task.backupUserId,
      at,
    );
    if (!backup)
      return p.fail(
        "INVALID_INPUT",
        "Select an eligible backup or Incident Commander distinct from the recipient.",
      );
    return backup;
  };
  if (action === "coord.dm.create") {
    const other = text("userId", 100),
      otherAccess = responderAccess(ctx, org, inc, other, at);
    if (other === who || !permits(otherAccess, "messages:send"))
      return p.fail(
        "INVALID_INPUT",
        "Select another active incident responder.",
      );
    const id = `${k}:dm:${[who, other].sort().join(":")}`;
    if (!ctx.db.conversations.id.find(id)) {
      ctx.db.conversations.insert({
        id,
        organizationId: org,
        incidentId: inc,
        incidentKey: k,
        type: "Direct Message",
        title: "Direct Message",
        createdBy: who,
        createdAt: at,
      });
      for (const userId of [who, other])
        ctx.db.conversationParticipants.insert({
          id: `${id}:${userId}`,
          conversationId: id,
          userId,
        });
    }
    return finish({ conversationId: id });
  }
  if (action === "coord.message.send") {
    const c = conversation(text("conversationId", 600)),
      content = text("content", 6000),
      references = refs(d.references ?? []),
      restriction = restrictedConversation(references);
    if (restriction && restriction !== c.id)
      return p.fail(
        "ACCESS_DENIED",
        "A private task or finding cannot be shared into another conversation.",
      );
    if (c.type === "Direct Message")
      for (const participant of ctx.db.conversationParticipants.conversationId.filter(
        c.id,
      ))
        if (
          !permits(
            responderAccess(ctx, org, inc, participant.userId, at),
            "messages:send",
          )
        )
          return p.fail(
            "ACCESS_DENIED",
            "A participant no longer has incident access. This conversation is read-only.",
          );
    const correctionOf = timestamp("correctionOf");
    if (correctionOf) {
      const original = ctx.db.messages.id.find(correctionOf);
      if (original?.conversationId !== c.id || original.senderId !== who)
        return p.fail(
          "INVALID_INPUT",
          "Only your own message in this conversation can be corrected.",
        );
    }
    const message = ctx.db.messages.insert({
      id: 0n,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      conversationId: c.id,
      senderId: who,
      content,
      references: json(references),
      createdAt: at,
      correctionOf,
    });
    for (const membership of ctx.db.incidentMemberships.organizationId.filter(
      org,
    )) {
      const recipient = responderAccess(ctx, org, inc, membership.userId, at);
      if (
        recipient &&
        recipient.userId !== who &&
        canReadConversation(ctx, recipient, c.id)
      )
        notifyCoordination(
          ctx,
          c,
          recipient.userId,
          "message",
          "New message",
          `${ctx.db.users.id.find(who)?.displayName ?? who} sent a message in ${c.type}.`,
          { conversationId: c.id },
        );
    }
    return finish({ messageId: message.id });
  }
  if (action === "coord.message.read") {
    const c = conversation(text("conversationId", 600)),
      id = timestamp("messageId"),
      message = ctx.db.messages.id.find(id);
    if (!message || message.conversationId !== c.id)
      return p.fail("NOT_FOUND", "Message unavailable.");
    const readId = `${c.id}:${who}`,
      old = ctx.db.conversationReads.id.find(readId),
      row = {
        id: readId,
        conversationId: c.id,
        userId: who,
        lastReadMessageId:
          old && old.lastReadMessageId > id ? old.lastReadMessageId : id,
      };
    if (old) ctx.db.conversationReads.id.update(row);
    else ctx.db.conversationReads.insert(row);
    return finish({ read: true });
  }
  if (action === "coord.availability") {
    const status = choice("status", availabilityStatuses),
      id = `${org}:${who}`,
      row = { id, organizationId: org, userId: who, status, updatedAt: at };
    if (ctx.db.responderAvailability.id.find(id))
      ctx.db.responderAvailability.id.update(row);
    else ctx.db.responderAvailability.insert(row);
    return finish({ status });
  }
  if (action === "coord.finding.create") {
    const source = sourceMessage(),
      references = refs(d.references ?? JSON.parse(source.references));
    restrictedConversation(references, source.conversationId);
    if (
      d.assignedTo &&
      ctx.db.conversations.id.find(source.conversationId)?.type ===
        "Direct Message" &&
      !ctx.db.conversationParticipants.id.find(
        `${source.conversationId}:${String(d.assignedTo)}`,
      )
    )
      return p.fail(
        "ACCESS_DENIED",
        "The assignee must be a participant in the source conversation.",
      );
    // A caller may narrow inherited references, but cannot change privacy or attribution.
    const result = incidentCommand(
      ctx,
      "incident.finding.create",
      hash,
      {
        ...d,
        evidenceIds: references
          .filter((r) => r.kind === "evidence")
          .map((r) => r.id),
      },
      p,
    ) as { findingId: string };
    ctx.db.coordinationFindings.insert({
      id: result.findingId,
      conversationId: source.conversationId,
      sourceMessageId: source.id,
    });
    // The shared Phase 2 command wrote findings/events/notices in this transaction. Gate the event and remove ineligible notices before commit.
    for (const e of ctx.db.incidentEvents.incidentKey.filter(k))
      if (
        e.findingId === result.findingId &&
        !ctx.db.coordinationEventVisibility.id.find(e.id)
      )
        ctx.db.coordinationEventVisibility.insert({
          id: e.id,
          conversationId: source.conversationId,
        });
    for (const n of ctx.db.notifications.incidentKey.filter(k))
      if (n.findingId === result.findingId) {
        const recipient = responderAccess(ctx, org, inc, n.recipientId, at);
        if (
          !recipient ||
          !canReadConversation(ctx, recipient, source.conversationId)
        )
          ctx.db.notifications.id.delete(n.id);
      }
    return finish(result);
  }
  if (action === "coord.task.create") {
    const source = d.sourceMessageId ? sourceMessage() : undefined;
    const references = refs(
      d.references ?? (source ? JSON.parse(source.references) : []),
    );
    const restriction = restrictedConversation(
      references,
      source?.conversationId ?? "",
    );
    const assignedUserId = text("assignedUserId", 100),
      backupUserId = text("backupUserId", 100, true);
    if (assignedUserId !== who)
      p.authorize(ctx, hash, org, inc, "tasks:assign", at);
    const relatedFindingId =
      text("relatedFindingId", 100, true) ||
      references.find((r) => r.kind === "finding")?.id ||
      "";
    if (
      relatedFindingId &&
      !references.some((r) => r.kind === "finding" && r.id === relatedFindingId)
    )
      references.push(...refs([{ kind: "finding", id: relatedFindingId }]));
    const sourceConversationId = restrictedConversation(
      references,
      restriction,
    );
    const kind = choice("kind", ["Investigation", "Coordination"]);
    if (
      kind === "Coordination" &&
      references.some(
        (r) =>
          r.kind === "evidence" ||
          r.kind === "finding" ||
          r.kind === "assessment" ||
          (r.kind === "scope" &&
            ctx.db.scopeEntities.id.find(r.id)?.kind !== "Business Operation"),
      )
    )
      return p.fail(
        "INVALID_INPUT",
        "Evidence-backed investigation work must use Investigation tasks.",
      );
    const task: Task = {
      id: coordinationId(ctx, (id) => !!ctx.db.tasks.id.find(id)),
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      title: text("title", 200),
      description: text("description", 6000),
      kind,
      priority: choice("priority", priorities),
      status: "Open",
      assignedUserId,
      backupUserId,
      createdBy: who,
      createdAt: at,
      updatedAt: at,
      dueAt: timestamp("dueAt"),
      verifiedBy: "",
      verifiedAt: 0n,
      relatedFindingId,
      sourceMessageId: source?.id ?? 0n,
      sourceConversationId,
      references: json(references),
    };
    validAssignee(task, assignedUserId);
    if (backupUserId) {
      validAssignee(task, backupUserId);
      if (backupUserId === assignedUserId)
        return p.fail("INVALID_INPUT", "Backup must be a different responder.");
    }
    const backup = d.page === true ? pagePlan(task) : "";
    ctx.db.tasks.insert(task);
    event(
      ctx,
      task,
      who,
      "task",
      "Task created: " + task.title,
      task.description,
    );
    notifyCoordination(
      ctx,
      task,
      assignedUserId,
      "task.assigned",
      "Task assigned: " + task.title,
      task.description,
      { taskId: task.id },
    );
    if (backup) issuePage(ctx, task, who, backup);
    return finish({ taskId: task.id });
  }
  if (action === "coord.task.update") {
    const task = taskFor(text("taskId", 100)),
      status = choice("status", taskStatuses),
      comment = text("comment", 4000);
    if (
      ![task.createdBy, task.assignedUserId].includes(who) &&
      auth.member.role !== "commander" &&
      status !== "Completed"
    )
      return p.fail(
        "ACCESS_DENIED",
        "Only the assignee, creator or Incident Commander may change this task.",
      );
    if (!canTransition(task.status, status))
      return p.fail("INVALID_INPUT", "Invalid task status transition.");
    const references = refs([
      ...JSON.parse(task.references),
      ...(Array.isArray(d.references) ? d.references : []),
    ]);
    const sourceConversationId = restrictedConversation(
      references,
      task.sourceConversationId,
    );
    if (
      task.kind === "Coordination" &&
      references.some(
        (r) =>
          r.kind === "evidence" ||
          r.kind === "finding" ||
          r.kind === "assessment" ||
          (r.kind === "scope" &&
            ctx.db.scopeEntities.id.find(r.id)?.kind !== "Business Operation"),
      )
    )
      return p.fail(
        "INVALID_INPUT",
        "Use an Investigation task for evidence-backed technical work.",
      );
    // Existing shared tasks cannot silently acquire private source restrictions.
    if (sourceConversationId !== task.sourceConversationId)
      return p.fail(
        "ACCESS_DENIED",
        "Create a separate restricted task for private references.",
      );
    let assignedUserId = task.assignedUserId,
      backupUserId = task.backupUserId,
      dueAt = task.dueAt;
    if (
      d.assignedUserId !== undefined ||
      d.backupUserId !== undefined ||
      d.dueAt !== undefined
    ) {
      p.authorize(ctx, hash, org, inc, "tasks:assign", at);
      assignedUserId = text("assignedUserId", 100);
      backupUserId = text("backupUserId", 100, true);
      dueAt = timestamp("dueAt");
    }
    const next = {
      ...task,
      status,
      assignedUserId,
      backupUserId,
      dueAt,
      references: json(references),
      updatedAt: at,
      verifiedBy: status === "Completed" ? who : "",
      verifiedAt: status === "Completed" ? at : 0n,
    };
    validAssignee(next, assignedUserId);
    if (backupUserId) {
      validAssignee(next, backupUserId);
      if (backupUserId === assignedUserId)
        return p.fail("INVALID_INPUT", "Backup must differ from assignee.");
    }
    if (task.status === "Completed" && status === "Completed")
      return p.fail(
        "INVALID_INPUT",
        "Reopen completed work before changing it.",
      );
    if (status === "Completed") {
      p.authorize(ctx, hash, org, inc, "tasks:verify", at);
      if (task.assignedUserId === who || assignedUserId === who)
        return p.fail(
          "ACCESS_DENIED",
          "Completion requires a different authorized reviewer.",
        );
      if (task.kind === "Investigation") {
        p.authorize(ctx, hash, org, inc, "findings:verify", at);
        if (!references.some((r) => r.kind === "evidence"))
          return p.fail(
            "INVALID_INPUT",
            "Investigation completion requires supporting evidence and review.",
          );
      }
    }
    ctx.db.tasks.id.update(next);
    ctx.db.taskUpdates.insert({
      id: 0n,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      taskId: task.id,
      actorId: who,
      previousStatus: task.status,
      newStatus: status,
      comment,
      createdAt: at,
    });
    event(
      ctx,
      next,
      who,
      "task",
      `Task ${status === task.status ? "updated" : status}: ${task.title}`,
      comment,
      {
        previousStatus: task.status,
        status,
        previousAssignedUserId: task.assignedUserId,
        assignedUserId,
        previousDueAt: task.dueAt,
        dueAt: next.dueAt,
        references: next.references,
        verifiedBy: next.verifiedBy,
        verifiedAt: next.verifiedAt,
      },
    );
    for (const userId of new Set([task.createdBy, assignedUserId]))
      notifyCoordination(
        ctx,
        next,
        userId,
        status === "Awaiting Verification"
          ? "task.verification"
          : "task.updated",
        `${task.title}: ${status}`,
        comment,
        { taskId: task.id },
      );
    if (status === "Awaiting Verification")
      for (const m of ctx.db.incidentMemberships.organizationId.filter(org)) {
        const reviewer = targetAccess(ctx, next, m.userId, at);
        if (
          reviewer &&
          next.assignedUserId !== m.userId &&
          permits(
            reviewer,
            next.kind === "Investigation" ? "findings:verify" : "tasks:verify",
          )
        )
          notifyCoordination(
            ctx,
            next,
            m.userId,
            "task.verification",
            "Verification requested: " + task.title,
            comment,
            { taskId: task.id },
          );
      }
    if (terminalTask(next) || assignedUserId !== task.assignedUserId)
      for (const page of ctx.db.pages.incidentKey.filter(k))
        if (page.taskId === task.id)
          cancelPage(
            ctx,
            page,
            who,
            terminalTask(next)
              ? "Task completed or canceled."
              : "Task reassigned. Issue a new page explicitly.",
          );
    return finish({ taskId: task.id });
  }
  if (action === "coord.page.create") {
    const task = taskFor(text("taskId", 100)),
      backup = pagePlan(task);
    return finish({ pageId: issuePage(ctx, task, who, backup) });
  }
  if (action === "coord.page.acknowledge" || action === "coord.page.cancel") {
    const page = ctx.db.pages.id.find(text("pageId", 160));
    if (!page || page.incidentKey !== k)
      return p.fail("NOT_FOUND", "Page unavailable.");
    const task = taskFor(page.taskId);
    if (action.endsWith("cancel")) {
      if (page.requestedBy !== who && auth.member.role !== "commander")
        return p.fail(
          "ACCESS_DENIED",
          "Only the requester or Incident Commander can cancel this page.",
        );
      const reason = text("reason", 2000);
      cancelPage(ctx, page, who, reason);
      return finish({ pageId: page.id });
    }
    if (page.pagedUserId !== who)
      return p.fail(
        "ACCESS_DENIED",
        "Only the paged responder may acknowledge receipt.",
      );
    if (page.status !== activeStatus)
      return p.fail(
        "CONFLICT",
        "This page is no longer awaiting acknowledgment.",
      );
    if (page.acknowledgmentDeadline !== 0n && page.acknowledgmentDeadline <= at)
      return p.fail(
        "CONFLICT",
        "The server deadline elapsed. The scheduler will escalate this page.",
      );
    ctx.db.pages.id.update({
      ...page,
      status: "Acknowledged",
      acknowledgedBy: who,
      acknowledgedAt: at,
    });
    event(
      ctx,
      task,
      who,
      "page",
      "Page acknowledged",
      `${ctx.db.users.id.find(who)?.displayName ?? who} acknowledged receipt. Task and linked finding remain independently tracked.`,
      { pageId: page.id },
    );
    notifyCoordination(
      ctx,
      task,
      page.requestedBy,
      "page.acknowledged",
      "Page acknowledged",
      task.title,
      { taskId: task.id, pageId: page.id },
    );
    return finish({ pageId: page.id });
  }
  if (action === "coord.test.page_due") {
    if (ctx.env.AEGIS_TEST_MODE !== "true")
      return p.fail("ACCESS_DENIED", "Test fixture unavailable.");
    const page = ctx.db.pages.id.find(text("pageId", 160));
    if (
      !page ||
      page.incidentKey !== k ||
      page.parentPageId ||
      page.status !== activeStatus
    )
      return p.fail("INVALID_INPUT", "Pending original page required.");
    // Only the trusted service can call commands, and this action is not exposed by HTTP. Normal scheduled reducer performs escalation.
    ctx.db.pages.id.update({ ...page, acknowledgmentDeadline: at - 1n });
    return finish({ scheduled: true });
  }
  return p.fail("INVALID_INPUT", "Unknown coordination action.");
}

export function coordinationProjection(
  ctx: Reader,
  access: CoordinationAccess[],
) {
  const rows: {
    id: string;
    kind: string;
    organizationId: string;
    incidentId: string;
    body: string;
  }[] = [];
  for (const a of access) {
    if (!permits(a, "messages:view")) continue;
    const k = key(a.organizationId, a.incidentId),
      at = ctx.db.accessClock.id.find(0)?.now ?? 0n;
    const emit = (kind: string, id: string | bigint, value: unknown) =>
      rows.push({
        id: `${kind}:${id}`,
        kind,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        body: json(value),
      });
    for (const c of ctx.db.conversations.incidentKey.filter(k))
      if (canReadConversation(ctx, a, c.id)) {
        const participants =
          c.type === "Incident Room"
            ? [
                ...ctx.db.incidentMemberships.organizationId.filter(
                  a.organizationId,
                ),
              ]
                .filter(
                  (m) =>
                    m.incidentId === a.incidentId &&
                    permits(
                      responderAccess(
                        ctx,
                        a.organizationId,
                        a.incidentId,
                        m.userId,
                        at,
                      ),
                      "messages:view",
                    ),
                )
                .map((m) => m.userId)
            : [
                ...ctx.db.conversationParticipants.conversationId.filter(c.id),
              ].map((m) => m.userId);
        const read = ctx.db.conversationReads.id.find(`${c.id}:${a.userId}`);
        const messages = [...ctx.db.messages.conversationId.filter(c.id)].sort(
          (x, y) => (x.id < y.id ? -1 : 1),
        );
        emit("conversation", c.id, {
          ...c,
          participants,
          lastReadMessageId: read?.lastReadMessageId ?? 0n,
          unread: messages.filter(
            (m) =>
              m.id > (read?.lastReadMessageId ?? 0n) && m.senderId !== a.userId,
          ).length,
          readOnly: participants.some(
            (id) =>
              !permits(
                responderAccess(ctx, a.organizationId, a.incidentId, id, at),
                "messages:send",
              ),
          ),
        });
        for (const m of messages)
          emit("message", m.id, {
            ...m,
            senderName:
              ctx.db.users.id.find(m.senderId)?.displayName ?? "Responder",
            references: json(
              (JSON.parse(m.references) as Reference[]).filter((r) =>
                visibleReference(ctx, a, r),
              ),
            ),
          });
      }
    if (permits(a, "operations:view"))
      for (const association of ctx.db.scopeAssociations.incidentKey.filter(
        k,
      )) {
        const operation = ctx.db.scopeEntities.id.find(association.entityId);
        if (
          operation?.kind === "Business Operation" &&
          operation.organizationId === a.organizationId
        )
          emit("operation", `${k}:${operation.id}`, {
            id: operation.id,
            name: operation.name,
            description: operation.description,
            owner: operation.owner,
            reference: operation.reference,
          });
      }
    for (const task of ctx.db.tasks.incidentKey.filter(k))
      if (canReadTask(ctx, a, task.id)) {
        emit("task", task.id, {
          ...task,
          references: json(
            (JSON.parse(task.references) as Reference[]).filter((r) =>
              visibleReference(ctx, a, r),
            ),
          ),
        });
        for (const update of ctx.db.taskUpdates.taskId.filter(task.id))
          emit("taskUpdate", update.id, update);
      }
    for (const page of ctx.db.pages.incidentKey.filter(k))
      if (canReadTask(ctx, a, page.taskId)) emit("page", page.id, page);
    for (const m of ctx.db.incidentMemberships.organizationId.filter(
      a.organizationId,
    ))
      if (m.incidentId === a.incidentId) {
        const member = responderAccess(
          ctx,
          a.organizationId,
          a.incidentId,
          m.userId,
          at,
        );
        if (permits(member, "messages:view")) {
          const availability = ctx.db.responderAvailability.id.find(
            `${a.organizationId}:${m.userId}`,
          );
          emit("responder", `${k}:${m.userId}`, {
            id: m.userId,
            name: ctx.db.users.id.find(m.userId)?.displayName ?? m.userId,
            role: ctx.db.memberships.id.find(`${a.organizationId}:${m.userId}`)
              ?.role,
            availability: availability?.status ?? "Not declared",
            updatedAt: availability?.updatedAt ?? 0n,
            permissions: JSON.parse(member!.permissions),
          });
        }
      }
    emit("policy", k, {
      now: at,
      acknowledgmentSeconds: pageAckSeconds(
        ctx.env.AEGIS_DEVELOPMENT_MODE === "true" ||
          ctx.env.AEGIS_TEST_MODE === "true",
        ctx.env.AEGIS_PAGE_ACK_SECONDS,
      ),
    });
    for (const source of ctx.db.coordinationFindings.iter())
      if (canReadConversation(ctx, a, source.conversationId))
        emit("findingSource", source.id, source);
  }
  return rows;
}
