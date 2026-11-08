import type { Ctx, Reader } from "./index";
import { json, time, appendEvent } from "./incident-domain";
import { moduleId } from "./module-id";
import { notifyCoordination } from "./coord-domain";
import { responderAccess } from "./coord-access";
import {
  analyzeIncremental,
  collectionManifest,
} from "../../../shared/investigation-monitoring";
import {
  RULE_VERSION,
  type SnapshotInput,
  type SourceRecord,
} from "../../../shared/investigation";

type Run = NonNullable<ReturnType<Ctx["db"]["analysisRuns"]["id"]["find"]>>;
export function comparisonSnapshots(ctx: Reader, run: Run) {
  const plan = collectionManifest(run);
  const current = [...ctx.db.sourceSnapshots.runId.filter(run.id)];
  return [
    ...Object.entries(plan.previousSnapshots ?? {}).map(([sourceId, id]) => {
      const s = ctx.db.sourceSnapshots.id.find(id);
      if (
        !s ||
        s.sourceId !== sourceId ||
        s.incidentKey !== run.incidentKey ||
        s.status !== "Finalized" ||
        !JSON.parse(run.sourceIds).includes(sourceId)
      )
        throw new Error("Frozen comparison source unavailable.");
      return { ...s, role: "baseline" };
    }),
    ...current,
  ];
}
export function sourceInput(
  ctx: Reader,
  s: ReturnType<typeof comparisonSnapshots>[number],
): SnapshotInput {
  return {
    schema: "aegis-snapshot-v1",
    connectorId: ctx.db.investigationSources.id.find(s.sourceId)!
      .connectorId as SnapshotInput["connectorId"],
    revision: s.revision,
    coverage: s.coverage as SnapshotInput["coverage"],
    collectedAt: s.collectedAt,
    records: [...ctx.db.snapshotRecordVersions.snapshotId.filter(s.id)].map(
      (r) => JSON.parse(r.body) as SourceRecord,
    ),
  };
}
export function monitoringSummary(ctx: Reader, run: Run) {
  const plan = collectionManifest(run);
  const pairs = comparisonSnapshots(ctx, run).filter(
    (s) => s.status === "Finalized",
  );
  return {
    revision: plan.revision,
    previousRunId: plan.previousRunId ?? "",
    sources: (JSON.parse(run.sourceIds) as string[]).flatMap((sourceId) => {
      const b = pairs.find(
          (s) => s.sourceId === sourceId && s.role === "baseline",
        ),
        c = pairs.find((s) => s.sourceId === sourceId && s.role === "current");
      if (!b || !c) return [];
      const a = analyzeIncremental(sourceInput(ctx, b), sourceInput(ctx, c));
      return [
        {
          sourceId,
          baselineSnapshotId: b.id,
          snapshotId: c.id,
          coverage: c.coverage,
          counts: Object.fromEntries(
            ["added", "modified", "missing", "unchanged"].map((k) => [
              k,
              a.changes.filter((c) => c.kind === k).length,
            ]),
          ),
        },
      ];
    }),
    observations: [...ctx.db.analysisObservations.runId.filter(run.id)].length,
    limitations:
      "Missing export entries do not prove deletion. Unchanged content does not establish safety. Earlier human decisions are preserved; new risks require review.",
  };
}
export function finishReassessment(ctx: Ctx, run: Run) {
  if (!collectionManifest(run).previousRunId) return;
  const pairs = comparisonSnapshots(ctx, run).filter(
    (s) => s.status === "Finalized",
  );
  const access = [...ctx.db.analysisObservations.runId.filter(run.id)].filter(
    (o) => o.rule === "new-signin-source",
  );
  const ref = (s: (typeof pairs)[number], key: string, fields: string[]) => {
    const r = ctx.db.snapshotRecordVersions.id.find(`${s.id}:${key}`)!;
    return {
      evidenceId: s.evidenceId,
      snapshotId: s.id,
      key,
      location: r.location,
      fields,
      observedAt: (JSON.parse(r.body) as SourceRecord).observedAt,
      ruleVersion: RULE_VERSION,
      recordHash: r.sha256,
    };
  };
  let contextual = 0;
  for (const s of pairs.filter(
    (s) => s.role === "current" && s.sourceId.endsWith(":customers"),
  )) {
    const b = pairs.find(
      (b) => b.sourceId === s.sourceId && b.role === "baseline",
    );
    if (!b) continue;
    const changes = analyzeIncremental(
      sourceInput(ctx, b),
      sourceInput(ctx, s),
    ).changes;
    for (const change of changes.filter((c) => c.kind === "unchanged")) {
      const entityId = `${s.sourceId}:record:${change.key}`;
      const reviewed = [
        ...ctx.db.scopeAssessments.incidentKey.filter(run.incidentKey),
      ].filter((a) => a.entityId === entityId);
      if (!reviewed.length) continue;
      const matches = access.flatMap((o) => {
        const refs = JSON.parse(o.provenance) as {
          snapshotId: string;
          key: string;
        }[];
        const r = refs
          .map((r) => ({
            s: ctx.db.sourceSnapshots.id.find(r.snapshotId)!,
            key: r.key,
          }))
          .sort((a, b) => b.s.revision - a.s.revision)[0];
        const row = JSON.parse(
          ctx.db.snapshotRecordVersions.id.find(`${r.s.id}:${r.key}`)!.body,
        ) as SourceRecord;
        return row.fields.accountId &&
          row.fields.accountId === change.after!.fields.accountId
          ? [{ o, r }]
          : [];
      });
      if (!matches.length || contextual >= 12) continue;
      const m = matches[0];
      ctx.db.analysisObservations.insert({
        id: moduleId(ctx, (id) => !!ctx.db.analysisObservations.id.find(id)),
        organizationId: run.organizationId,
        incidentId: run.incidentId,
        incidentKey: run.incidentKey,
        runId: run.id,
        sourceId: s.sourceId,
        key: change.key,
        rule: "new-access-context",
        ruleVersion: RULE_VERSION,
        description: `${change.key} is unchanged, but new suspicious sign-in activity shares its account identifier. Reassess the earlier decision; this is a potential access path, not an observed record read or exposure.`,
        provenance: json([
          ref(s, change.key, ["accountId"]),
          ref(m.r.s, m.r.key, ["accountId", "source", "outcome"]),
        ]),
      });
      contextual++;
    }
  }
  const summary = monitoringSummary(ctx, run);
  const prior = [
    ...ctx.db.scopeAssessments.incidentKey.filter(run.incidentKey),
  ].filter((a) =>
    (JSON.parse(run.sourceIds) as string[]).some((id) =>
      a.entityId.startsWith(`${id}:`),
    ),
  );
  appendEvent(
    ctx,
    run.organizationId,
    run.incidentId,
    run.actorId,
    "observation",
    "Incremental reassessment ready",
    `${summary.observations} new observations; ${contextual} unchanged reviewed records have new access context. ${prior.length} earlier assessments retained. Review contradictions before changing Scope or recovery decisions.`,
    {
      newValue: json({
        ...summary,
        priorAssessmentIds: prior.map((a) => a.id),
      }),
    },
  );
  if (summary.observations)
    for (const m of ctx.db.memberships.organizationId.filter(
      run.organizationId,
    )) {
      const a = responderAccess(
        ctx,
        run.organizationId,
        run.incidentId,
        m.userId,
        time(ctx),
      );
      if (
        a &&
        ["evidence:view", "scope:records", "scope:view"].every((p) =>
          (JSON.parse(a.permissions) as string[]).includes(p),
        )
      )
        notifyCoordination(
          ctx,
          run,
          m.userId,
          "investigation.reassessment",
          "New evidence requires investigation",
          `Snapshot revision ${summary.revision}: ${summary.observations} new observations. Prior decisions are preserved; review in Investigation.`,
        );
    }
}

