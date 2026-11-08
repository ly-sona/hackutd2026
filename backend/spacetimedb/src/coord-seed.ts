import type { Ctx } from "./index";
import { seedDemoEventTimings, seedDemoHighlightTimings } from "./demo-event-timing";
import { reconcileDemoConsistency } from "./demo-consistency";
import { ensureRoom } from "./coord-access";
import { json, key, time, appendEvent } from "./incident-domain";
import type { Reference } from "../../../shared/coordination";
export function seedCoordination(ctx: Ctx) {
  for (const i of ctx.db.incidents.iter())
    ensureRoom(ctx, i.organizationId, i.incidentId, i.createdBy);
  const marker = "acme-phase4-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) {
    seedVisualExamples(ctx);
    seedDemoEventTimings(ctx);
    reconcileDemoConsistency(ctx);
    seedDemoHighlightTimings(ctx);
    return { seeded: false };
  }
  if (!ctx.db.scenarioSeeds.id.find("acme-phase3-v1"))
    throw new Error(
      "Seed the existing incident and scope data before coordination.",
    );
  const at = time(ctx),
    org = "acme";
  const refs: Reference[] = [
    { kind: "evidence", id: "EV-018" },
    { kind: "scope", id: "acme:scope:SYS-CUSTOMER-DB" },
  ];
  const dm = (inc: string, pair: string[]) => {
    const id = `${key(org, inc)}:dm:${pair.sort().join(":")}`;
    ctx.db.conversations.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: key(org, inc),
      type: "Direct Message",
      title: "Direct Message",
      createdBy: pair[0],
      createdAt: at - 3_600_000n,
    });
    for (const userId of pair)
      ctx.db.conversationParticipants.insert({
        id: `${id}:${userId}`,
        conversationId: id,
        userId,
      });
    return id;
  };
  const dms = [
    dm("IR-2041", ["maya", "alex"]),
    dm("IR-2041", ["maya", "priya"]),
    dm("IR-2042", ["alex", "priya"]),
  ];
  const room = "acme:IR-2041:room";
  const main: [string, string, Reference[]][] = [
    [
      "alex",
      "Traffic continued after the reported isolation time. EV-018 records traffic at 09:21; isolation was reported at 09:18 in EV-012.",
      refs,
    ],
    [
      "maya",
      "Alex, please verify isolation against the original log. Keep the finding unresolved until we have evidence-backed verification.",
      [{ kind: "finding", id: "IR-2041:F-04" }],
    ],
    [
      "priya",
      "I will review the October customer data exposure. The dataset contains 1,240 records; that does not mean 1,240 individually verified affected customers.",
      [{ kind: "scope", id: "acme:scope:RG-OCTOBER" }],
    ],
    [
      "jordan",
      "I am checking purchasing and customer support availability. Please keep business impact separate from compromise certainty.",
      [{ kind: "scope", id: "acme:scope:OP-SUPPORT" }],
    ],
    [
      "alex",
      "I will compare the reported isolation time with the preserved artifact and document the result.",
      refs,
    ],
    [
      "maya",
      "Acknowledging a page confirms receipt only. Tasks and findings require their own verification.",
      [],
    ],
    [
      "priya",
      "Please reference evidence IDs rather than copying original files into chat.",
      [{ kind: "evidence", id: "EV-018" }],
    ],
    [
      "jordan",
      "Support coordination is ongoing. I will record any service impact in the existing incident.",
      [],
    ],
    [
      "alex",
      "The Customer Database remains under investigation. An access path alone is not proof of exfiltration.",
      [{ kind: "scope", id: "acme:scope:SYS-CUSTOMER-DB" }],
    ],
    [
      "maya",
      "Use the task workflow for work ownership and independent review.",
      [],
    ],
    [
      "priya",
      "The October group review will distinguish potential exposure from individually confirmed impacts.",
      [],
    ],
    [
      "jordan",
      "I am available for coordination. Availability is manually declared, not inferred from a browser connection.",
      [],
    ],
  ];
  let sequence = 0,
    firstMessage = 0n;
  function message(
    inc: string,
    c: string,
    senderId: string,
    content: string,
    references: Reference[] = [],
  ) {
    const row = ctx.db.messages.insert({
      id: 0n,
      organizationId: org,
      incidentId: inc,
      incidentKey: key(org, inc),
      conversationId: c,
      senderId,
      content,
      references: json(references),
      createdAt: at - 3_000_000n + BigInt(sequence++) * 30_000n,
      correctionOf: 0n,
    });
    return row.id;
  }
  for (const [sender, content, references] of main) {
    const id = message("IR-2041", room, sender, content, references);
    if (!firstMessage) firstMessage = id;
  }
  for (const inc of ["IR-2042", "IR-2043"])
    for (const [sender, content] of main.slice(4, 12))
      message(
        inc,
        `acme:${inc}:room`,
        sender,
        content.replace(
          "The Customer Database remains under investigation. An access path alone is not proof of exfiltration.",
          "Incident scope remains under investigation; review the incident's own evidence.",
        ).replace(
          "I will compare the reported isolation time with the preserved artifact and document the result.",
          inc === "IR-2042" ? "I will compare the suspicious sign-in with EV-024 and document the account-owner review."
            : "I will review the denied database request in EV-029. A denied request does not establish successful access.",
        ).replace(
          "The October group review will distinguish potential exposure from individually confirmed impacts.",
          inc === "IR-2042" ? "Account A-09 remains suspected; EV-030 records that the owner review is pending."
            : "The access review will distinguish a denied attempt from any evidence of successful database access.",
        ).replace("Support coordination is ongoing.", inc === "IR-2042" ? "Account review coordination is ongoing." : "Access review coordination is ongoing."),
      );
  for (const [i, c] of dms.entries()) {
    const inc = i === 2 ? "IR-2042" : "IR-2041",
      pair = [...ctx.db.conversationParticipants.conversationId.filter(c)].map(
        (p) => p.userId,
      );
    for (let j = 0; j < 3; j++)
      message(
        inc,
        c,
        pair[j % 2],
        [
          "Can you review the investigation notes with me? This conversation is restricted to its two incident responders.",
          "Yes. We should keep tentative conclusions separate from verified findings.",
          "Agreed. Any task created here must retain this conversation's access restriction.",
        ][j],
      );
  }
  for (const [userId, status] of [
    ["maya", "Available"],
    ["alex", "Available"],
    ["priya", "Busy"],
    ["jordan", "Available"],
    ["taylor", "Unavailable"],
  ])
    ctx.db.responderAvailability.insert({
      id: `acme:${userId}`,
      organizationId: org,
      userId,
      status,
      updatedAt: at - 600_000n,
    });
  const titles = [
    "Verify Customer Database isolation",
    "Review October customer data exposure",
    "Coordinate customer support access",
    "Review preserved traffic artifact",
    "Confirm business service availability",
    "Document investigation handoff",
    "Review access findings",
    "Coordinate incident response notes",
    "Review denied database access",
    "Coordinate support status",
    "Review private investigation notes",
  ];
  for (let i = 0; i < titles.length; i++) {
    const inc =
        i >= 6 && i <= 7 ? "IR-2042" : i >= 8 && i <= 9 ? "IR-2043" : "IR-2041",
      k = key(org, inc),
      id = `${k}:T-${String(i + 1).padStart(2, "0")}`,
      assignee = [
        "alex",
        "priya",
        "jordan",
        "alex",
        "jordan",
        "priya",
        "alex",
        "jordan",
        "alex",
        "jordan",
        "alex",
      ][i],
      investigation = [0, 1, 3, 6, 8, 10].includes(i);
    const references: Reference[] =
      i === 0
        ? [...refs, { kind: "finding", id: "IR-2041:F-04" }]
        : i === 1
          ? [{ kind: "scope", id: "acme:scope:RG-OCTOBER" }]
          : i === 2
            ? [{ kind: "scope", id: "acme:scope:OP-SUPPORT" }]
            : i === 3
              ? refs
              : [];
    const task = ctx.db.tasks.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      title: titles[i],
      description:
        "Synthetic incident coordination fixture. Review original evidence and record work before independent verification.",
      kind: investigation ? "Investigation" : "Coordination",
      priority: i === 0 ? "Critical" : i === 1 || i === 3 ? "High" : "Medium",
      status: i === 3 ? "In Progress" : "Open",
      assignedUserId: assignee,
      backupUserId: "maya",
      createdBy: "maya",
      createdAt: at - 2_000_000n + BigInt(i) * 1000n,
      updatedAt: at - 2_000_000n + BigInt(i) * 1000n,
      dueAt: at + BigInt(i + 1) * 3_600_000n,
      verifiedBy: "",
      verifiedAt: 0n,
      relatedFindingId: i === 0 ? "IR-2041:F-04" : "",
      sourceMessageId:
        i === 0
          ? firstMessage
          : i === 10
            ? [...ctx.db.messages.conversationId.filter(dms[0])][0].id
            : 0n,
      sourceConversationId: i === 0 ? room : i === 10 ? dms[0] : "",
      references: json(references),
    });
    const e = appendEvent(
      ctx,
      org,
      inc,
      "maya",
      "task",
      "Task assigned: " + task.title,
      task.description,
      {
        createdAt: task.createdAt,
        observedAt: task.createdAt,
        newValue: json({ taskId: id }),
      },
    );
    if (task.sourceConversationId)
      ctx.db.coordinationEventVisibility.insert({
        id: e.id,
        conversationId: task.sourceConversationId,
      });
  }
  const task = ctx.db.tasks.id.find("acme:IR-2041:T-01")!;
  const base = {
    organizationId: org,
    incidentId: "IR-2041",
    incidentKey: task.incidentKey,
    taskId: task.id,
    requestedBy: "maya",
    pagedUserId: "alex",
    backupUserId: "maya",
    createdAt: task.createdAt + 120_000n,
    acknowledgmentDeadline: task.createdAt + 420_000n,
    acknowledgedBy: "",
    acknowledgedAt: 0n,
    escalatedAt: 0n,
    parentPageId: "",
    reason: "Synthetic historical page; acknowledgment is not resolution.",
  };
  ctx.db.pages.insert({
    ...base,
    id: "acme:seed:page-ack",
    status: "Acknowledged",
    acknowledgedBy: "alex",
    acknowledgedAt: base.createdAt + 100_000n,
  });
  ctx.db.pages.insert({
    ...base,
    id: "acme:seed:page-escalated",
    status: "Escalated",
    escalatedAt: base.acknowledgmentDeadline,
  });
  ctx.db.pages.insert({
    ...base,
    id: "acme:seed:page-escalated:backup",
    status: "Acknowledged",
    pagedUserId: "maya",
    parentPageId: "acme:seed:page-escalated",
    createdAt: base.acknowledgmentDeadline,
    acknowledgmentDeadline: 0n,
    acknowledgedBy: "maya",
    acknowledgedAt: base.acknowledgmentDeadline + 100_000n,
  });
  ctx.db.pages.insert({
    ...base,
    id: "acme:seed:page-canceled",
    status: "Canceled",
    reason: "Historical requester cancellation.",
  });
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: at });
  seedVisualExamples(ctx);
  seedDemoEventTimings(ctx);
  reconcileDemoConsistency(ctx);
  seedDemoHighlightTimings(ctx);
  return { seeded: true };
}

