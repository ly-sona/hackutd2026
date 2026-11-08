import type { Ctx, Reader } from "./index";
import { appendEvent, json, key, time, type Ports } from "./incident-domain";
import { ensureRoom } from "./coord-access";
import { investigationMetadata } from "./investigation-metadata";
import { referenceDescriptor } from "./investigation-reference";
import { compatibility } from "./scope-domain";
import { moduleId } from "./module-id";
import { matrix, isRole, type Permission } from "./permissions";
import {
  connectors,
  CONNECTOR_VERSION,
  RULE_VERSION,
  parseSnapshot,
  analyzeSnapshot,
  type SnapshotInput,
  type SourceRecord,
} from "../../../shared/investigation";

type Run = NonNullable<ReturnType<Ctx["db"]["analysisRuns"]["id"]["find"]>>;
type Snapshot = NonNullable<
  ReturnType<Ctx["db"]["sourceSnapshots"]["id"]["find"]>
>;
const permissions: Permission[] = [
  "evidence:upload",
  "evidence:view",
  "scope:edit",
  "scope:records",
];
const finalStates = ["Complete", "Canceled", "Revoked"];
const uuid = /^[a-f0-9-]{36}$/i;
export class InvestigationInputError extends Error {}
function text(d: Record<string, unknown>, name: string, max = 200): string {
  const v = d[name];
  if (typeof v !== "string" || !v.length || v.length > max)
    throw new InvestigationInputError(`Invalid ${name}.`);
  return v;
}
function protectedCase(org: string, inc: string) {
  return org === "acme" && inc === "IR-2041";
}
export function seedInvestigations(ctx: Ctx) {
  if (!ctx.db.organizations.id.find("acme") || !ctx.db.users.id.find("maya"))
    throw new InvestigationInputError(
      "Bootstrap the synthetic organization first.",
    );
  for (const i of ctx.db.incidents.iter())
    investigationMetadata(
      ctx,
      i.organizationId,
      i.incidentId,
      protectedCase(i.organizationId, i.incidentId) ? "reference" : "legacy",
    );
  const marker = "acme-addition-a-v1";
  if (ctx.db.scenarioSeeds.id.find(marker)) return { seeded: false };
  for (const [scenario, title] of [
    ["customers", "Customer service investigation"],
    ["hr", "HR and payroll investigation — planned connectors"],
  ]) {
    const counter = ctx.db.incidentCounters.organizationId.find("acme");
    let n = counter?.next ?? 2044;
    while (ctx.db.incidentStubs.id.find(`acme:IR-${n}`)) n++;
    const inc = `IR-${n}`,
      k = key("acme", inc),
      at = time(ctx);
    const next = { organizationId: "acme", next: n + 1 };
    if (counter) ctx.db.incidentCounters.organizationId.update(next);
    else ctx.db.incidentCounters.insert(next);
    ctx.db.incidents.insert({
      id: k,
      organizationId: "acme",
      incidentId: inc,
      incidentKey: k,
      title,
      description:
        "Initial synthetic report. Select implemented sources in Investigation; facts and scope are not yet established.",
      type: "Ransomware",
      severity: "High",
      status: "Open",
      systems: "",
      impact: "",
      discoveredAt: at,
      createdAt: at,
      updatedAt: at,
      createdBy: "maya",
      commanderId: "maya",
    });
    ctx.db.incidentStubs.insert({ id: k, organizationId: "acme", title });
    for (const user of ["maya", "alex", "priya", "jordan", "sam"])
      ctx.db.incidentMemberships.insert({
        id: `${k}:${user}`,
        organizationId: "acme",
        incidentId: inc,
        userId: user,
        membershipStatus: "active",
        createdAt: ctx.timestamp,
      });
    investigationMetadata(ctx, "acme", inc, "investigation", scenario);
    ensureRoom(ctx, "acme", inc, "maya");
    appendEvent(
      ctx,
      "acme",
      inc,
      "maya",
      "incident",
      "Incident opened",
      "Sparse synthetic investigation workspace; no pre-seeded findings or impact assessments.",
    );
  }
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: time(ctx) });
  return { seeded: true };
}
export function investigationCommand(
  ctx: Ctx,
  action: string,
  hash: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  if (action === "investigation.reference") return referenceDescriptor(ctx);
  if (action === "investigation.seed") return seedInvestigations(ctx);
  if (action === "investigation.test.expireLease") {
    if (ctx.env.AEGIS_TEST_MODE !== "true")
      return p.fail("ACCESS_DENIED", "Test fixtures disabled.");
    const r = ctx.db.analysisRuns.id.find(text(d, "runId"));
    if (r) ctx.db.analysisRuns.id.update({ ...r, leaseUntil: 0n });
    return {};
  }
  const org = text(d, "organizationId", 100),
    inc = text(d, "incidentId", 100),
    k = key(org, inc);
  const { actor } = p.authorize(
    ctx,
    hash,
    org,
    inc,
    "incident:view",
    time(ctx),
  );
  if (!ctx.db.incidents.id.find(k))
    return p.fail("NOT_FOUND", "Incident unavailable.");
  if (action === "investigation.read") {
    p.authorize(ctx, hash, org, inc, "evidence:view", time(ctx));
    p.authorize(ctx, hash, org, inc, "scope:records", time(ctx));
    const run = ctx.db.analysisRuns.id.find(text(d, "runId"));
    if (!run || run.incidentKey !== k)
      return p.fail("NOT_FOUND", "Run unavailable.");
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
    if (d.kind === "observations") {
      const rows = [...ctx.db.analysisObservations.runId.filter(run.id)];
      return { rows: rows.slice(offset, offset + limit), total: rows.length };
    }
    if (d.kind === "differences") {
      const source = ctx.db.investigationSources.id.find(text(d, "sourceId"));
      if (
        !source ||
        source.incidentKey !== k ||
        !(JSON.parse(run.sourceIds) as string[]).includes(source.id)
      )
        return p.fail("NOT_FOUND", "Source unavailable.");
      const pair = [...ctx.db.sourceSnapshots.runId.filter(run.id)].filter(
        (s) => s.sourceId === source.id && s.status === "Finalized",
      );
      const baseline = pair.find((s) => s.role === "baseline"),
        current = pair.find((s) => s.role === "current");
      if (
        !current ||
        (run.expectedSnapshots >
          (JSON.parse(run.sourceIds) as string[]).length &&
          !baseline)
      )
        return p.fail("CONFLICT", "Source collection is not complete.");
      const changes = analyzeSnapshot(
        baseline ? snapshotInput(ctx, baseline) : undefined,
        snapshotInput(ctx, current),
      ).changes;
      return {
        rows: changes.slice(offset, offset + limit),
        total: changes.length,
        coverage: current.coverage,
        snapshots: pair.map(({ storageReference, ...s }) => ({
          ...s,
          storageReference: undefined,
        })),
      };
    }
    return p.fail("INVALID_INPUT", "Unknown investigation read.");
  }
  for (const permission of permissions)
    p.authorize(ctx, hash, org, inc, permission, time(ctx));
  if (
    protectedCase(org, inc) ||
    ctx.db.incidentInvestigations.id.find(k)?.mode === "reference"
  )
    return p.fail(
      "ACCESS_DENIED",
      "Established reference case is protected from connector ingestion.",
    );
  if (action === "investigation.cancel") {
    const run = ctx.db.analysisRuns.id.find(text(d, "runId"));
    if (!run || run.incidentKey !== k)
      return p.fail("NOT_FOUND", "Run unavailable.");
    if (finalStates.includes(run.status)) return { runId: run.id };
    ctx.db.analysisRuns.id.update({
      ...run,
      status: "Canceled",
      leaseToken: "",
      leaseUntil: 0n,
      updatedAt: time(ctx),
      error: "Canceled by an authorized responder.",
    });
    appendEvent(
      ctx,
      org,
      inc,
      actor.userId,
      "action",
      "Investigation canceled",
      "Queued work and original evidence retained.",
    );
    return { runId: run.id };
  }
  if (action !== "investigation.start")
    return p.fail("INVALID_INPUT", "Unknown investigation action.");
  const operationId = text(d, "operationId");
  if (!uuid.test(operationId))
    return p.fail("INVALID_INPUT", "A stable operation UUID is required.");
  const selected = d.connectorIds;
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > 4 ||
    selected.some(
      (id) =>
        typeof id !== "string" ||
        !connectors.some((c) => c.id === id && c.implemented),
    ) ||
    new Set(selected).size !== selected.length
  )
    return p.fail("INVALID_INPUT", "Select implemented P0 connectors only.");
  if (d.useBaseline !== undefined && typeof d.useBaseline !== "boolean")
    return p.fail("INVALID_INPUT", "Invalid baseline choice.");
  const useBaseline = d.useBaseline !== false;
  const ids = [...selected].sort() as string[],
    fingerprint = json({
      k,
      ids,
      version: CONNECTOR_VERSION,
      revision: 1,
      useBaseline,
    }),
    operationKey = `${actor.userId}:${operationId}`;
  const old = ctx.db.analysisRuns.operationKey.find(operationKey);
  if (old) {
    if (old.fingerprint !== fingerprint)
      return p.fail(
        "CONFLICT",
        "Operation UUID already used for different content.",
      );
    return { runId: old.id };
  }
  if (ctx.db.incidentInvestigations.id.find(k)?.scenario === "hr")
    return p.fail(
      "UNAVAILABLE",
      "HR and Payroll are planned P1 connectors; this scenario is not runnable in Addition A.",
    );
  if (
    [...ctx.db.analysisRuns.incidentKey.filter(k)].some(
      (r) => !["Failed", "Revoked", "Canceled"].includes(r.status),
    )
  )
    return p.fail(
      "CONFLICT",
      "An initial investigation already exists. Later collection is not implemented in Addition A.",
    );
  const member = ctx.db.memberships.id.find(`${org}:${actor.userId}`)!,
    assignment = ctx.db.incidentMemberships.id.find(`${k}:${actor.userId}`)!;
  const sourceIds = ids.map((id) => `${k}:source:${id}`),
    at = time(ctx);
  for (const [i, id] of sourceIds.entries())
    if (!ctx.db.investigationSources.id.find(id))
      ctx.db.investigationSources.insert({
        id,
        organizationId: org,
        incidentId: inc,
        incidentKey: k,
        connectorId: ids[i],
        version: CONNECTOR_VERSION,
        status: "Queued",
        latestSnapshotId: "",
      });
  const runId = moduleId(ctx, (id) => !!ctx.db.analysisRuns.id.find(id));
  ctx.db.analysisRuns.insert({
    id: runId,
    organizationId: org,
    incidentId: inc,
    incidentKey: k,
    operationKey,
    fingerprint,
    actorId: actor.userId,
    membershipRevision: member.updatedAt.microsSinceUnixEpoch.toString(),
    assignmentRevision: assignment.createdAt.microsSinceUnixEpoch.toString(),
    sourceIds: json(sourceIds),
    status: "Queued",
    collectionStatus: "Queued",
    deterministicStatus: "Not started",
    agentStatus: "Not configured",
    completedSnapshots: 0,
    expectedSnapshots: sourceIds.length * (useBaseline ? 2 : 1),
    analyzedSources: 0,
    leaseToken: "",
    leaseUntil: 0n,
    deadline: at + 86_400_000n,
    createdAt: at,
    updatedAt: at,
    error: "",
  });
  appendEvent(
    ctx,
    org,
    inc,
    actor.userId,
    "action",
    "Synthetic connector collection queued",
    `${ids.length} sources authorized for a bounded initial run. Model investigation is not configured.`,
    { newValue: json({ runId }) },
  );
  return { runId };
}

