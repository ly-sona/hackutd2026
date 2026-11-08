import type { Reader } from "./index";
export type CoordinationAccess = {
  userId: string;
  organizationId: string;
  incidentId: string;
  permissions: string;
};
export function canReadConversation(
  ctx: Reader,
  a: CoordinationAccess,
  id: string,
) {
  const c = ctx.db.conversations.id.find(id);
  return (
    !!c &&
    c.organizationId === a.organizationId &&
    c.incidentId === a.incidentId &&
    (JSON.parse(a.permissions) as string[]).includes("messages:view") &&
    ((JSON.parse(a.permissions) as string[]).includes("organization:manage") ||
      c.type === "Incident Room" ||
      !!ctx.db.conversationParticipants.id.find(`${id}:${a.userId}`))
  );
}
export function canReadFinding(ctx: Reader, a: CoordinationAccess, id: string) {
  const source = ctx.db.coordinationFindings.id.find(id);
  return !source || canReadConversation(ctx, a, source.conversationId);
}
export function canReadTask(ctx: Reader, a: CoordinationAccess, id: string) {
  const task = ctx.db.tasks.id.find(id);
  return (
    !!task &&
    task.organizationId === a.organizationId &&
    task.incidentId === a.incidentId &&
    (JSON.parse(a.permissions) as string[]).includes("tasks:view") &&
    (!task.sourceConversationId ||
      canReadConversation(ctx, a, task.sourceConversationId))
  );
}
export function canReadCoordinationEvent(
  ctx: Reader,
  a: CoordinationAccess,
  id: bigint,
) {
  const source = ctx.db.coordinationEventVisibility.id.find(id);
  return !source || canReadConversation(ctx, a, source.conversationId);
}

import { isRole, matrix } from "./permissions";
import type { Ctx } from "./index";
export function responderAccess(
  ctx: Reader,
  org: string,
  inc: string,
  userId: string,
  at: bigint,
): CoordinationAccess | undefined {
  const m = ctx.db.memberships.id.find(`${org}:${userId}`);
  if (
    !m ||
    m.status !== "active" ||
    (m.expiresAt !== 0n && m.expiresAt <= at) ||
    !isRole(m.role) ||
    ctx.db.users.id.find(userId)?.accountStatus !== "active" ||
    ctx.db.organizations.id.find(org)?.status !== "active" ||
    (m.role !== "administrator" &&
      ctx.db.incidentMemberships.id.find(`${org}:${inc}:${userId}`)
        ?.membershipStatus !== "active")
  )
    return;
  return {
    userId,
    organizationId: org,
    incidentId: inc,
    permissions: JSON.stringify(matrix[m.role]),
  };
}
export function ensureRoom(ctx: Ctx, org: string, inc: string, actor: string) {
  const id = `${org}:${inc}:room`;
  if (!ctx.db.conversations.id.find(id))
    ctx.db.conversations.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: `${org}:${inc}`,
      type: "Incident Room",
      title: "Incident Response",
      createdBy: actor,
      createdAt: ctx.timestamp.microsSinceUnixEpoch / 1000n,
    });
  return id;
}
export function incidentResponders(
  ctx: Reader,
  org: string,
  inc: string,
  at: bigint,
) {
  return [...ctx.db.memberships.organizationId.filter(org)]
    .filter((member) => {
      const access = responderAccess(ctx, org, inc, member.userId, at);
      return (
        access &&
        (JSON.parse(access.permissions) as string[]).includes("messages:view")
      );
    })
    .map((member) => member.userId);
}
export function visibleReference(
  ctx: Reader,
  a: CoordinationAccess,
  ref: { kind: string; id: string },
): boolean {
  const permissions = JSON.parse(a.permissions) as string[];
  const k = `${a.organizationId}:${a.incidentId}`;
  if (ref.kind === "evidence")
    return (
      permissions.includes("evidence:view") &&
      ctx.db.evidence.id.find(ref.id)?.incidentKey === k
    );
  if (ref.kind === "finding")
    return (
      ctx.db.findings.id.find(ref.id)?.incidentKey === k &&
      canReadFinding(ctx, a, ref.id)
    );
  if (ref.kind === "task") return canReadTask(ctx, a, ref.id);
  if (ref.kind === "assessment") {
    const row = ctx.db.scopeAssessments.id.find(ref.id);
    return (
      row?.incidentKey === k &&
      visibleReference(ctx, a, { kind: "scope", id: row.entityId })
    );
  }
  if (ref.kind === "scope") {
    const e = ctx.db.scopeEntities.id.find(ref.id);
    if (
      e?.organizationId === a.organizationId &&
      ctx.db.scopeAssociations.id.find(`${k}:${ref.id}`)
    )
      return (
        permissions.includes("scope:view") ||
        (e.kind === "Business Operation" &&
          permissions.includes("operations:view"))
      );
    const r = ctx.db.scopeRecords.id.find(ref.id);
    return (
      permissions.includes("scope:records") &&
      r?.organizationId === a.organizationId &&
      !!ctx.db.scopeAssociations.id.find(`${k}:${r.groupId}`)
    );
  }
  return false;
}
