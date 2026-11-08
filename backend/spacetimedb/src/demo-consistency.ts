import type { Ctx } from "./index";
import { appendEvent, json, time } from "./incident-domain";

// Reconcile only recognizable, unchanged seed records. Preserve message/event history.
export function reconcileDemoConsistency(ctx: Ctx) {
  if (ctx.env.AEGIS_DEVELOPMENT_MODE !== "true" && ctx.env.AEGIS_TEST_MODE !== "true") return;
  const marker = "acme-demo-consistency-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) return;
  const seed = ctx.db.scenarioSeeds.id.find("acme-phase4-v1");
  if (!seed) return;
  const now = time(ctx);
  for (const message of [...ctx.db.messages.iter()]) {
    if (message.organizationId !== "acme" || message.correctionOf ||
      message.conversationId !== `acme:${message.incidentId}:room` ||
      message.createdAt < seed.createdAt - 3_000_000n || message.createdAt > seed.createdAt - 1_800_000n ||
      [...ctx.db.messages.conversationId.filter(message.conversationId)].some((item) => item.correctionOf === message.id)) continue;
    let content = message.content;
    if (message.incidentId === "IR-2041") content = content.replace(
      "EV-018 records traffic at 09:21; isolation was reported at 09:15.",
      "EV-018 records traffic at 09:21; isolation was reported at 09:18 in EV-012.",
    );
    if (["IR-2042", "IR-2043"].includes(message.incidentId)) {
      const account = message.incidentId === "IR-2042";
      content = content.replace(
        "I will compare the reported isolation time with the preserved artifact and document the result.",
        account ? "I will compare the suspicious sign-in with EV-024 and document the account-owner review."
          : "I will review the denied database request in EV-029. A denied request does not establish successful access.",
      ).replace(
        "The October group review will distinguish potential exposure from individually confirmed impacts.",
        account ? "Account A-09 remains suspected; EV-030 records that the owner review is pending."
          : "The access review will distinguish a denied attempt from any evidence of successful database access.",
      ).replace("Support coordination is ongoing.", account ? "Account review coordination is ongoing." : "Access review coordination is ongoing.");
    }
    if (content !== message.content) ctx.db.messages.insert({
      ...message, id: 0n, content, createdAt: now, correctionOf: message.id,
    });
  }
  for (const incidentId of ["IR-2041", "IR-2042", "IR-2043"]) {
    const room = ctx.db.conversations.id.find(`acme:${incidentId}:room`);
    if (!room || room.type !== "Incident Room" || room.createdBy !== "maya") continue;
    const messages = [...ctx.db.messages.conversationId.filter(room.id)];
    const first = messages.reduce((minimum, message) => message.createdAt < minimum ? message.createdAt : minimum, room.createdAt);
    if (first < room.createdAt) {
      const createdAt = first - 60_000n;
      ctx.db.conversations.id.update({ ...room, createdAt });
      appendEvent(ctx, "acme", incidentId, "maya", "fixture_context", "Demo conversation chronology corrected",
        "The synthetic room was created before its first message. Original messages are preserved.", {
          previousValue: json({ conversationId: room.id, createdAt: room.createdAt.toString() }),
          newValue: json({ conversationId: room.id, createdAt: createdAt.toString() }),
        });
    }
  }
  const task = ctx.db.tasks.id.find("acme:IR-2043:T-09");
  if (task?.title === "Review containment evidence" && task.updatedAt === task.createdAt &&
    task.description.startsWith("Synthetic incident coordination fixture.")) {
    ctx.db.tasks.id.update({ ...task, title: "Review denied database access", updatedAt: now });
    appendEvent(ctx, "acme", "IR-2043", "maya", "task", "Task clarified: Review denied database access",
      "Corrected the synthetic task wording: this incident records a denied access attempt, not established compromise or containment.", {
        previousValue: json({ title: task.title }), newValue: json({ taskId: task.id, title: "Review denied database access" }),
      });
  }
  const isolationTask = ctx.db.tasks.id.find("acme:IR-2041:T-01");
  if (isolationTask) for (const suffix of ["ack", "escalated", "escalated:backup", "canceled"]) {
    const page = ctx.db.pages.id.find(`acme:seed:page-${suffix}`);
    if (!page || page.createdAt !== seed.createdAt - 7_200_000n ||
      page.taskId !== isolationTask.id || !["Acknowledged", "Escalated", "Canceled"].includes(page.status)) continue;
    const initial = isolationTask.createdAt + 120_000n;
    const deadline = initial + 300_000n;
    const next = { ...page,
      createdAt: page.parentPageId ? deadline : initial,
      acknowledgmentDeadline: page.parentPageId ? 0n : deadline,
      acknowledgedAt: page.status === "Acknowledged" ? (page.parentPageId ? deadline : initial) + 100_000n : 0n,
      escalatedAt: page.status === "Escalated" ? deadline : 0n,
    };
    ctx.db.pages.id.update(next);
    appendEvent(ctx, "acme", "IR-2041", "maya", "fixture_context", "Historical demo page chronology corrected",
      "The synthetic page now follows creation of its linked task; acknowledgment remains receipt only.", {
        previousValue: json({ pageId: page.id, createdAt: page.createdAt.toString() }),
        newValue: json({ pageId: page.id, createdAt: next.createdAt.toString() }),
      });
  }
  // The denied-access incident references the same inventory asset, with no copied
  // compromise assessment, customer records, or evidence from the ransomware case.
  const incidentKey = "acme:IR-2043", entityId = "acme:scope:SYS-CUSTOMER-DB";
  const associationId = `${incidentKey}:${entityId}`;
  if (ctx.db.scopeEntities.id.find(entityId) && !ctx.db.scopeAssociations.id.find(associationId)) {
    ctx.db.scopeAssociations.insert({ id: associationId, organizationId: "acme", incidentId: "IR-2043",
      incidentKey, entityId, createdBy: "maya", createdAt: now });
    for (const [sourceId, targetId, type, evidenceIds] of [
      [entityId, "finding:IR-2043:F-09", "RELATED_TO", "[]"],
      ["evidence:EV-029", "finding:IR-2043:F-09", "SUPPORTS", '["EV-029"]'],
    ]) {
      const id = `${incidentKey}:${type}:${sourceId}:${targetId}`;
      if (!ctx.db.scopeRelationships.id.find(id)) ctx.db.scopeRelationships.insert({
        id, organizationId: "acme", incidentId: "IR-2043", incidentKey, sourceId, targetId,
        type, status: "Confirmed", justification: "Existing denied-request evidence and its linked finding; no successful access or compromise is established.",
        evidenceIds, createdBy: "maya", createdAt: now,
      });
    }
    appendEvent(ctx, "acme", "IR-2043", "maya", "scope", "Denied-access investigation linked to Customer Database",
      "Linked the existing inventory asset and EV-029 to their own incident finding. No ransomware assessments or record inventory were copied.", {
        findingId: "IR-2043:F-09", evidenceIds: '["EV-029"]',
        newValue: json({ scopeEntityId: entityId }),
      });
  }
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: now });
}
