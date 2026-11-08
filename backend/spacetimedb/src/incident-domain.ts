import { moduleId } from "./module-id";
import {
  canReadFinding,
  canReadConversation,
  canReadCoordinationEvent,
  ensureRoom,
} from "./coord-access";
import type { Ctx, Reader } from "./index";
import type { Permission } from "./permissions";
import { matrix, isRole } from "./permissions";
import { seedScenario } from "./incident-seed";

type Access = {
  organizationId: string;
  incidentId: string;
  userId: string;
  permissions: string;
};
export type Ports = {
  authorize: (
    ctx: Reader,
    hash: string,
    org: string,
    incident: string,
    permission: Permission,
    at: bigint,
  ) => { actor: { userId: string }; member: { role: string } };
  activeMember: (
    ctx: Reader,
    org: string,
    user: string,
    at: bigint,
  ) => { role: string } | undefined;
  fail: (code: string, message: string) => never;
};
export const time = (ctx: Ctx) => ctx.timestamp.microsSinceUnixEpoch / 1000n;
export const key = (org: string, incident: string) => `${org}:${incident}`;
export const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
function str(
  data: Record<string, unknown>,
  field: string,
  max = 200,
  optional = false,
): string {
  const v = data[field];
  if (optional && (v === undefined || v === "")) return "";
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new InputError(`Invalid ${field}.`);
  return v.trim();
}
class InputError extends Error {}
const choices = {
  severity: ["Critical", "High", "Medium", "Low"],
  incidentStatus: [
    "Open",
    "Investigating",
    "Contained",
    "Recovering",
    "Resolved",
    "Closed",
  ],
  findingStatus: [
    "Unverified",
    "Suspected",
    "Confirmed",
    "Resolved",
    "Ruled Out",
  ],
  type: [
    "Ransomware",
    "Unauthorized Access",
    "Data Breach",
    "Account Compromise",
    "Malware",
    "Other",
  ],
};
function choice(
  data: Record<string, unknown>,
  field: string,
  values: readonly string[],
) {
  const v = str(data, field);
  if (!values.includes(v)) throw new InputError(`Invalid ${field}.`);
  return v;
}
function date(data: Record<string, unknown>, field: string, optional = false) {
  const v = optional && !data[field] ? 0 : Number(data[field]);
  if (!Number.isSafeInteger(v) || v < 0 || v > 8640000000000000)
    throw new InputError(`Invalid ${field}.`);
  return BigInt(v);
}
function ids(data: Record<string, unknown>, field: string) {
  const v = data[field] ?? [];
  if (
    !Array.isArray(v) ||
    v.length > 20 ||
    v.some((x) => typeof x !== "string" || x.length > 100)
  )
    throw new InputError(`Invalid ${field}.`);
  return [...new Set(v)] as string[];
}
export function appendEvent(
  ctx: Ctx,
  org: string,
  inc: string,
  actor: string,
  type: string,
  title: string,
  description: string,
  options: Partial<{
    createdAt: bigint;
    observedAt: bigint;
    findingId: string;
    evidenceIds: string;
    status: string;
    previousValue: string;
    newValue: string;
    correctsEventId: string;
  }> = {},
) {
  return ctx.db.incidentEvents.insert({
    id: 0n,
    organizationId: org,
    incidentId: inc,
    incidentKey: key(org, inc),
    actorId: actor,
    type,
    title,
    description,
    createdAt: time(ctx),
    observedAt: time(ctx),
    findingId: "",
    evidenceIds: "[]",
    status: "",
    previousValue: "",
    newValue: "",
    correctsEventId: "",
    ...options,
  });
}
function recipients(ctx: Ctx, org: string, inc: string, ports: Ports) {
  return [...ctx.db.incidentMemberships.organizationId.filter(org)].filter(
    (m) =>
      m.incidentId === inc &&
      m.membershipStatus === "active" &&
      ports.activeMember(ctx, org, m.userId, time(ctx)),
  );
}
function notify(
  ctx: Ctx,
  org: string,
  inc: string,
  actor: string,
  title: string,
  description: string,
  type: string,
  findingId: string,
  ports: Ports,
  only?: string[],
) {
  for (const m of recipients(ctx, org, inc, ports))
    if (m.userId !== actor && (!only || only.includes(m.userId)))
      ctx.db.notifications.insert({
        id: 0n,
        organizationId: org,
        incidentId: inc,
        incidentKey: key(org, inc),
        recipientId: m.userId,
        title,
        description,
        type,
        findingId,
        createdAt: time(ctx),
        readAt: 0n,
      });
}
export function incidentAccessEvent(
  ctx: Ctx,
  org: string,
  actor: string,
  target: string,
  action: string,
  metadata: string,
) {
  if (!/^(member\.|invitation\.|membership\.)/.test(action)) return;
  for (const incident of ctx.db.incidentStubs.organizationId.filter(org)) {
    const actual = ctx.db.incidents.id.find(incident.id);
    if (!actual) continue;
    const assigned =
      target &&
      ctx.db.incidentMemberships.id.find(
        `${org}:${actual.incidentId}:${target}`,
      );
    if (assigned || metadata.includes(actual.incidentId))
      appendEvent(
        ctx,
        org,
        actual.incidentId,
        actor,
        "access",
        action,
        `System access record for ${target || "invitation"}. ${metadata}`,
        { status: "Administrative" },
      );
  }
}
export function evidenceDescriptor(
  ctx: Reader,
  hash: string,
  evidenceId: string,
  ports: Ports,
  at: bigint,
) {
  const item = ctx.db.evidence.id.find(evidenceId);
  if (!item) return ports.fail("NOT_FOUND", "Evidence is unavailable.");
  ports.authorize(
    ctx,
    hash,
    item.organizationId,
    item.incidentId,
    "evidence:view",
    at,
  );
  return item;
}
export function incidentCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  ports: Ports,
): unknown {
  try {
    return execute(ctx, action, hash, d, ports);
  } catch (e) {
    if (e instanceof InputError) return ports.fail("INVALID_INPUT", e.message);
    throw e;
  }
}
function execute(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  if (action === "incident.seed") return seedScenario(ctx, d, p);
  if (action === "incident.reset") {
    if (
      ctx.env.AEGIS_DEVELOPMENT_MODE !== "true" ||
      d.confirm !== "RESET DISPOSABLE DEMO READ STATE" ||
      d.incidentId !== "IR-2043"
    )
      return p.fail(
        "ACCESS_DENIED",
        "Reset requires development mode, an explicit confirmation, and disposable IR-2043 scope.",
      );
    // A deliberately narrow reset: no incidents, evidence, history, findings, accounts or user-created rows are deleted.
    const k = key("acme", "IR-2043");
    for (const row of ctx.db.findingReads.incidentKey.filter(k))
      ctx.db.findingReads.id.delete(row.id);
    for (const row of ctx.db.incidentVisits.incidentKey.filter(k))
      ctx.db.incidentVisits.id.delete(row.id);
    for (const row of ctx.db.visitWindows.incidentKey.filter(k))
      ctx.db.visitWindows.id.delete(row.id);
    return { reset: true };
  }
  const org = str(d, "organizationId", 100),
    inc = action === "incident.create" ? "" : str(d, "incidentId", 100);
  const permission: Permission =
    action === "incident.create"
      ? "incident:create"
      : action === "incident.update"
        ? "incident:manage"
        : action === "incident.finding.create"
          ? "findings:create"
          : action === "incident.finding.update"
            ? "findings:edit"
            : action === "incident.evidence" || action === "incident.link"
              ? "evidence:upload"
              : action === "incident.note"
                ? "notes:create"
                : "incident:view";
  const { actor, member: membership } = p.authorize(
    ctx,
    hash,
    org,
    inc,
    permission,
    time(ctx),
  );
  const access = {
    userId: actor.userId,
    organizationId: org,
    incidentId: inc,
    permissions: json(isRole(membership.role) ? matrix[membership.role] : []),
  };
  const who = actor.userId,
    k = key(org, inc),
    at = time(ctx);
  const existing = inc ? ctx.db.incidents.id.find(k) : undefined;
  if (inc && !existing) return p.fail("NOT_FOUND", "Incident not found.");
  function member(user: string, commander = false) {
    if (!user) return;
    const m = p.activeMember(ctx, org, user, at);
    if (!m || (commander && m.role !== "commander"))
      return p.fail(
        "INVALID_INPUT",
        commander
          ? "Select an active Incident Commander in this organization."
          : "Select an active responder.",
      );
    if (
      inc &&
      ctx.db.incidentMemberships.id.find(`${org}:${inc}:${user}`)
        ?.membershipStatus !== "active"
    )
      return p.fail(
        "INVALID_INPUT",
        "Responder is not assigned to this incident.",
      );
  }
  function finding(id: string) {
    const f = ctx.db.findings.id.find(id);
    if (!f || f.incidentKey !== k || !canReadFinding(ctx, access, id))
      return p.fail("NOT_FOUND", "Finding is unavailable in this incident.");
    return f;
  }
  function checkedEvidence(evidenceIds: string[]) {
    // Linking or inspecting technical evidence requires evidence access as well as finding permissions.
    if (evidenceIds.length)
      p.authorize(ctx, hash, org, inc, "evidence:view", at);
    for (const id of evidenceIds) {
      const ev = ctx.db.evidence.id.find(id);
      if (!ev || ev.incidentKey !== k)
        return p.fail(
          "INVALID_INPUT",
          "Evidence must belong to this incident.",
        );
    }
  }
  if (action === "incident.create") {
    const title = str(d, "title"),
      description = str(d, "description", 6000),
      type = choice(d, "type", choices.type),
      severity = choice(d, "severity", choices.severity),
      discoveredAt = date(d, "discoveredAt"),
      commanderId = str(d, "commanderId", 100, true),
      systems = str(d, "systems", 1000, true),
      impact = str(d, "impact", 2000, true);
    member(commanderId, true);
    const assigned = ids(d, "responderIds");
    for (const id of assigned) member(id);
    const counter = ctx.db.incidentCounters.organizationId.find(org);
    const n = counter?.next ?? 2044;
    const id = `IR-${n}`,
      incidentKey = key(org, id);
    if (ctx.db.incidentStubs.id.find(incidentKey))
      return p.fail("CONFLICT", "Incident identifier is already in use.");
    if (counter)
      ctx.db.incidentCounters.organizationId.update({
        ...counter,
        next: n + 1,
      });
    else ctx.db.incidentCounters.insert({ organizationId: org, next: n + 1 });
    ctx.db.incidents.insert({
      id: incidentKey,
      organizationId: org,
      incidentId: id,
      incidentKey,
      title,
      description,
      type,
      severity,
      status: "Open",
      systems,
      impact,
      discoveredAt,
      createdAt: at,
      updatedAt: at,
      createdBy: who,
      commanderId,
    });
    ctx.db.incidentStubs.insert({
      id: incidentKey,
      organizationId: org,
      title,
    });
    for (const userId of new Set(
      [who, commanderId, ...assigned].filter(Boolean),
    ))
      ctx.db.incidentMemberships.insert({
        id: `${org}:${id}:${userId}`,
        organizationId: org,
        incidentId: id,
        userId,
        membershipStatus: "active",
        createdAt: ctx.timestamp,
      });
    ensureRoom(ctx, org, id, who);
    appendEvent(ctx, org, id, who, "incident", "Incident opened", description, {
      status: "Open",
      observedAt: discoveredAt,
    });
    notify(
      ctx,
      org,
      id,
      who,
      "New incident: " + title,
      description,
      "incident",
      "",
      p,
    );
    return { incidentId: id };
  }
  if (action === "incident.update") {
    const description = str(d, "description", 6000),
      severity = choice(d, "severity", choices.severity),
      status = choice(d, "status", choices.incidentStatus),
      commanderId = str(d, "commanderId", 100, true),
      reason = str(d, "reason", 2000);
    if (status === "Closed" && existing!.status !== "Closed")
      return p.fail(
        "ACCESS_DENIED",
        "Incident closure requires a separate independently approved closure request.",
      );
    member(commanderId, true);
    const next = {
      ...existing!,
      description,
      severity,
      status,
      commanderId,
      updatedAt: at,
    };
    const changes = (
      ["description", "severity", "status", "commanderId"] as const
    ).filter((field) => existing![field] !== next[field]);
    if (!changes.length) return { changed: false };
    ctx.db.incidents.id.update(next);
    for (const field of changes)
      appendEvent(
        ctx,
        org,
        inc,
        who,
        field === "status" || field === "severity" ? "status" : "incident",
        `${field === "commanderId" ? "Commander" : field} changed`,
        reason,
        { previousValue: existing![field], newValue: next[field], status },
      );
    if (changes.includes("status") || severity === "Critical")
      notify(
        ctx,
        org,
        inc,
        who,
        `${inc}: ${status} · ${severity}`,
        reason,
        "status",
        "",
        p,
      );
    return { changed: true };
  }
  if (
    action === "incident.finding.create" ||
    action === "incident.finding.update"
  ) {
    const old = action.endsWith("update")
      ? finding(str(d, "findingId", 100))
      : undefined;
    const title = str(d, "title"),
      description = str(d, "description", 6000),
      category = str(d, "category", 100),
      priority = choice(d, "priority", choices.severity),
      status = choice(d, "status", choices.findingStatus),
      observedAt = date(d, "observedAt"),
      relatedSystem = str(d, "relatedSystem", 1000, true),
      assignedTo = str(d, "assignedTo", 100, true),
      reason = str(d, "reason", 2000, true),
      evidenceIds = ids(d, "evidenceIds");
    member(assignedTo);
    if (old && assignedTo) {
      const source = ctx.db.coordinationFindings.id.find(old.id);
      if (
        source &&
        !ctx.db.conversationParticipants.id.find(
          `${source.conversationId}:${assignedTo}`,
        ) &&
        ctx.db.conversations.id.find(source.conversationId)?.type ===
          "Direct Message"
      )
        return p.fail(
          "ACCESS_DENIED",
          "The assignee must be a participant in the source conversation.",
        );
    }
    checkedEvidence(evidenceIds);
    const verification = status === "Confirmed" || status === "Resolved";
    if (verification) {
      p.authorize(ctx, hash, org, inc, "findings:verify", at);
      if (!evidenceIds.length || !reason)
        return p.fail(
          "INVALID_INPUT",
          "Confirmation or resolution requires supporting evidence and a verification justification.",
        );
    }
    const id =
      old?.id ??
      `${k}:F-${moduleId(ctx, (id) => !!ctx.db.findings.id.find(`${k}:F-${id}`))}`;
    const row = {
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      title,
      description,
      category,
      priority,
      status,
      observedAt,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
      reportedBy: old?.reportedBy ?? who,
      assignedTo,
      relatedSystem,
      verifiedBy: verification ? who : "",
      verifiedAt: verification ? at : 0n,
    };
    if (old) ctx.db.findings.id.update(row);
    else ctx.db.findings.insert(row);
    for (const evidenceId of evidenceIds) {
      const linkId = `${id}:${evidenceId}`;
      if (!ctx.db.evidenceLinks.id.find(linkId))
        ctx.db.evidenceLinks.insert({
          id: linkId,
          organizationId: org,
          incidentId: inc,
          incidentKey: k,
          evidenceId,
          findingId: id,
          eventId: "",
          annotation: reason,
          excerpt: "",
          futureReference: "",
          createdBy: who,
          createdAt: at,
        });
    }
    const readId = `${who}:${id}`,
      read = {
        id: readId,
        organizationId: org,
        incidentId: inc,
        incidentKey: k,
        userId: who,
        findingId: id,
        readAt: at,
      };
    if (ctx.db.findingReads.id.find(readId))
      ctx.db.findingReads.id.update(read);
    else ctx.db.findingReads.insert(read);
    const eventTitle = !old
      ? "Finding added: " + title
      : old.status !== status
        ? `Finding ${status === "Resolved" ? "resolved" : ["Resolved", "Ruled Out"].includes(old.status) ? "reopened" : "status changed"}: ${title}`
        : "Finding updated: " + title;
    appendEvent(
      ctx,
      org,
      inc,
      who,
      "finding",
      eventTitle,
      `${description}${reason ? "\nJustification: " + reason : ""}`,
      {
        findingId: id,
        evidenceIds: json(evidenceIds),
        status,
        observedAt,
        previousValue: old ? json(old) : "",
        newValue: json(row),
      },
    );
    if (
      priority === "High" ||
      priority === "Critical" ||
      old?.status !== status
    )
      notify(ctx, org, inc, who, eventTitle, description, "finding", id, p);
    return { findingId: id };
  }
  if (action === "incident.evidence") {
    const id = str(d, "id", 100),
      filename = str(d, "filename", 180),
      contentType = str(d, "contentType", 100),
      storageReference = str(d, "storageReference", 100),
      sha256 = str(d, "sha256", 64),
      size = date(d, "size"),
      description = str(d, "description", 4000),
      source = str(d, "source", 1000),
      collectedAt = date(d, "collectedAt", true),
      status = choice(d, "status", choices.findingStatus),
      findingId = str(d, "findingId", 100, true),
      annotation = str(d, "annotation", 2000, true),
      excerpt = str(d, "excerpt", 2000, true);
    if (findingId) finding(findingId);
    if (
      ctx.db.evidence.id.find(id) ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !/^[a-f0-9-]{36}$/.test(storageReference) ||
      size === 0n ||
      size > 5242880n ||
      ![
        "text/plain",
        "application/json",
        "application/pdf",
        "image/png",
        "image/jpeg",
      ].includes(contentType)
    )
      return p.fail("INVALID_INPUT", "Invalid or duplicate evidence metadata.");
    ctx.db.evidence.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      filename,
      contentType,
      size,
      storageReference,
      sha256,
      description,
      source,
      status,
      collectedAt,
      uploadedAt: at,
      uploadedBy: who,
    });
    const event = appendEvent(
      ctx,
      org,
      inc,
      who,
      "evidence",
      "Evidence attached: " + filename,
      description,
      {
        findingId,
        evidenceIds: json([id]),
        status,
        observedAt: collectedAt || at,
      },
    );
    ctx.db.evidenceLinks.insert({
      id: `${id}:initial`,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      evidenceId: id,
      findingId,
      eventId: event.id.toString(),
      annotation,
      excerpt,
      futureReference: "",
      createdBy: who,
      createdAt: at,
    });
    if (findingId) {
      const f = finding(findingId);
      notify(
        ctx,
        org,
        inc,
        who,
        "Evidence added: " + f.title,
        description,
        "evidence",
        findingId,
        p,
        [f.assignedTo, f.reportedBy],
      );
    }
    return { evidenceId: id };
  }
  if (action === "incident.link") {
    const evidenceId = str(d, "evidenceId", 100),
      findingId = str(d, "findingId", 100),
      annotation = str(d, "annotation", 2000),
      excerpt = str(d, "excerpt", 2000, true);
    checkedEvidence([evidenceId]);
    finding(findingId);
    const id = moduleId(ctx, (id) => !!ctx.db.evidenceLinks.id.find(id));
    ctx.db.evidenceLinks.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      evidenceId,
      findingId,
      eventId: "",
      annotation,
      excerpt,
      futureReference: "",
      createdBy: who,
      createdAt: at,
    });
    appendEvent(
      ctx,
      org,
      inc,
      who,
      "evidence",
      "Evidence annotation added",
      annotation,
      { findingId, evidenceIds: json([evidenceId]) },
    );
    return { id };
  }
  if (action === "incident.note") {
    const type = choice(d, "type", [
        "observation",
        "action",
        "decision",
        "note",
        "correction",
      ]),
      title = str(d, "title"),
      description = str(d, "description", 6000),
      findingId = str(d, "findingId", 100, true),
      correctsEventId = str(d, "correctsEventId", 100, true),
      evidenceIds = ids(d, "evidenceIds");
    if (findingId) finding(findingId);
    checkedEvidence(evidenceIds);
    if (type === "correction") {
      if (
        !/^\d+$/.test(correctsEventId) ||
        ctx.db.incidentEvents.id.find(BigInt(correctsEventId))?.incidentKey !==
          k
      )
        return p.fail(
          "INVALID_INPUT",
          "Select an original event in this incident and explain the correction.",
        );
    } else if (correctsEventId)
      return p.fail(
        "INVALID_INPUT",
        "Only corrections may reference an original event.",
      );
    const corrected = correctsEventId
      ? ctx.db.incidentEvents.id.find(BigInt(correctsEventId))
      : undefined;
    if (
      corrected &&
      (!canReadCoordinationEvent(ctx, access, corrected.id) ||
        (corrected.findingId &&
          !canReadFinding(ctx, access, corrected.findingId)))
    )
      return p.fail("NOT_FOUND", "Original event unavailable.");
    const noteEvent = appendEvent(
      ctx,
      org,
      inc,
      who,
      type,
      title,
      description,
      {
        findingId,
        evidenceIds: json(evidenceIds),
        correctsEventId,
        status:
          type === "action"
            ? "Reported action; outcome unverified"
            : "Documented",
      },
    );
    const sourceVisibility =
      corrected &&
      (ctx.db.coordinationEventVisibility.id.find(corrected.id)
        ?.conversationId ||
        (corrected.findingId &&
          ctx.db.coordinationFindings.id.find(corrected.findingId)
            ?.conversationId));
    if (sourceVisibility)
      ctx.db.coordinationEventVisibility.insert({
        id: noteEvent.id,
        conversationId: sourceVisibility,
      });
    return { added: true };
  }
  if (action === "incident.read") {
    const f = finding(str(d, "findingId", 100)),
      id = `${who}:${f.id}`;
    const row = {
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      userId: who,
      findingId: f.id,
      readAt: at,
    };
    if (ctx.db.findingReads.id.find(id)) ctx.db.findingReads.id.update(row);
    else ctx.db.findingReads.insert(row);
    return { read: true };
  }
  if (action === "incident.visit") {
    const visitId = str(d, "visitId", 100),
      id = `${who}:${k}:${visitId}`,
      previous = ctx.db.visitWindows.id.find(id);
    if (previous) return { cutoff: previous.cutoff };
    const lastId = `${who}:${k}`,
      last = ctx.db.incidentVisits.id.find(lastId);
    const cutoff = last?.lastViewedAt ?? 0n;
    ctx.db.visitWindows.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      userId: who,
      visitId,
      cutoff,
      openedAt: at,
    });
    const row = {
      id: lastId,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      userId: who,
      lastViewedAt: at,
    };
    if (last) ctx.db.incidentVisits.id.update(row);
    else ctx.db.incidentVisits.insert(row);
    return { cutoff };
  }
  if (action === "incident.notification.read") {
    const id = str(d, "notificationId", 30);
    if (!/^\d+$/.test(id))
      return p.fail("INVALID_INPUT", "Invalid notification.");
    const n = ctx.db.notifications.id.find(BigInt(id));
    if (!n || n.incidentKey !== k || n.recipientId !== who)
      return p.fail("NOT_FOUND", "Notification is unavailable.");
    ctx.db.notifications.id.update({ ...n, readAt: at });
    return { read: true };
  }
  return p.fail("INVALID_INPUT", "Unknown incident action.");
}
export function incidentProjection(ctx: Reader, access: Access[]) {
  const rows: {
    id: string;
    kind: string;
    organizationId: string;
    incidentId: string;
    body: string;
  }[] = [];
  const seen = new Set<string>();
  for (const a of access) {
    const k = key(a.organizationId, a.incidentId);
    if (seen.has(k)) continue;
    seen.add(k);
    const allowed = JSON.parse(a.permissions) as string[];
    const emit = (kind: string, id: string | bigint, value: unknown) =>
      rows.push({
        id: `${kind}:${id}`,
        kind,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        body: json(value),
      });
    const i = ctx.db.incidents.id.find(k);
    if (!i) continue;
    emit("incident", i.id, i);
    const events = [...ctx.db.incidentEvents.incidentKey.filter(k)];
    const timingCorrections = new Map(events
      .filter((event) => event.type === "fixture_timing")
      .sort((left, right) => left.id < right.id ? -1 : 1)
      .map((event) => [event.correctsEventId, event]));
    const findingTimes = new Map<string, { observedAt: bigint; createdAt: bigint; originalCreatedAt: bigint; originalObservedAt: bigint }>();
    const evidenceTimes = new Map<string, bigint>();
    for (const event of events) {
      const correction = timingCorrections.get(event.id.toString());
      if (!correction) continue;
      const timing = JSON.parse(correction.newValue);
      const createdAt = BigInt(timing.createdAt ?? event.createdAt);
      if (event.type === "finding") findingTimes.set(event.findingId, {
        observedAt: BigInt(timing.observedAt), createdAt, originalCreatedAt: event.createdAt, originalObservedAt: event.observedAt,
      });
      if (event.type === "evidence") evidenceTimes.set(event.title.replace("Evidence attached: ", ""), createdAt);
    }
    for (const f of ctx.db.findings.incidentKey.filter(k)) {
      if (!canReadFinding(ctx, a, f.id)) continue;
      const timing = findingTimes.get(f.id);
      // Later responder edits take precedence over the original demo fixture correction.
      emit("finding", f.id, timing && f.createdAt === timing.originalCreatedAt ? {
        ...f,
        observedAt: f.observedAt === timing.originalObservedAt ? timing.observedAt : f.observedAt,
        createdAt: timing.createdAt,
        updatedAt: f.updatedAt < timing.createdAt ? timing.createdAt : f.updatedAt,
      } : f);
    }
    for (const e of events) {
      if (e.type === "fixture_timing" || e.type === "fixture_context") continue;
      // Legacy seed-maintenance notes remain in append-only storage, rather than
      // displacing responder activity in the incident's operational feed.
      if (e.type === "note" && e.actorId === "maya" && (
        (e.title === "Demo conversation chronology corrected" &&
          e.description === "The synthetic room was created before its first message. Original messages are preserved.") ||
        (e.title === "Historical demo page chronology corrected" &&
          e.description === "The synthetic page now follows creation of its linked task; acknowledgment remains receipt only.")
      )) continue;
      if (
        !canReadCoordinationEvent(ctx, a, e.id) ||
        (e.findingId && !canReadFinding(ctx, a, e.findingId))
      )
        continue;
      let safe = e;
      if (e.type === "scope" && !allowed.includes("scope:records")) {
        let target = "";
        try {
          target = JSON.parse(e.newValue).scopeEntityId ?? "";
        } catch {
          /* Old events may not contain structured metadata. */
        }
        if (ctx.db.scopeRecords.id.find(target))
          safe = {
            ...e,
            title: "Record scope updated",
            description:
              "Individual investigation changed. Record details require an authorized investigation role.",
            previousValue: "",
            newValue: "{}",
            evidenceIds: "[]",
            findingId: "",
          };
      }
      const correction = timingCorrections.get(e.id.toString());
      const projected = correction ? {
        ...safe,
        observedAt: BigInt(JSON.parse(correction.newValue).observedAt),
        createdAt: BigInt(JSON.parse(correction.newValue).createdAt ?? e.createdAt),
        originalObservedAt: e.observedAt,
        originalRecordedAt: e.createdAt,
        timingCorrectionId: correction.id.toString(),
        timingCorrectedAt: correction.createdAt,
      } : safe;
      emit(
        "event",
        e.id,
        allowed.includes("evidence:view")
          ? projected
          : { ...projected, evidenceIds: "[]" },
      );
    }
    if (allowed.includes("evidence:view")) {
      for (const e of ctx.db.evidence.incidentKey.filter(k)) {
        const { storageReference: _private, ...safe } = e;
        void _private;
        emit("evidence", e.id, { ...safe, uploadedAt: evidenceTimes.get(e.id) ?? safe.uploadedAt });
      }
      for (const l of ctx.db.evidenceLinks.incidentKey.filter(k))
        if (!l.findingId || canReadFinding(ctx, a, l.findingId))
          emit("link", l.id, l);
    }
    for (const r of ctx.db.findingReads.incidentKey.filter(k))
      if (r.userId === a.userId) emit("read", r.id, r);
    for (const n of ctx.db.notifications.recipientId.filter(a.userId))
      if (
        n.incidentKey === k &&
        (!n.findingId || canReadFinding(ctx, a, n.findingId))
      ) {
        const target = ctx.db.coordinationNotificationTargets.id.find(n.id);
        if (
          target?.conversationId &&
          !canReadConversation(ctx, a, target.conversationId)
        )
          continue;
        const targetTask = target?.taskId
          ? ctx.db.tasks.id.find(target.taskId)
          : undefined;
        if (
          targetTask?.sourceConversationId &&
          !canReadConversation(ctx, a, targetTask.sourceConversationId)
        )
          continue;
        emit("notification", n.id, {
          ...n,
          conversationId: target?.conversationId ?? "",
          taskId: target?.taskId ?? "",
          pageId: target?.pageId ?? "",
        });
      }
  }
  return rows;
}