// Source-declared dependencies populate existing inventory links; never confirm impact.
export function registerDependencyContext(ctx: Ctx, run: Run) {
  const pairs = comparisonSnapshots(ctx, run);
  for (const snapshot of pairs.filter(
    (s) => s.role === "current" && s.sourceId.endsWith(":services"),
  )) {
    const systemId = `${snapshot.sourceId}:system`;
    const id = `${run.incidentKey}:${systemId}`;
    if (!ctx.db.businessOperations.id.find(id))
      ctx.db.businessOperations.insert({
        id,
        organizationId: run.organizationId,
        incidentId: run.incidentId,
        incidentKey: run.incidentKey,
        entityId: systemId,
        importance: "Unassessed",
        status: "At Risk",
        explanation:
          "Source-reported service state and dependencies require human review; no recovery eligibility or safety is established.",
        operatingMode: "Unverified",
        activeExecutionId: "",
        updatedAt: time(ctx),
        updatedBy: run.actorId,
      });
    for (const row of sourceInput(ctx, snapshot).records) {
      const target = `${run.incidentKey}:source:${row.fields.dependsOn}:system`;
      const source = ctx.db.scopeEntities.id.find(systemId),
        dependency = ctx.db.scopeEntities.id.find(target);
      if (
        !source ||
        source.kind !== "Business Operation" ||
        !dependency ||
        dependency.kind !== "System" ||
        dependency.organizationId !== run.organizationId ||
        !ctx.db.scopeAssociations.id.find(`${run.incidentKey}:${target}`)
      )
        continue;
      const linkId = `${run.incidentKey}:dependency:${systemId}:${target}`;
      if (ctx.db.scopeRelationships.id.find(linkId)) continue;
      ctx.db.scopeRelationships.insert({
        id: linkId,
        organizationId: run.organizationId,
        incidentId: run.incidentId,
        incidentKey: run.incidentKey,
        sourceId: systemId,
        targetId: target,
        type: "DEPENDS_ON",
        status: "Unverified",
        justification: `Source-declared dependency from ${row.key}; not independently verified.`,
        evidenceIds: json([snapshot.evidenceId]),
        createdBy: run.actorId,
        createdAt: time(ctx),
      });
      appendEvent(
        ctx,
        run.organizationId,
        run.incidentId,
        run.actorId,
        "scope",
        "Source-declared dependency registered",
        "Unverified dependency; no downstream impact or recovery eligibility inferred.",
        {
          evidenceIds: json([snapshot.evidenceId]),
          newValue: json({
            relationshipId: linkId,
            sourceSnapshotId: snapshot.id,
          }),
        },
      );
    }
  }
}