// Additive local demo examples. Never rewrite existing findings or event history.
function seedVisualExamples(ctx: Ctx) {
  if (
    ctx.env.AEGIS_DEVELOPMENT_MODE !== "true" &&
    ctx.env.AEGIS_TEST_MODE !== "true"
  )
    return;
  const marker = "acme-ui-examples-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) return;
  const at = time(ctx),
    org = "acme",
    inc = "IR-2041",
    incidentKey = key(org, inc);
  const examples = [
    {
      id: "UI-01",
      title: "Conflicting isolation reports",
      description:
        "Outbound traffic was observed after isolation was reported. Verify containment against EV-018.",
      priority: "Critical",
      assignedTo: "alex",
      relatedSystem: "Customer Database",
      evidence: ["EV-018"],
      seconds: 60n,
    },
    {
      id: "UI-02",
      title: "Vendor approval depends on affected SSO",
      description:
        "An independent approval route is available. A human approval is still required.",
      priority: "High",
      assignedTo: "maya",
      relatedSystem: "Vendor Purchasing",
      evidence: [],
      seconds: 180n,
    },
    {
      id: "UI-03",
      title: "Verify October customer exposure",
      description:
        "Access path identified. Record-level impact remains unconfirmed.",
      priority: "Low",
      assignedTo: "alex",
      relatedSystem: "October Customer Records",
      evidence: ["EV-021"],
      seconds: 240n,
    },
  ];
  for (const item of examples) {
    const id = `${inc}:${item.id}`,
      timestamp = at - item.seconds * 1000n;
    if (ctx.db.findings.id.find(id)) continue;
    ctx.db.findings.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey,
      title: item.title,
      description: item.description,
      category: "Investigation",
      priority: item.priority,
      status: "Unverified",
      observedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      reportedBy: "maya",
      assignedTo: item.assignedTo,
      relatedSystem: item.relatedSystem,
      verifiedBy: "",
      verifiedAt: 0n,
    });
    appendEvent(
      ctx,
      org,
      inc,
      "maya",
      "finding",
      item.title,
      item.description,
      {
        createdAt: timestamp,
        observedAt: timestamp,
        findingId: id,
        evidenceIds: json(item.evidence),
        status: "Unverified",
        newValue:
          item.id === "UI-01"
            ? json({
                scopeEntityId: "acme:scope:OP-SUPPORT",
                businessStatus: "Restricted",
              })
            : "",
      },
    );
    for (const evidenceId of item.evidence) {
      ctx.db.evidenceLinks.insert({
        id: `seed:${id}:${evidenceId}`,
        organizationId: org,
        incidentId: inc,
        incidentKey,
        evidenceId,
        findingId: id,
        eventId: "",
        annotation: item.description,
        excerpt: "",
        futureReference: "",
        createdBy: "maya",
        createdAt: timestamp,
      });
    }
  }
  appendEvent(
    ctx,
    org,
    inc,
    "maya",
    "decision",
    "Independent purchasing route documented",
    "Synthetic business continuity update: a fallback approval route is available. No purchase has been approved or executed.",
    {
      createdAt: at - 120000n,
      observedAt: at - 120000n,
      status: "Documented",
      newValue: json({
        scopeEntityId: "acme:scope:OP-PURCHASING",
        businessStatus: "Fallback available",
      }),
    },
  );
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: at });
}
