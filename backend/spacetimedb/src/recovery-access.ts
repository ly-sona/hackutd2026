import type { Ctx, Reader } from "./index";
import { json, key, time, type Ports } from "./incident-domain";
import { scopeGraph } from "./scope-domain";
import { responderAccess, type CoordinationAccess } from "./coord-access";
import { potentialLeads, isConfirmed, isPending } from "../../../shared/scope";
import { trustCategory } from "../../../shared/recovery";
export const has = (
  access: CoordinationAccess | undefined,
  permission: string,
) =>
  !!access && (JSON.parse(access.permissions) as string[]).includes(permission);
export const scoped = (org: string, inc: string) => ({
  organizationId: org,
  incidentId: inc,
  incidentKey: key(org, inc),
});
export { moduleId as recoveryId } from "./module-id";
export function currentAccess(
  ctx: Reader,
  org: string,
  inc: string,
  user: string,
  at: bigint,
) {
  return responderAccess(ctx, org, inc, user, at);
}
export function associated(ctx: Reader, org: string, inc: string, id: string) {
  const entity = ctx.db.scopeEntities.id.find(id);
  return entity?.organizationId === org &&
    ctx.db.scopeAssociations.id.find(`${key(org, inc)}:${id}`)
    ? entity
    : undefined;
}
export function input(data: Record<string, unknown>, p: Ports) {
  const text = (field: string, max = 200, optional = false) => {
    const value = data[field];
    if (optional && (value === undefined || value === "")) return "";
    if (typeof value !== "string" || !value.trim() || value.length > max)
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return value.trim();
  };
  const choice = (field: string, values: readonly string[]) => {
    const v = text(field);
    return values.includes(v)
      ? v
      : p.fail("INVALID_INPUT", `Invalid ${field}.`);
  };
  const ids = (field: string, max = 20) => {
    const value = data[field] ?? [];
    if (
      !Array.isArray(value) ||
      value.length > max ||
      value.some((v) => typeof v !== "string" || v.length > 600)
    )
      return p.fail("INVALID_INPUT", `Invalid ${field}.`);
    return [...new Set(value)] as string[];
  };
  return { text, choice, ids };
}
export function checkedEvidence(
  ctx: Reader,
  org: string,
  inc: string,
  ids: string[],
  p: Ports,
) {
  if (
    !Array.isArray(ids) ||
    ids.length > 20 ||
    ids.some((id) => typeof id !== "string" || id.length > 100)
  )
    return p.fail("INVALID_INPUT", "Invalid evidence identifiers.");
  for (const id of ids)
    if (ctx.db.evidence.id.find(id)?.incidentKey !== key(org, inc))
      return p.fail("INVALID_INPUT", "Evidence must belong to this incident.");
}
export function incidentContext(ctx: Reader, org: string, inc: string) {
  const k = key(org, inc);
  return json({
    assessments: [...ctx.db.scopeAssessments.incidentKey.filter(k)].sort(
      (a, b) => a.id.localeCompare(b.id),
    ),
    relationships: [...ctx.db.scopeRelationships.incidentKey.filter(k)].sort(
      (a, b) => a.id.localeCompare(b.id),
    ),
    restrictions: [...ctx.db.trustRestrictions.incidentKey.filter(k)].sort(
      (a, b) => a.id.localeCompare(b.id),
    ),
  });
}
export function deriveWarnings(ctx: Reader, org: string, inc: string) {
  const k = key(org, inc),
    snapshot = scopeGraph(ctx, org, inc),
    leads = potentialLeads(
      snapshot.entities,
      snapshot.relationships,
      snapshot.assessments,
    );
  return snapshot.entities
    .filter((e) =>
      [
        "Account",
        "System",
        "Dataset",
        "Record Group",
        "Business Operation",
      ].includes(e.kind),
    )
    .map((entity) => {
      const restriction = ctx.db.trustRestrictions.id.find(`${k}:${entity.id}`),
        lead = leads.find((l) => l.entityId === entity.id),
        assessments = snapshot.assessments.filter(
          (a) => a.entityId === entity.id,
        ),
        risk =
          !!lead ||
          assessments.some((a) => isPending(a.status) || isConfirmed(a.status));
      const source = lead
        ? snapshot.assessments.filter((a) => a.entityId === lead.sourceId)
        : assessments;
      const links = snapshot.links.filter(
        (l) =>
          l.entityId === entity.id ||
          source.some((s) => s.entityId === l.entityId),
      );
      const category = trustCategory(
        restriction?.active ? restriction.category : undefined,
        risk,
      );
      return {
        id: `${k}:${entity.id}`,
        entityId: entity.id,
        name: entity.name,
        kind: entity.kind,
        category,
        explanation: restriction?.active
          ? restriction.reason
          : category === "Use With Caution"
            ? "A documented assessment or dependency identifies an unresolved trust concern. Confirm with the incident team before using the normal route. This is not proof of compromise."
            : "No current usage restriction or known dependency warning is recorded. Available does not mean independently verified safe.",
        sourceEntityIds: lead
          ? [lead.sourceId]
          : assessments.length
            ? [entity.id]
            : [],
        relationshipIds: lead?.path ?? [],
        evidenceIds: [
          ...new Set([
            ...(restriction
              ? (JSON.parse(restriction.evidenceIds) as string[])
              : []),
            ...links.map((l) => l.evidenceId),
          ]),
        ],
        findingIds: [
          ...new Set(source.map((a) => a.findingId).filter(Boolean)),
        ],
        assessmentIds: source.map((a) => a.id),
        updatedBy:
          restriction?.updatedBy ?? source[0]?.assessedBy ?? entity.createdBy,
        updatedAt:
          restriction?.updatedAt ??
          source.reduce(
            (n, a) => (a.updatedAt > n ? a.updatedAt : n),
            entity.updatedAt,
          ),
        explicit: !!restriction?.active,
      };
    });
}
export function operationReadiness(
  ctx: Reader,
  operation: {
    activeExecutionId: string;
    entityId: string;
    organizationId: string;
    incidentId: string;
  },
) {
  const execution = operation.activeExecutionId
    ? ctx.db.recoveryExecutions.id.find(operation.activeExecutionId)
    : undefined;
  if (execution) {
    if (execution.state === "Fallback Active") return "Fallback active";
    if (execution.state === "Awaiting Approval") return "Approval required";
    if (["Running", "Executing"].includes(execution.state))
      return "Recovery running";
    if (execution.state === "Awaiting Verification")
      return "Verification pending";
    if (execution.state === "Succeeded") return "Verified recovery";
    if (execution.state === "Failed")
      return execution.kind === "recovery"
        ? "Fallback available"
        : "Recovery failed";
  }
  return operation.entityId.endsWith(":OP-SUPPORT") &&
    associated(
      ctx,
      operation.organizationId,
      operation.incidentId,
      `${operation.organizationId}:scope:SYS-CUSTOMER-DB`,
    )
    ? "Procedure available"
    : "No procedure available";
}
export function recoveryActor(
  ctx: Reader,
  hash: string,
  org: string,
  inc: string,
  permission: Parameters<Ports["authorize"]>[4],
  p: Ports,
  at: bigint,
) {
  const auth = p.authorize(ctx, hash, org, inc, permission, at);
  const access = currentAccess(ctx, org, inc, auth.actor.userId, at);
  if (!access) return p.fail("ACCESS_DENIED", "Incident access required.");
  return { auth, access, who: auth.actor.userId };
}
export const clock = (ctx: Reader) => ctx.db.accessClock.id.find(0)?.now ?? 0n;
export { json, key, time };