// Job authority is independent of session lifetime and cannot survive permission regrant.
function eligible(ctx: Reader, run: Run, at: bigint) {
  const member = ctx.db.memberships.id.find(
      `${run.organizationId}:${run.actorId}`,
    ),
    assigned = ctx.db.incidentMemberships.id.find(
      `${run.incidentKey}:${run.actorId}`,
    );
  return (
    !protectedCase(run.organizationId, run.incidentId) &&
    ctx.db.users.id.find(run.actorId)?.accountStatus === "active" &&
    ctx.db.organizations.id.find(run.organizationId)?.status === "active" &&
    member?.status === "active" &&
    (member.expiresAt === 0n || member.expiresAt > at) &&
    isRole(member.role) &&
    permissions.every((p) =>
      matrix[member.role as keyof typeof matrix].includes(p),
    ) &&
    assigned?.membershipStatus === "active" &&
    member.updatedAt.microsSinceUnixEpoch.toString() ===
      run.membershipRevision &&
    assigned.createdAt.microsSinceUnixEpoch.toString() ===
      run.assignmentRevision &&
    run.deadline > at
  );
}
export function processInvestigations(ctx: Ctx) {
  for (const run of ctx.db.analysisRuns.iter())
    if (
      !finalStates.includes(run.status) &&
      run.status !== "Failed" &&
      !eligible(ctx, run, time(ctx))
    )
      ctx.db.analysisRuns.id.update({
        ...run,
        status: "Revoked",
        error:
          "Job authority expired or was revoked. Fresh authorization is required.",
        leaseToken: "",
        leaseUntil: 0n,
        updatedAt: time(ctx),
      });
}
function snapshotInput(ctx: Reader, s: Snapshot): SnapshotInput {
  return parseSnapshot(
    {
      schema: "aegis-snapshot-v1",
      connectorId: ctx.db.investigationSources.id.find(s.sourceId)!.connectorId,
      revision: s.revision,
      coverage: s.coverage,
      collectedAt: s.collectedAt,
      records: [...ctx.db.snapshotRecordVersions.snapshotId.filter(s.id)].map(
        (r) => JSON.parse(r.body) as SourceRecord,
      ),
    },
    ctx.db.investigationSources.id.find(s.sourceId)!.connectorId,
    s.revision,
  );
}
export function investigationWorker(
  ctx: Ctx,
  action: string,
  d: Record<string, unknown>,
  p: Ports,
): unknown {
  const at = time(ctx);
  if (action === "claim") {
    const run = [...ctx.db.analysisRuns.iter()]
      .filter(
        (r) =>
          ["Queued", "Collecting", "Analyzing"].includes(r.status) &&
          r.leaseUntil <= at &&
          eligible(ctx, r, at),
      )
      .sort((a, b) => Number(a.createdAt - b.createdAt))[0];
    if (!run) return null;
    const claimed = {
      ...run,
      status: run.collectionStatus === "Complete" ? "Analyzing" : "Collecting",
      collectionStatus:
        run.collectionStatus === "Complete" ? "Complete" : "Running",
      leaseToken: moduleId(ctx, (id) => !!ctx.db.analysisRuns.id.find(id)),
      leaseUntil: at + 60_000n,
      updatedAt: at,
    };
    ctx.db.analysisRuns.id.update(claimed);
    return workerState(ctx, claimed);
  }
  const run = ctx.db.analysisRuns.id.find(text(d, "runId"));
  if (
    !run ||
    !eligible(ctx, run, at) ||
    finalStates.includes(run.status) ||
    run.status === "Failed" ||
    run.leaseUntil <= at ||
    run.leaseToken !== d.leaseToken
  )
    return p.fail(
      "ACCESS_DENIED",
      "Job, lease or current authority unavailable.",
    );
  if (action === "state") return workerState(ctx, run);
  if (action === "fail") {
    const error = text(d, "message", 500);
    const failedSource =
      typeof d.sourceId === "string"
        ? ctx.db.investigationSources.id.find(d.sourceId)
        : undefined;
    if (
      d.sourceId &&
      (!failedSource ||
        failedSource.incidentKey !== run.incidentKey ||
        !(JSON.parse(run.sourceIds) as string[]).includes(failedSource.id))
    )
      return p.fail(
        "ACCESS_DENIED",
        "Failure source outside authorized manifest.",
      );
    if (failedSource)
      ctx.db.investigationSources.id.update({
        ...failedSource,
        status: "Failed",
      });
    ctx.db.analysisRuns.id.update({
      ...run,
      status: "Failed",
      collectionStatus:
        run.collectionStatus === "Complete"
          ? "Complete"
          : run.completedSnapshots
            ? "Partial"
            : "Failed",
      deterministicStatus:
        run.collectionStatus === "Complete"
          ? "Failed"
          : run.deterministicStatus,
      error,
      leaseToken: "",
      leaseUntil: 0n,
      updatedAt: at,
    });
    appendEvent(
      ctx,
      run.organizationId,
      run.incidentId,
      run.actorId,
      "action",
      "Deterministic investigation failed",
      error,
    );
    return {};
  }
  const sourceId = text(d, "sourceId"),
    source = ctx.db.investigationSources.id.find(sourceId);
  if (
    !source ||
    source.incidentKey !== run.incidentKey ||
    !(JSON.parse(run.sourceIds) as string[]).includes(sourceId)
  )
    return p.fail("ACCESS_DENIED", "Source outside authorized manifest.");
  if (action === "reserve") {
    const role = text(d, "role");
    if (
      !["baseline", "current"].includes(role) ||
      (role === "baseline" &&
        run.expectedSnapshots ===
          (JSON.parse(run.sourceIds) as string[]).length)
    )
      return p.fail("INVALID_INPUT", "Unsupported initial snapshot role.");
    const old = [...ctx.db.sourceSnapshots.runId.filter(run.id)].find(
      (s) => s.sourceId === sourceId && s.role === role,
    );
    if (old) return old;
    const id = moduleId(ctx, (id) => !!ctx.db.sourceSnapshots.id.find(id));
    const snapshot = {
      id,
      organizationId: run.organizationId,
      incidentId: run.incidentId,
      incidentKey: run.incidentKey,
      runId: run.id,
      sourceId,
      role,
      revision: role === "baseline" ? 0 : 1,
      evidenceId: `EV-SNAP-${id}`,
      storageReference: id,
      sha256: "",
      size: 0,
      collectedAt: "",
      ingestedAt: 0n,
      coverage: "",
      recordCount: 0,
      stagedCount: 0,
      status: "Reserved",
    };
    ctx.db.sourceSnapshots.insert(snapshot);
    ctx.db.investigationSources.id.update({ ...source, status: "Collecting" });
    return snapshot;
  }
  if (action === "metadata") {
    const s = ctx.db.sourceSnapshots.id.find(text(d, "snapshotId"));
    if (!s || s.runId !== run.id || s.sourceId !== sourceId)
      return p.fail("INVALID_INPUT", "Invalid snapshot.");
    const sha256 = text(d, "sha256"),
      size = Number(d.size),
      recordCount = Number(d.recordCount),
      collectedAt = text(d, "collectedAt"),
      coverage = text(d, "coverage");
    if (
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 5242880 ||
      !Number.isInteger(recordCount) ||
      recordCount < 1 ||
      recordCount > 2000 ||
      !["full", "partial"].includes(coverage) ||
      !Number.isFinite(Date.parse(collectedAt))
    )
      return p.fail("INVALID_INPUT", "Invalid snapshot metadata.");
    if (s.status !== "Reserved") {
      if (
        s.sha256 !== sha256 ||
        s.size !== size ||
        s.recordCount !== recordCount ||
        s.collectedAt !== collectedAt ||
        s.coverage !== coverage
      )
        return p.fail("CONFLICT", "Original snapshot metadata is immutable.");
      return s;
    }
    const next = {
      ...s,
      sha256,
      size,
      recordCount,
      collectedAt,
      coverage,
      status: "Staging",
    };
    ctx.db.sourceSnapshots.id.update(next);
    return next;
  }
  if (action === "records") {
    const s = ctx.db.sourceSnapshots.id.find(text(d, "snapshotId"));
    if (
      !s ||
      s.runId !== run.id ||
      s.sourceId !== sourceId ||
      s.status !== "Staging"
    )
      return p.fail("CONFLICT", "Snapshot not staging.");
    const rows = d.rows as {
      body: SourceRecord;
      sha256: string;
      index: number;
    }[];
    if (!Array.isArray(rows) || !rows.length || rows.length > 20)
      return p.fail("INVALID_INPUT", "Invalid record batch.");
    try {
      parseSnapshot(
        {
          schema: "aegis-snapshot-v1",
          connectorId: source.connectorId,
          revision: s.revision,
          coverage: s.coverage,
          collectedAt: s.collectedAt,
          records: rows.map((r) => r.body),
        },
        source.connectorId,
        s.revision,
      );
    } catch {
      return p.fail("INVALID_INPUT", "Invalid normalized records.");
    }
    for (const r of rows) {
      if (
        !/^[a-f0-9]{64}$/.test(r.sha256) ||
        !Number.isInteger(r.index) ||
        r.index < 0 ||
        r.index >= s.recordCount
      )
        return p.fail("INVALID_INPUT", "Invalid record hash/location.");
      if (
        [...ctx.db.snapshotRecordVersions.snapshotId.filter(s.id)].some(
          (existing) =>
            existing.key !== r.body.key &&
            existing.location === `/records/${r.index}`,
        ) ||
        rows.some((other) => other !== r && other.index === r.index)
      )
        return p.fail("CONFLICT", "Duplicate original record location.");
      const old = ctx.db.snapshotRecordVersions.id.find(
        `${s.id}:${r.body.key}`,
      );
      if (
        old &&
        (old.body !== json(r.body) ||
          old.sha256 !== r.sha256 ||
          old.location !== `/records/${r.index}`)
      )
        return p.fail("CONFLICT", "Record version is immutable.");
    }
    let added = 0;
    for (const r of rows)
      if (!ctx.db.snapshotRecordVersions.id.find(`${s.id}:${r.body.key}`)) {
        ctx.db.snapshotRecordVersions.insert({
          id: `${s.id}:${r.body.key}`,
          snapshotId: s.id,
          key: r.body.key,
          sha256: r.sha256,
          body: json(r.body),
          location: `/records/${r.index}`,
        });
        added++;
      }
    if (s.stagedCount + added > s.recordCount)
      throw new Error("Snapshot record count exceeded.");
    ctx.db.sourceSnapshots.id.update({
      ...s,
      stagedCount: s.stagedCount + added,
    });
    ctx.db.analysisRuns.id.update({
      ...run,
      leaseUntil: at + 60_000n,
      updatedAt: at,
    });
    return {};
  }
  if (action === "finalize") {
    const s = ctx.db.sourceSnapshots.id.find(text(d, "snapshotId"));
    if (!s || s.runId !== run.id || s.sourceId !== sourceId)
      return p.fail("INVALID_INPUT", "Invalid snapshot.");
    if (s.status === "Finalized") return {};
    if (s.status !== "Staging" || s.stagedCount !== s.recordCount)
      return p.fail(
        "CONFLICT",
        "All validated records must be staged before finalization.",
      );
    snapshotInput(ctx, s);
    ctx.db.evidence.insert({
      id: s.evidenceId,
      organizationId: run.organizationId,
      incidentId: run.incidentId,
      incidentKey: run.incidentKey,
      filename: `${source.connectorId}-${s.role}.json`,
      contentType: "application/json",
      size: BigInt(s.size),
      storageReference: s.storageReference,
      sha256: s.sha256,
      description: `Immutable synthetic ${s.role} snapshot; ${s.coverage} export coverage. Source trust and impact unverified.`,
      source: `${CONNECTOR_VERSION}/${source.connectorId}`,
      status: "Unverified",
      collectedAt: BigInt(Date.parse(s.collectedAt)),
      uploadedAt: at,
      uploadedBy: run.actorId,
    });
    ctx.db.sourceSnapshots.id.update({
      ...s,
      status: "Finalized",
      ingestedAt: at,
    });
    const collected = [...ctx.db.sourceSnapshots.runId.filter(run.id)].filter(
      (item) => item.sourceId === sourceId && item.status === "Finalized",
    ).length;
    const perSource =
      run.expectedSnapshots / (JSON.parse(run.sourceIds) as string[]).length;
    ctx.db.investigationSources.id.update({
      ...source,
      status: collected === perSource ? "Collected" : "Collecting",
    });
    const count = run.completedSnapshots + 1;
    ctx.db.analysisRuns.id.update({
      ...run,
      completedSnapshots: count,
      collectionStatus:
        count === run.expectedSnapshots ? "Complete" : "Running",
      status: count === run.expectedSnapshots ? "Analyzing" : "Collecting",
      leaseUntil: at + 60_000n,
      updatedAt: at,
    });
    appendEvent(
      ctx,
      run.organizationId,
      run.incidentId,
      run.actorId,
      "evidence",
      "Synthetic source snapshot collected",
      `${source.connectorId}: ${s.role}, ${s.recordCount} staged records; ${s.coverage} coverage.`,
      {
        evidenceIds: json([s.evidenceId]),
        newValue: json({ runId: run.id, snapshotId: s.id }),
      },
    );
    return {};
  }
  if (action === "analyze") {
    if (run.collectionStatus !== "Complete")
      return p.fail("CONFLICT", "Collection not complete.");
    if (
      source.latestSnapshotId &&
      ctx.db.sourceSnapshots.id.find(source.latestSnapshotId)?.runId === run.id
    )
      return {};
    const pair = [...ctx.db.sourceSnapshots.runId.filter(run.id)].filter(
      (s) => s.sourceId === sourceId && s.status === "Finalized",
    );
    const baseline = pair.find((s) => s.role === "baseline"),
      current = pair.find((s) => s.role === "current");
    if (
      !current ||
      (run.expectedSnapshots > (JSON.parse(run.sourceIds) as string[]).length &&
        !baseline)
    )
      return p.fail("CONFLICT", "Missing source snapshot.");
    const b = baseline ? snapshotInput(ctx, baseline) : undefined,
      c = snapshotInput(ctx, current),
      analysis = analyzeSnapshot(b, c);
    for (const o of analysis.observations) {
      const refs = pair.flatMap((s) => {
        const r = ctx.db.snapshotRecordVersions.id.find(`${s.id}:${o.key}`);
        return r
          ? [
              {
                evidenceId: s.evidenceId,
                snapshotId: s.id,
                key: o.key,
                location: r.location,
                fields: o.fields,
                observedAt: (JSON.parse(r.body) as SourceRecord).observedAt,
                ruleVersion: RULE_VERSION,
                recordHash: r.sha256,
              },
            ]
          : [];
      });
      const id = moduleId(
        ctx,
        (id) => !!ctx.db.analysisObservations.id.find(id),
      );
      ctx.db.analysisObservations.insert({
        id,
        organizationId: run.organizationId,
        incidentId: run.incidentId,
        incidentKey: run.incidentKey,
        runId: run.id,
        sourceId,
        key: o.key,
        rule: o.rule,
        ruleVersion: RULE_VERSION,
        description: o.description,
        provenance: json(refs),
      });
    }
    registerInventory(ctx, run, source.id, source.connectorId, c);
    ctx.db.investigationSources.id.update({
      ...source,
      status: "Complete",
      latestSnapshotId: current.id,
    });
    const analyzed = run.analyzedSources + 1,
      complete = analyzed === (JSON.parse(run.sourceIds) as string[]).length;
    ctx.db.analysisRuns.id.update({
      ...run,
      analyzedSources: analyzed,
      status: complete ? "Complete" : "Analyzing",
      deterministicStatus: complete ? "Complete" : "Running",
      leaseToken: complete ? "" : run.leaseToken,
      leaseUntil: complete ? 0n : at + 60_000n,
      updatedAt: at,
    });
    const counts = Object.fromEntries(
      ["added", "modified", "missing", "unchanged", "uncompared"].map(
        (kind) => [
          kind,
          analysis.changes.filter((d) => d.kind === kind).length,
        ],
      ),
    );
    appendEvent(
      ctx,
      run.organizationId,
      run.incidentId,
      run.actorId,
      "observation",
      "Deterministic source analysis complete",
      `${source.connectorId}: ${json(counts)}. ${analysis.observations.length} observations require human investigation; no findings or impact confirmations created. Agent not configured.`,
      {
        evidenceIds: json(pair.map((s) => s.evidenceId)),
        newValue: json({
          runId: run.id,
          sourceId,
          counts,
          ruleVersion: RULE_VERSION,
        }),
      },
    );
    return {};
  }
  return p.fail("INVALID_INPUT", "Unknown worker action.");
}
function workerState(ctx: Reader, run: Run) {
  return {
    run,
    sources: (JSON.parse(run.sourceIds) as string[]).map((id) =>
      ctx.db.investigationSources.id.find(id),
    ),
    snapshots: [...ctx.db.sourceSnapshots.runId.filter(run.id)],
  };
}

