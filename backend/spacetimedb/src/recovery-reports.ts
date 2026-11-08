import type { Ctx, Reader } from "./index";
import { appendEvent, type Ports } from "./incident-domain";
import { scopeSnapshot } from "./scope-domain";
import {
  has,
  scoped,
  key,
  json,
  input,
  recoveryId,
  recoveryActor,
} from "./recovery-access";
import {
  reportSourcePermissions,
  reportingStandards,
  type ReportSnapshot,
  type ReportSection,
  type CompletenessCheck,
} from "../../../shared/recovery";
import type { CoordinationAccess } from "./coord-access";
export function reportAllowed(
  a: CoordinationAccess | undefined,
  legal = false,
) {
  return (
    reportSourcePermissions.every((p) => has(a, p)) &&
    (!legal || has(a, "legal:view"))
  );
}
const stamp = (n: bigint) =>
  n ? new Date(Number(n)).toISOString() : "Not yet established";
export function snapshotReport(
  ctx: Reader,
  org: string,
  inc: string,
  user: string,
  type: string,
  legal: boolean,
  at: bigint,
  id = "",
  version = 0,
): ReportSnapshot {
  const k = key(org, inc),
    incident = ctx.db.incidents.id.find(k)!,
    meta = ctx.db.incidentReportingMetadata.id.find(k),
    s = scopeSnapshot(ctx, org, inc);
  // Incident-wide artifacts deliberately exclude DM-derived information, even when their generator participates in the DM.
  const privateFinding = (id: string) => {
    const source = ctx.db.coordinationFindings.id.find(id);
    return (
      source &&
      ctx.db.conversations.id.find(source.conversationId)?.type !==
        "Incident Room"
    );
  };
  const findings = [...ctx.db.findings.incidentKey.filter(k)].filter(
    (f) => !privateFinding(f.id),
  );
  const events = [...ctx.db.incidentEvents.incidentKey.filter(k)]
    .filter((e) => {
      const source = ctx.db.coordinationEventVisibility.id.find(e.id);
      return (
        (!source ||
          ctx.db.conversations.id.find(source.conversationId)?.type ===
            "Incident Room") &&
        (!e.findingId || !privateFinding(e.findingId))
      );
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const evidence = [...ctx.db.evidence.incidentKey.filter(k)];
  const tasks = [...ctx.db.tasks.incidentKey.filter(k)].filter(
    (t) =>
      !t.sourceConversationId ||
      ctx.db.conversations.id.find(t.sourceConversationId)?.type ===
        "Incident Room",
  );
  const executions = [...ctx.db.recoveryExecutions.incidentKey.filter(k)],
    requests = [...ctx.db.approvalRequests.incidentKey.filter(k)],
    operations = [...ctx.db.businessOperations.incidentKey.filter(k)],
    review = legal ? ctx.db.legalReviews.id.find(k) : undefined;
  const sections: ReportSection[] = [];
  const section = (
    id: string,
    title: string,
    fields: [string, string][],
    tables: ReportSection["tables"] = [],
  ) =>
    sections.push({
      id,
      title,
      fields: fields.map(([label, value]) => ({ label, value })),
      tables,
    });
  section("identification", "1. Incident Identification", [
    ["Incident", inc],
    ["Title", incident.title],
    ["Organization", ctx.db.organizations.id.find(org)?.name ?? org],
    ["Status", incident.status],
    ["Severity", incident.severity],
    ["Type", incident.type],
    [
      "Commander",
      ctx.db.users.id.find(incident.commanderId)?.displayName ??
        incident.commanderId,
    ],
    ["Description", incident.description],
  ]);
  section("discovery", "2. Discovery and Detection", [
    ["Discovered", stamp(incident.discoveredAt)],
    ["Reported", stamp(meta?.reportedAt ?? 0n)],
    ["Detection source", meta?.detectionSource || "Not yet established"],
    [
      "Initial reporter",
      ctx.db.users.id.find(meta?.initialReporterId ?? "")?.displayName ??
        "Not yet established",
    ],
    ["Initial observation", meta?.initialObservation || "Not yet established"],
  ]);
  section("classification", "3. Classification", [
    ["Attack vector", meta?.attackVector || "Unknown"],
    ["Actor", meta?.actorCategory || "Unknown"],
    ["Action", meta?.actionCategory || "Unknown"],
    ["Asset", meta?.assetCategory || "Unknown"],
    ["Impact", meta?.impactCategory || "Unknown"],
    ["Classification evidence", meta?.classificationEvidenceIds ?? "[]"],
    [
      "MITRE ATT&CK mappings",
      meta?.mitreMappings === "[]"
        ? "Not yet established"
        : (meta?.mitreMappings ?? "Not yet established"),
    ],
    [
      "Root cause",
      meta?.rootCause || "Not yet established — investigation remains open",
    ],
  ]);
  section(
    "scope",
    "4. Scope and Impact",
    [
      ["Reported affected systems", incident.systems || "Not yet documented"],
      ["Reported business impact", incident.impact || "Not yet documented"],
      [
        "Graph scope coverage",
        s.entities.length
          ? "Counts below cover the recorded graph inventory and assessments only. Reported systems and business impact remain separate from verified scope."
          : "Not yet established — no graph inventory or assessments have been recorded. Zero graph counts do not establish an absence of affected systems or records.",
      ],
      [
        "Systems under investigation",
        String(s.summary.systemsUnderInvestigation),
      ],
      ["Confirmed compromised systems", String(s.summary.confirmedSystems)],
      ["Dataset inventory", String(s.summary.totalRecords)],
      [
        "Potentially exposed records (deduplicated)",
        String(s.summary.potentialRecords),
      ],
      [
        "Individually confirmed affected records",
        String(s.summary.individuallyConfirmedRecords),
      ],
      ["Not individually assessed", String(s.summary.notIndividuallyAssessed)],
      [
        "Uncertainty",
        "Dataset size and access paths are not proof that every record was affected. Encryption, exfiltration, alteration, deletion and availability remain independent dimensions.",
      ],
    ],
    [
      {
        title: "Evidence-backed assessments",
        columns: [
          "Entity",
          "Dimension",
          "Assessment",
          "Verifier",
          "Verified at",
          "Finding",
        ],
        rows: s.assessments.map((a) => [
          s.entities.find((e) => e.id === a.entityId)?.name ?? a.entityId,
          a.dimension,
          a.status,
          a.verifiedBy || "Unverified",
          stamp(a.verifiedAt),
          a.findingId,
        ]),
      },
      {
        title: "Business operations",
        columns: ["Operation", "Status", "Mode", "Explanation"],
        rows: operations.map((o) => [
          s.entities.find((e) => e.id === o.entityId)?.name ?? o.entityId,
          o.status,
          o.operatingMode,
          o.explanation,
        ]),
      },
    ],
  );
  section(
    "response",
    "5. Response and Recovery",
    [
      [
        "Simulation boundary",
        "Infrastructure restoration and verification are deterministic synthetic fixtures. AEGIS approvals, persisted workflow, restricted fallback access and report artifacts are functional. Original system assessments are not cleared by simulated recovery.",
      ],
    ],
    [
      {
        title: "Recovery executions",
        columns: ["ID", "Procedure", "State", "Result", "Completed"],
        rows: executions.map((e) => [
          e.id,
          `${e.templateId} v${e.templateVersion}`,
          e.state,
          e.result || e.failureReason,
          stamp(e.completedAt),
        ]),
      },
      {
        title: "Approval history",
        columns: ["Request", "Action", "State", "Requester", "Decisions"],
        rows: requests.map((r) => [
          r.displayReference,
          r.title,
          r.status,
          r.requestedBy,
          [...ctx.db.approvalDecisions.requestId.filter(r.id)]
            .map(
              (d) =>
                `${d.userId}: ${d.decision} (${d.role}) ${stamp(d.decidedAt)} — ${d.justification}`,
            )
            .join("\n"),
        ]),
      },
      {
        title: "Coordination tasks",
        columns: ["Task", "State", "Assignee", "Verifier"],
        rows: tasks.map((t) => [
          t.title,
          t.status,
          t.assignedUserId,
          t.verifiedBy || "Not verified",
        ]),
      },
    ],
  );
  section(
    "evidence",
    "6. Evidence",
    [
      [
        "Preservation",
        "Private original bytes, SHA-256 integrity and append-only annotations. File hashes do not establish the truth of an assertion or full forensic chain of custody.",
      ],
    ],
    [
      {
        title: "Evidence manifest",
        columns: [
          "ID",
          "File",
          "SHA-256",
          "Source",
          "Collected",
          "Uploaded",
          "Uploader",
        ],
        rows: evidence.map((e) => [
          e.id,
          e.filename,
          e.sha256,
          e.source,
          stamp(e.collectedAt),
          stamp(e.uploadedAt),
          e.uploadedBy,
        ]),
      },
    ],
  );
  const annotations = [...ctx.db.evidenceLinks.incidentKey.filter(k)].filter(
    (l) =>
      (!l.findingId || !privateFinding(l.findingId)) &&
      (!l.eventId || events.some((e) => String(e.id) === l.eventId)),
  );
  sections
    .find((s) => s.id === "evidence")!
    .tables.push({
      title: "Append-only evidence annotations",
      columns: [
        "Evidence",
        "Finding",
        "Actor",
        "Time",
        "Annotation",
        "Excerpt",
      ],
      rows: annotations.map((l) => [
        l.evidenceId,
        l.findingId,
        l.createdBy,
        stamp(l.createdAt),
        l.annotation,
        l.excerpt,
      ]),
    });
  section(
    "audit",
    "7. Audit, Findings and Closure",
    [
      [
        "Closure",
        incident.status === "Closed"
          ? "Human-approved closure recorded in audit history"
          : "Incident remains open; recovery does not close it",
      ],
      ["Lessons learned", meta?.lessonsLearned || "Not yet established"],
      [
        "Confidential sources",
        "Private conversations and their derived findings, tasks and events are excluded from incident-wide artifacts.",
      ],
    ],
    [
      {
        title: "Findings",
        columns: ["ID", "Finding", "State", "Verifier", "Verified at"],
        rows: findings.map((f) => [
          f.id,
          f.title,
          f.status,
          f.verifiedBy || "Unverified",
          stamp(f.verifiedAt),
        ]),
      },
      {
        title: "Append-only incident chronology",
        columns: ["Event", "Time", "Actor", "Type", "Description"],
        rows: events.map((e) => [
          String(e.id),
          stamp(e.createdAt),
          e.actorId,
          e.type,
          `${e.title}\n${e.description}`,
        ]),
      },
    ],
  );
  section(
    "legal",
    "8. Legal and Regulatory Considerations",
    review
      ? Object.entries(review)
          .filter(
            ([k]) =>
              !["id", "organizationId", "incidentId", "incidentKey"].includes(
                k,
              ),
          )
          .map(([k, v]) => [k, typeof v === "bigint" ? stamp(v) : String(v)])
      : [
          [
            "Legal review",
            "Restricted legal content excluded from this artifact. Generate with legal review only when authorized.",
          ],
          [
            "Legal conclusions",
            "No automated legal determination, privilege designation or regulatory submission.",
          ],
        ],
  );
  const completeness: CompletenessCheck[] = [
    {
      label: "Reported affected systems",
      section: "scope",
      status: incident.systems ? "Documented" : "Missing",
      detail:
        incident.systems || "Affected systems have not yet been documented.",
    },
    {
      label: "Reported business impact",
      section: "scope",
      status: incident.impact ? "Documented" : "Missing",
      detail: incident.impact || "Business impact has not yet been documented.",
    },
    {
      label: "Incident identity and owner",
      section: "identification",
      status: incident.commanderId ? "Documented" : "Missing",
      detail: incident.commanderId || "Assign a commander",
    },
    {
      label: "Detection and reporting",
      section: "discovery",
      status:
        meta?.detectionSource && meta.reportedAt ? "Documented" : "Missing",
      detail: meta?.detectionSource || "Record source and reported time",
    },
    {
      label: "Attack vector",
      section: "classification",
      status:
        !meta || meta.attackVector === "Unknown"
          ? "Not Yet Established"
          : "Documented",
      detail: meta?.attackVector || "Unknown",
    },
    {
      label: "Root cause",
      section: "classification",
      status: meta?.rootCause ? "Documented" : "Not Yet Established",
      detail: meta?.rootCause || "Investigation remains open",
    },
    {
      label: "Exfiltration scope",
      section: "scope",
      status:
        s.records.length > 0 &&
        s.records.every((r) =>
          s.assessments.some(
            (a) =>
              a.entityId === r.id &&
              a.dimension === "Exfiltration" &&
              ["Confirmed", "Ruled Out"].includes(a.status) &&
              a.verifiedBy,
          ),
        )
          ? "Documented"
          : "Unverified",
      detail:
        "Use individual verified assessments; inventory is not confirmed exfiltration.",
    },
    {
      label: "Evidence integrity metadata",
      section: "evidence",
      status: evidence.length ? "Documented" : "Missing",
      detail: `${evidence.length} original evidence descriptors; content truth remains a human assessment.`,
    },
    {
      label: "Recovery verification",
      section: "response",
      status: executions.some((e) =>
        ["Succeeded", "Fallback Active"].includes(e.state),
      )
        ? "Documented"
        : executions.length
          ? "Unverified"
          : "Not Yet Established",
      detail: "Fallback capability does not clear original compromise.",
    },
    {
      label: "Lessons learned",
      section: "audit",
      status: meta?.lessonsLearned ? "Documented" : "Missing",
      detail:
        meta?.lessonsLearned ||
        "Interim report may be generated before lessons are finalized.",
    },
    {
      label: "Legal review",
      section: "legal",
      status: !legal
        ? "Not Applicable"
        : review?.reviewStatus === "Completed"
          ? "Documented"
          : "Unverified",
      detail: legal
        ? "Authorized human legal review required"
        : "Restricted legal content excluded",
    },
  ];
  return {
    reportId: id,
    type,
    version,
    generatedAt: stamp(at),
    sourceCutoff: stamp(at),
    generatedBy: user,
    organizationId: org,
    organizationName: ctx.db.organizations.id.find(org)?.name ?? org,
    incidentId: inc,
    incidentTitle: incident.title,
    audience: "Authorized incident responders with all source permissions",
    confidentiality:
      review?.confidentiality ?? "Confidential incident response",
    sections:
      type === "Executive Summary"
        ? sections.map((s) => ({
            ...s,
            tables:
              s.id === "scope"
                ? s.tables.filter((t) => t.title === "Business operations")
                : s.id === "response"
                  ? s.tables.filter((t) => t.title === "Recovery executions")
                  : [],
            fields: s.fields,
          }))
        : sections,
    completeness,
    sourceIds: {
      incidents: [k],
      findings: findings.map((f) => f.id),
      events: events.map((e) => String(e.id)),
      evidence: evidence.map((e) => e.id),
      assessments: s.assessments.map((a) => a.id),
      executions: executions.map((e) => e.id),
      tasks: tasks.map((t) => t.id),
      relationships: s.relationships.map((r) => r.id),
      operations: operations.map((o) => o.id),
      reportingMetadata: meta ? [meta.id] : [],
      legalReview: review ? [review.id] : [],
    },
    standards: reportingStandards,
  };
}
export function reportCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  data: Record<string, unknown>,
  p: Ports,
  at: bigint,
) {
  const i = input(data, p),
    org = i.text("organizationId"),
    inc = i.text("incidentId"),
    { access, who } = recoveryActor(
      ctx,
      hash,
      org,
      inc,
      "reports:export",
      p,
      at,
    ),
    legal = data.includeLegal === true;
  if (action === "recovery.report.prepare") {
    if (!reportAllowed(access, legal))
      return p.fail("ACCESS_DENIED", "Report source permissions are required.");
    const operationId = i.text("operationId"),
      opKey = `${who}:report:${operationId}`,
      fingerprint = json({ type: data.type, includeLegal: legal, org, inc }),
      prior = ctx.db.recoveryOperations.id.find(opKey);
    if (!/^[a-f0-9-]{36}$/i.test(operationId))
      return p.fail("INVALID_INPUT", "A stable operation UUID is required.");
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        return p.fail("CONFLICT", "Report operation content changed.");
      return JSON.parse(prior.result);
    }
    const type = i.choice("type", [
        "Executive Summary",
        "Detailed Incident Report",
      ]),
      id = recoveryId(ctx, (id) => !!ctx.db.incidentReports.id.find(id));
    const version =
      1 +
      [...ctx.db.incidentReports.incidentKey.filter(key(org, inc))].reduce(
        (n, r) => Math.max(n, r.version),
        0,
      );
    const snapshot = snapshotReport(
      ctx,
      org,
      inc,
      who,
      type,
      legal,
      at,
      id,
      version,
    );
    ctx.db.incidentReports.insert({
      id,
      ...scoped(org, inc),
      type,
      version,
      generatedBy: who,
      generatedAt: at,
      sourceCutoff: at,
      audience: snapshot.audience,
      requiredPermissions: json([
        ...reportSourcePermissions,
        ...(legal ? ["legal:view"] : []),
      ]),
      includeLegal: legal,
      storageReference: "",
      sha256: "",
      size: 0n,
      status: "Preparing",
      snapshot: "",
    });
    ctx.db.reportSnapshots.insert({ id, snapshot: json(snapshot) });
    ctx.db.recoveryOperations.insert({
      id: opKey,
      action,
      fingerprint,
      result: json({ reportId: id }),
      createdAt: at,
    });
    return { reportId: id };
  }
  const r = ctx.db.incidentReports.id.find(i.text("reportId"));
  if (!r || r.incidentKey !== key(org, inc))
    return p.fail("NOT_FOUND", "Report not found.");
  if (
    !reportAllowed(access, r.includeLegal) ||
    !(JSON.parse(r.requiredPermissions) as string[]).every((p) =>
      has(access, p),
    )
  )
    return p.fail(
      "ACCESS_DENIED",
      "Current report source permissions are required.",
    );
  if (action === "recovery.report.commit") {
    const sha = i.text("sha256"),
      reference = i.text("storageReference"),
      size = Number(data.size);
    if (
      !/^[a-f0-9]{64}$/.test(sha) ||
      reference !== r.id ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 5 * 1024 * 1024
    )
      return p.fail("INVALID_INPUT", "Invalid report artifact.");
    if (r.status === "Ready") {
      if (r.sha256 !== sha)
        return p.fail("CONFLICT", "Immutable report artifact differs.");
      return { reportId: r.id };
    }
    ctx.db.incidentReports.id.update({
      ...r,
      status: "Ready",
      sha256: sha,
      storageReference: reference,
      size: BigInt(size),
    });
    appendEvent(
      ctx,
      org,
      inc,
      who,
      "report",
      `Report v${r.version} generated`,
      `${r.type}. Source cutoff ${stamp(r.sourceCutoff)}. Artifact ${r.id}; SHA-256 ${sha}.`,
    );
    return { reportId: r.id };
  }
  return p.fail("INVALID_INPUT", "Unknown report action.");
}
