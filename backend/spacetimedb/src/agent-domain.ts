import type { Ctx, Reader } from "./index";
import {
  appendEvent,
  incidentCommand,
  json,
  key,
  time,
  type Ports,
} from "./incident-domain";
import { eligible, InvestigationInputError } from "./investigation-domain";
import { scopeCommand, scopeEntity } from "./scope-domain";
import { moduleId } from "./module-id";
import {
  canonical,
  analyzeSnapshot,
  type SnapshotInput,
  type SourceRecord,
} from "../../../shared/investigation";
import {
  AGENT_VERSION,
  AGENT_LIMITS,
  groundProposal,
  validateTool,
  type Citation,
  type AgentObservation,
  type GroundedProposal,
} from "../../../shared/agent-investigation";

type Job = NonNullable<ReturnType<Ctx["db"]["agentRuns"]["id"]["find"]>>;
type Manifest = {
  snapshots: {
    id: string;
    evidenceId: string;
    sha256: string;
    sourceId: string;
    coverage: string;
    role: string;
  }[];
  observationIds: string[];
  sourceIds: string[];
  incidentRevision: string;
  ruleVersion: string;
};
type Receipt = {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
};
const active = (s: string) => ["Queued", "Running"].includes(s);
function text(d: Record<string, unknown>, name: string, max = 300) {
  const v = d[name];
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new InvestigationInputError(`Invalid ${name}.`);
  return v;
}
function manifest(job: Job): Manifest {
  return JSON.parse(job.manifest) as Manifest;
}
function observations(ctx: Reader, job: Job): AgentObservation[] {
  return manifest(job).observationIds.map((id) => {
    const o = ctx.db.analysisObservations.id.find(id);
    if (
      !o ||
      o.runId !== job.collectionRunId ||
      o.incidentKey !== job.incidentKey
    )
      throw new InvestigationInputError("Observation manifest changed.");
    return o;
  });
}
function citationRecord(ctx: Reader, job: Job, ref: Citation): SourceRecord {
  const m = manifest(job),
    s = ctx.db.sourceSnapshots.id.find(ref.snapshotId),
    r = ctx.db.snapshotRecordVersions.id.find(`${ref.snapshotId}:${ref.key}`);
  const frozen = m.snapshots.find((s) => s.id === ref.snapshotId),
    e = s && ctx.db.evidence.id.find(s.evidenceId);
  if (
    !frozen ||
    !s ||
    !r ||
    s.status !== "Finalized" ||
    s.runId !== job.collectionRunId ||
    s.incidentKey !== job.incidentKey ||
    s.evidenceId !== ref.evidenceId ||
    frozen.sha256 !== s.sha256 ||
    e?.sha256 !== s.sha256 ||
    e?.incidentKey !== job.incidentKey ||
    r.location !== ref.location ||
    r.sha256 !== ref.recordHash
  )
    throw new InvestigationInputError(
      "Evidence citation does not resolve inside the immutable manifest.",
    );
  const row = JSON.parse(r.body) as SourceRecord;
  if (
    row.key !== ref.key ||
    row.observedAt !== ref.observedAt ||
    ref.fields.some((f) => !(f in row.fields))
  )
    throw new InvestigationInputError(
      "Record, field or timestamp citation mismatch.",
    );
  return row;
}
function grounded(ctx: Reader, job: Job, value: unknown): GroundedProposal {
  return groundProposal(
    value,
    observations(ctx, job),
    (r) => citationRecord(ctx, job, r),
    (sourceId) => {
      const id = `${sourceId}:dataset`;
      if (!ctx.db.scopeAssociations.id.find(`${job.incidentKey}:${id}`))
        throw new InvestigationInputError("Source inventory unavailable.");
      return id;
    },
  );
}
function readPermission(
  ctx: Reader,
  hash: string,
  org: string,
  inc: string,
  p: Ports,
  at: bigint,
) {
  for (const permission of [
    "incident:view",
    "evidence:view",
    "scope:records",
  ] as const)
    p.authorize(ctx, hash, org, inc, permission, at);
}
export function agentCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  try {
    return human(ctx, action, hash, d, p);
  } catch (e) {
    if (
      e instanceof InvestigationInputError ||
      (e instanceof Error && e.message.startsWith("Invalid "))
    )
      return p.fail("INVALID_INPUT", e.message);
    throw e;
  }
}
function human(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  const org = text(d, "organizationId", 100),
    inc = text(d, "incidentId", 100),
    k = key(org, inc),
    at = time(ctx);
  readPermission(ctx, hash, org, inc, p, at);
  if (org === "acme" && inc === "IR-2041")
    return p.fail(
      "ACCESS_DENIED",
      "Established reference case cannot enter agent investigation.",
    );
  const { actor } = p.authorize(ctx, hash, org, inc, "incident:view", at);
  if (action === "investigation.agent.start") {
    for (const permission of ["evidence:upload", "scope:edit"] as const)
      p.authorize(ctx, hash, org, inc, permission, at);
    const parent = ctx.db.analysisRuns.id.find(text(d, "runId"));
    if (
      !parent ||
      parent.incidentKey !== k ||
      parent.collectionStatus !== "Complete" ||
      parent.deterministicStatus !== "Complete"
    )
      return p.fail(
        "CONFLICT",
        "Complete deterministic collection before launching the agent.",
      );
    const operation = text(d, "operationId");
    if (!/^[a-f0-9-]{36}$/i.test(operation))
      return p.fail("INVALID_INPUT", "Stable operation UUID required.");
    const operationKey = `${k}:agent:${actor.userId}:${operation}`,
      fingerprint = canonical({ runId: parent.id });
    const old = ctx.db.agentRuns.operationKey.find(operationKey);
    if (old) {
      if (old.fingerprint !== fingerprint)
        return p.fail("CONFLICT", "Operation content changed.");
      return { agentRunId: old.id };
    }
    if (
      [...ctx.db.agentRuns.collectionRunId.filter(parent.id)].some(
        (j) => active(j.status) || j.status === "Complete",
      )
    )
      return p.fail(
        "CONFLICT",
        "An active or successful investigation already exists for this collection.",
      );
    const snapshots = [...ctx.db.sourceSnapshots.runId.filter(parent.id)];
    if (
      snapshots.length !== parent.expectedSnapshots ||
      snapshots.some((s) => s.status !== "Finalized")
    )
      return p.fail("CONFLICT", "Incomplete source manifest.");
    const member = ctx.db.memberships.id.find(`${org}:${actor.userId}`)!,
      assignment = ctx.db.incidentMemberships.id.find(`${k}:${actor.userId}`);
    const incident = ctx.db.incidents.id.find(k)!;
    const id = moduleId(ctx, (id) => !!ctx.db.agentRuns.id.find(id));
    ctx.db.agentRuns.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: k,
      collectionRunId: parent.id,
      operationKey,
      fingerprint,
      actorId: actor.userId,
      membershipRevision: member.updatedAt.microsSinceUnixEpoch.toString(),
      assignmentRevision:
        member.role === "administrator"
          ? "organization-administrator"
          : assignment!.createdAt.microsSinceUnixEpoch.toString(),
      deadline: at + 600_000n,
      manifest: json({
        snapshots: snapshots.map((s) => ({
          id: s.id,
          evidenceId: s.evidenceId,
          sha256: s.sha256,
          sourceId: s.sourceId,
          coverage: s.coverage,
          role: s.role,
        })),
        observationIds: [
          ...ctx.db.analysisObservations.runId.filter(parent.id),
        ].map((o) => o.id),
        sourceIds: JSON.parse(parent.sourceIds),
        incidentRevision: incident.updatedAt.toString(),
        ruleVersion: "aegis-deterministic-v1",
      }),
      context: json({
        title: incident.title,
        description: incident.description,
      }),
      status: "Queued",
      error: "",
      model: "",
      modelEndpoint: "",
      promptVersion: AGENT_VERSION,
      requests: 0,
      attempts: 0,
      trace: "[]",
      leaseToken: "",
      leaseUntil: 0n,
      createdAt: at,
      updatedAt: at,
    });
    appendEvent(
      ctx,
      org,
      inc,
      actor.userId,
      "action",
      "Agent investigation queued",
      "Fixed source manifest authorized; collection and deterministic results remain available.",
      { newValue: json({ agentRunId: id, collectionRunId: parent.id }) },
    );
    return { agentRunId: id };
  }
  const job = ctx.db.agentRuns.id.find(text(d, "agentRunId"));
  if (!job || job.incidentKey !== k)
    return p.fail("NOT_FOUND", "Agent investigation unavailable.");
  if (action === "investigation.agent.cancel") {
    if (job.actorId !== actor.userId)
      p.authorize(ctx, hash, org, inc, "incident:manage", at);
    if (!active(job.status))
      return p.fail("CONFLICT", "Investigation is not active.");
    ctx.db.agentRuns.id.update({
      ...job,
      status: "Canceled",
      leaseToken: "",
      leaseUntil: 0n,
      updatedAt: at,
    });
    appendEvent(
      ctx,
      org,
      inc,
      actor.userId,
      "action",
      "Agent investigation canceled",
      "Prior observations and evidence retained.",
      { newValue: json({ agentRunId: job.id }) },
    );
    return {};
  }
  if (action === "investigation.agent.read") {
    const offset = Number(d.offset ?? 0),
      limit = Number(d.limit ?? 25);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      return p.fail("INVALID_INPUT", "Invalid page.");
    const rows = [...ctx.db.analysisProposals.agentRunId.filter(job.id)];
    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      trace: (JSON.parse(job.trace) as Receipt[]).map((r) => ({
        name: r.name,
        callId: r.callId,
      })),
      manifest: manifest(job),
      context: JSON.parse(job.context),
    };
  }
  if (action !== "investigation.agent.review")
    return p.fail("INVALID_INPUT", "Unknown agent action.");
  p.authorize(ctx, hash, org, inc, "findings:create", at);
  const proposal = ctx.db.analysisProposals.id.find(text(d, "proposalId"));
  if (!proposal || proposal.agentRunId !== job.id)
    return p.fail("NOT_FOUND", "Proposal unavailable.");
  const decision = text(d, "decision"),
    justification = text(d, "justification", 2000).trim(),
    status = String(d.status ?? "Suspected"),
    link = d.linkScope === true;
  if (
    !["Accept", "Reject"].includes(decision) ||
    !["Suspected", "Unverified"].includes(status) ||
    typeof d.linkScope !== "boolean"
  )
    return p.fail(
      "INVALID_INPUT",
      "Only Accept/Reject and Unverified/Suspected are allowed.",
    );
  const fingerprint = canonical({
    decision,
    justification,
    status,
    link,
    actor: actor.userId,
  });
  if (proposal.status !== "Pending") {
    if (proposal.decisionFingerprint === fingerprint)
      return {
        findingId: proposal.findingId,
        relationshipId: proposal.relationshipId,
        status: proposal.status,
      };
    return p.fail("CONFLICT", "Proposal was already reviewed.");
  }
  if (job.status !== "Complete")
    return p.fail("CONFLICT", "Agent output is not finalized.");
  const content = JSON.parse(proposal.content) as GroundedProposal;
  let verified: GroundedProposal;
  try {
    verified = grounded(ctx, job, {
      observationIds: content.observationIds,
      citations: content.citations,
      priority: content.priority,
      interpretation: content.interpretation,
    });
  } catch {
    return p.fail("INVALID_INPUT", "Proposal evidence no longer validates.");
  }
  if (canonical(content) !== canonical(verified))
    return p.fail("CONFLICT", "Proposal content changed.");
  // Fully validate every destination before the first authoritative write: expected
  // denials commit audits, so no denied review may leave a partial finding behind.
  if (link && decision === "Accept") {
    p.authorize(ctx, hash, org, inc, "scope:edit", at);
    scopeEntity(ctx, org, inc, content.entityId, p);
  }
  const evidenceIds = [...new Set(content.citations.map((c) => c.evidenceId))];
  const description = `${content.claim}\n\nInterpretation: ${content.interpretation}\n${content.rationale}\n\nLimitations: ${content.uncertainty}\nMissing information: ${content.missingInformation}\nAgent run: ${job.id}\nProposal: ${proposal.id}`;
  if (description.length > 6000)
    return p.fail(
      "INVALID_INPUT",
      "Proposal exceeds finding description limit.",
    );
  let findingId = "",
    relationshipId = "";
  if (decision === "Accept") {
    findingId = (
      incidentCommand(
        ctx,
        "incident.finding.create",
        hash,
        {
          organizationId: org,
          incidentId: inc,
          title: content.title,
          description,
          category: "Agent investigation",
          priority: content.priority,
          status,
          observedAt: Number(at),
          relatedSystem: "",
          assignedTo: "",
          reason: justification,
          evidenceIds,
        },
        p,
      ) as { findingId: string }
    ).findingId;
    if (link)
      relationshipId = (
        scopeCommand(
          ctx,
          "scope.relationship",
          hash,
          {
            organizationId: org,
            incidentId: inc,
            sourceId: content.entityId,
            targetId: `finding:${findingId}`,
            type: "RELATED_TO",
            status: "Suspected",
            justification,
            evidenceIds,
          },
          p,
        ) as { relationshipId: string }
      ).relationshipId;
  }
  ctx.db.analysisProposals.id.update({
    ...proposal,
    status: decision === "Accept" ? "Accepted" : "Rejected",
    reviewerId: actor.userId,
    justification,
    decisionFingerprint: fingerprint,
    findingId,
    relationshipId,
    reviewedAt: at,
  });
  appendEvent(
    ctx,
    org,
    inc,
    actor.userId,
    "finding",
    `Agent proposal ${decision === "Accept" ? "accepted" : "rejected"}`,
    justification,
    {
      findingId,
      evidenceIds: json(evidenceIds),
      newValue: json({
        agentRunId: job.id,
        proposalId: proposal.id,
        findingId,
        relationshipId,
        status,
      }),
    },
  );
  return {
    findingId,
    relationshipId,
    status: decision === "Accept" ? "Accepted" : "Rejected",
  };
}
function checkpoint(ctx: Ctx, job: Job, patch: Partial<Job>) {
  ctx.db.agentRuns.id.update({ ...job, ...patch, updatedAt: time(ctx) });
}
export function processAgentJobs(ctx: Ctx) {
  for (const j of ctx.db.agentRuns.iter())
    if (active(j.status) && !eligible(ctx, j, time(ctx)))
      checkpoint(ctx, j, {
        status: "Revoked",
        error: "Job authorization expired or was revoked.",
        leaseToken: "",
        leaseUntil: 0n,
      });
}
export function agentWorker(
  ctx: Ctx,
  action: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  const at = time(ctx);
  if (action === "agent.claim") {
    const j = [...ctx.db.agentRuns.iter()]
      .filter(
        (j) => active(j.status) && j.leaseUntil <= at && eligible(ctx, j, at),
      )
      .sort((a, b) => Number(a.createdAt - b.createdAt))[0];
    if (!j) return null;
    if (j.attempts >= AGENT_LIMITS.attempts) {
      checkpoint(ctx, j, {
        status: "Failed",
        error: "Restart attempt budget exhausted.",
      });
      return null;
    }
    const job = {
      ...j,
      status: "Running",
      attempts: j.attempts + 1,
      leaseToken: moduleId(ctx, () => false),
      leaseUntil: at + 90_000n,
      updatedAt: at,
    };
    ctx.db.agentRuns.id.update(job);
    return workerJob(ctx, job);
  }
  const j = ctx.db.agentRuns.id.find(text(d, "agentRunId"));
  if (
    !j ||
    !active(j.status) ||
    !eligible(ctx, j, at) ||
    j.leaseUntil <= at ||
    j.leaseToken !== d.leaseToken
  )
    return p.fail(
      "ACCESS_DENIED",
      "Agent job, lease or current authority unavailable.",
    );
  if (action === "agent.state") return workerJob(ctx, j);
  if (action === "agent.begin") {
    const model = text(d, "model", 120),
      endpoint = text(d, "endpoint", 500);
    if (j.requests >= AGENT_LIMITS.requests)
      return p.fail("CONFLICT", "Model request budget exhausted.");
    if (j.model && (j.model !== model || j.modelEndpoint !== endpoint))
      return p.fail(
        "CONFLICT",
        "Model configuration changed; submit a fresh investigation.",
      );
    checkpoint(ctx, j, {
      requests: j.requests + 1,
      model,
      modelEndpoint: endpoint,
      leaseUntil: at + 90_000n,
    });
    return {};
  }
  if (action === "agent.fail") {
    const status = d.status === "Unavailable" ? "Unavailable" : "Failed";
    const error = text(d, "message", 300);
    checkpoint(ctx, j, { status, error, leaseToken: "", leaseUntil: 0n });
    appendEvent(
      ctx,
      j.organizationId,
      j.incidentId,
      j.actorId,
      "action",
      `Agent investigation ${status.toLowerCase()}`,
      error,
      { newValue: json({ agentRunId: j.id }) },
    );
    return {};
  }
  if (action !== "agent.tool")
    return p.fail("INVALID_INPUT", "Unknown agent worker action.");
  const name = text(d, "name", 50),
    callId = text(d, "callId", 150),
    args = d.args as Record<string, unknown>;
  try {
    validateTool(name, args);
  } catch {
    return p.fail("INVALID_INPUT", "Unsupported tool or arguments.");
  }
  const trace = JSON.parse(j.trace) as Receipt[],
    old = trace.find((t) => t.callId === callId);
  if (old) {
    if (old.name !== name || canonical(old.args) !== canonical(args))
      return p.fail("CONFLICT", "Tool call content changed.");
    return old.result;
  }
  if (trace.length >= AGENT_LIMITS.tools)
    return p.fail("CONFLICT", "Tool budget exhausted.");
  const m = manifest(j);
  let result: unknown;
  if (["detect_anomalies", "compare_snapshots"].includes(name)) {
    if (!m.sourceIds.includes(String(args.sourceId)))
      return p.fail(
        "ACCESS_DENIED",
        "Source is outside the authorized manifest.",
      );
    if (name === "detect_anomalies")
      result = observations(ctx, j)
        .filter((o) => o.sourceId === args.sourceId)
        .slice(0, 25)
        .map((o) => ({
          ...o,
          citations: (
            JSON.parse(o.provenance) as Omit<Citation, "observationId">[]
          ).map((r) => ({ ...r, observationId: o.id })),
        }));
    else {
      const pair = m.snapshots.filter((s) => s.sourceId === args.sourceId);
      function input(id: string): SnapshotInput {
        const s = ctx.db.sourceSnapshots.id.find(id)!;
        return {
          schema: "aegis-snapshot-v1",
          connectorId: ctx.db.investigationSources.id.find(s.sourceId)!
            .connectorId as SnapshotInput["connectorId"],
          revision: s.revision,
          coverage: s.coverage as "full" | "partial",
          collectedAt: s.collectedAt,
          records: [...ctx.db.snapshotRecordVersions.snapshotId.filter(id)].map(
            (r) => JSON.parse(r.body) as SourceRecord,
          ),
        };
      }
      const current = pair.find((s) => s.role === "current")!,
        baseline = pair.find((s) => s.role === "baseline");
      const analysis = analyzeSnapshot(
        baseline ? input(baseline.id) : undefined,
        input(current.id),
      );
      result = {
        coverage: current.coverage,
        baselineAvailable: !!baseline,
        counts: Object.fromEntries(
          ["added", "modified", "missing", "unchanged", "uncompared"].map(
            (k) => [k, analysis.changes.filter((c) => c.kind === k).length],
          ),
        ),
        changed: analysis.changes
          .filter((c) => c.kind !== "unchanged")
          .slice(0, 25),
      };
    }
  } else if (name === "parse_evidence") {
    const s = m.snapshots.find((s) => s.id === args.snapshotId),
      r = ctx.db.snapshotRecordVersions.id.find(
        `${args.snapshotId}:${args.key}`,
      );
    if (!s || !r)
      return p.fail(
        "ACCESS_DENIED",
        "Record is outside the authorized manifest.",
      );
    result = {
      evidenceId: s.evidenceId,
      snapshotId: s.id,
      location: r.location,
      record: JSON.parse(r.body),
    };
  } else if (name === "query_context_graph") {
    const id = String(args.entityId),
      e = ctx.db.scopeEntities.id.find(id);
    if (!e || !ctx.db.scopeAssociations.id.find(`${j.incidentKey}:${id}`))
      return p.fail("ACCESS_DENIED", "Entity is outside this incident.");
    result = {
      entity: { id: e.id, name: e.name, kind: e.kind },
      relationships: [
        ...ctx.db.scopeRelationships.incidentKey.filter(j.incidentKey),
      ]
        .filter((r) => r.sourceId === id || r.targetId === id)
        .slice(0, 10),
      limitation:
        "Inventory and potential paths do not confirm compromise or observed access.",
    };
  } else {
    const inputs = args.proposals as unknown[],
      all = observations(ctx, j);
    if (
      !inputs.length &&
      (m.sourceIds.some(
        (id) =>
          !trace.some(
            (t) => t.name === "detect_anomalies" && t.args.sourceId === id,
          ),
      ) ||
        all.some(
          (o) =>
            ![
              "comparison-unavailable",
              "source-declared-change-reference",
            ].includes(o.rule),
        ))
    )
      return p.fail(
        "INVALID_INPUT",
        "Zero proposals requires inspecting all sources with no applicable unexplained anomalies.",
      );
    let contents: GroundedProposal[];
    try {
      contents = inputs.map((v) => grounded(ctx, j, v));
    } catch (e) {
      return p.fail(
        "INVALID_INPUT",
        e instanceof Error ? e.message : "Unsupported proposal.",
      );
    }
    if (
      new Set(contents.map((c) => canonical([...c.observationIds].sort())))
        .size !== contents.length
    )
      return p.fail("INVALID_INPUT", "Duplicate proposal observations.");
    for (const content of contents) {
      for (const ref of content.citations) {
        const o = all.find((o) => o.id === ref.observationId)!;
        if (
          !trace.some(
            (t) =>
              t.name === "detect_anomalies" && t.args.sourceId === o.sourceId,
          ) ||
          !trace.some(
            (t) =>
              t.name === "parse_evidence" &&
              t.args.snapshotId === ref.snapshotId &&
              t.args.key === ref.key,
          )
        )
          return p.fail(
            "INVALID_INPUT",
            "Inspect the selected observations and every cited original record before proposing.",
          );
      }
    }
    const ids: string[] = [];
    for (const _ of contents)
      ids.push(
        moduleId(
          ctx,
          (id) => ids.includes(id) || !!ctx.db.analysisProposals.id.find(id),
        ),
      );
    for (const [index, content] of contents.entries())
      ctx.db.analysisProposals.insert({
        id: ids[index],
        organizationId: j.organizationId,
        incidentId: j.incidentId,
        incidentKey: j.incidentKey,
        agentRunId: j.id,
        content: json(content),
        status: "Pending",
        reviewerId: "",
        justification: "",
        decisionFingerprint: "",
        findingId: "",
        relationshipId: "",
        createdAt: at,
        reviewedAt: 0n,
      });
    result = { proposalIds: ids, terminal: true };
    appendEvent(
      ctx,
      j.organizationId,
      j.incidentId,
      j.actorId,
      "action",
      "Agent investigation complete",
      `${ids.length} validated proposals. Human review is separate; no findings or impact confirmations created.`,
      { newValue: json({ agentRunId: j.id, proposalIds: ids }) },
    );
  }
  const next = [...trace, { callId, name, args, result }];
  if (json(next).length > 80_000)
    throw new Error("Agent trace exceeds persisted context limit.");
  checkpoint(ctx, j, {
    trace: json(next),
    leaseUntil: name === "propose_findings" ? 0n : at + 90_000n,
    leaseToken: name === "propose_findings" ? "" : j.leaseToken,
    status: name === "propose_findings" ? "Complete" : j.status,
  });
  return result;
}
function workerJob(ctx: Reader, job: Job) {
  const m = manifest(job);
  return {
    job,
    sources: m.sourceIds.map((id) => {
      const s = ctx.db.investigationSources.id.find(id)!;
      return {
        id: s.id,
        connectorId: s.connectorId,
        entityId: `${id}:dataset`,
      };
    }),
    snapshots: m.snapshots.map((s) => ({
      ...s,
      storageReference: ctx.db.sourceSnapshots.id.find(s.id)!.storageReference,
    })),
  };
}
export function agentProjection(
  ctx: Reader,
  a: { organizationId: string; incidentId: string; permissions: string },
) {
  const k = key(a.organizationId, a.incidentId);
  return [...ctx.db.agentRuns.incidentKey.filter(k)].map((j) => ({
    id: `agent:${j.id}`,
    organizationId: a.organizationId,
    incidentId: a.incidentId,
    kind: "agent",
    body: json({
      id: j.id,
      collectionRunId: j.collectionRunId,
      status: j.status,
      error: j.error,
      model: j.model,
      requests: j.requests,
      toolCount: (JSON.parse(j.trace) as unknown[]).length,
      pending: [...ctx.db.analysisProposals.agentRunId.filter(j.id)].filter(
        (p) => p.status === "Pending",
      ).length,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }),
  }));
}