function registerInventory(
  ctx: Ctx,
  run: Run,
  sourceId: string,
  connectorId: string,
  s: SnapshotInput,
) {
  const name = connectors.find((c) => c.id === connectorId)!.name,
    at = time(ctx),
    datasetId = `${sourceId}:dataset`,
    groupId = `${sourceId}:group`,
    systemId = `${sourceId}:system`;
  function entity(id: string, kind: string, name: string, parentId = "") {
    if (!ctx.db.scopeEntities.id.find(id))
      ctx.db.scopeEntities.insert({
        id,
        organizationId: run.organizationId,
        kind,
        reference: `${connectorId}-${kind.replace(/ /g, "-")}`,
        name,
        description: `Synthetic staged ${s.coverage} snapshot at ${s.collectedAt}. ${s.records.length} observed export entries; actual live-system scope and impact remain unknown.`,
        owner: "Synthetic Acme response team",
        assetType:
          kind === "System"
            ? "Database"
            : kind === "Business Operation"
              ? "Business service"
              : "",
        parentId,
        datasetId: ["Dataset", "Record Group"].includes(kind) ? datasetId : "",
        groupId: "",
        dataCategory:
          connectorId === "identity"
            ? "Authentication data"
            : connectorId === "customers"
              ? "Personal information"
              : "Internal business records",
        sensitivity: "Restricted",
        recordCount: ["Dataset", "Record Group"].includes(kind)
          ? s.records.length
          : 0,
        countKnown: ["Dataset", "Record Group"].includes(kind),
        defaultVisible: true,
        createdBy: run.actorId,
        createdAt: at,
        updatedAt: at,
      });
    const idKey = `${run.incidentKey}:${id}`;
    if (!ctx.db.scopeAssociations.id.find(idKey))
      ctx.db.scopeAssociations.insert({
        id: idKey,
        organizationId: run.organizationId,
        incidentId: run.incidentId,
        incidentKey: run.incidentKey,
        entityId: id,
        createdBy: run.actorId,
        createdAt: at,
      });
  }
  entity(
    systemId,
    connectorId === "services" ? "Business Operation" : "System",
    name,
  );
  entity(datasetId, "Dataset", `${name} — staged snapshot`, systemId);
  entity(groupId, "Record Group", `${name} export entries`, datasetId);
  const scope = {
    organizationId: run.organizationId,
    incidentId: run.incidentId,
    incidentKey: run.incidentKey,
  };
  for (const r of s.records) {
    const id = `${sourceId}:record:${r.key}`;
    if (!ctx.db.scopeRecords.id.find(id))
      ctx.db.scopeRecords.insert({
        id,
        organizationId: run.organizationId,
        datasetId,
        groupId,
        reference: r.key,
        dataCategory:
          connectorId === "customers"
            ? "Personal information"
            : "Internal business records",
        sensitivity: "Restricted",
        syntheticMetadata: json({
          source: connectorId,
          collection: s.collectedAt,
          trust: "Untrusted source; no impact assessment",
        }),
      });
    if (!ctx.db.scopeRecordMemberships.id.find(`${groupId}:${id}`))
      ctx.db.scopeRecordMemberships.insert({
        id: `${groupId}:${id}`,
        organizationId: run.organizationId,
        groupId,
        recordId: id,
      });
  }
  for (const [source, target, type] of [
    [datasetId, groupId, "CONTAINS"],
    [
      datasetId,
      systemId,
      connectorId === "services" ? "RELATED_TO" : "STORED_IN",
    ],
    [`incident:${run.incidentId}`, systemId, "RELATED_TO"],
    [`incident:${run.incidentId}`, datasetId, "RELATED_TO"],
    [`incident:${run.incidentId}`, groupId, "RELATED_TO"],
  ]) {
    const sourceRef =
      source === `incident:${run.incidentId}`
        ? { id: source, kind: "Incident" }
        : ctx.db.scopeEntities.id.find(source);
    const targetRef = ctx.db.scopeEntities.id.find(target);
    if (!sourceRef || !targetRef || !compatibility(type, sourceRef, targetRef))
      throw new Error(
        "Generated inventory relationship violates Scope type policy.",
      );
    const id = `${run.incidentKey}:inventory:${source}:${target}`;
    if (!ctx.db.scopeRelationships.id.find(id))
      ctx.db.scopeRelationships.insert({
        id,
        ...scope,
        sourceId: source,
        targetId: target,
        type,
        status: "Unverified",
        justification:
          "Explicit source registration; no compromise, access or impact implied.",
        evidenceIds: "[]",
        createdBy: run.actorId,
        createdAt: at,
      });
  }
  appendEvent(
    ctx,
    run.organizationId,
    run.incidentId,
    run.actorId,
    "scope",
    "Staged source inventory registered",
    `${name}: observed export inventory only; not confirmed affected records.`,
    { newValue: json({ scopeEntityId: systemId, sourceId }) },
  );
}
export function investigationProjection(
  ctx: Reader,
  access: { organizationId: string; incidentId: string; permissions: string }[],
) {
  return access.flatMap((a) => {
    const k = key(a.organizationId, a.incidentId),
      meta = ctx.db.incidentInvestigations.id.find(k);
    const emit = (kind: string, id: string, body: unknown) => ({
      id: `${kind}:${id}`,
      kind,
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      body: json(body),
    });
    const rawRuns = [...ctx.db.analysisRuns.incidentKey.filter(k)].sort(
      (a, b) => Number(b.createdAt - a.createdAt),
    );
    const latestSnapshots = rawRuns[0]
      ? [...ctx.db.sourceSnapshots.runId.filter(rawRuns[0].id)]
      : [];
    const runs = rawRuns.map(
      ({
        leaseToken,
        membershipRevision,
        assignmentRevision,
        fingerprint,
        operationKey,
        ...r
      }) => emit("run", r.id, r),
    );
    return [
      ...(meta ? [emit("metadata", k, meta)] : []),
      ...runs,
      ...[...ctx.db.investigationSources.incidentKey.filter(k)].map((s) =>
        emit("source", s.id, {
          ...s,
          collectedSnapshots: latestSnapshots.filter(
            (item) => item.sourceId === s.id && item.status === "Finalized",
          ).length,
          recordCount: latestSnapshots.find(
            (item) =>
              item.sourceId === s.id &&
              item.role === "current" &&
              item.status === "Finalized",
          )?.recordCount,
        }),
      ),
    ];
  });
}
