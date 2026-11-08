import type { Ctx } from "./index";
import { appendEvent, json, time } from "./incident-domain";
import { isInitialFixtureEvent } from "./incident-seed";

// A one-time demo migration: keep original history and append explicit corrections.
export function seedDemoEventTimings(ctx: Ctx) {
  if (ctx.env.AEGIS_DEVELOPMENT_MODE !== "true" && ctx.env.AEGIS_TEST_MODE !== "true") return;
  const marker = "acme-demo-event-timing-v3";
  if (ctx.db.scenarioSeeds.id.find(marker)) return;
  const delays = [3, 7, 12, 18, 24, 30];
  const events = [...ctx.db.incidentEvents.iter()];
  const planned: { event: (typeof events)[number]; observedAt: bigint; createdAt: bigint }[] = [];
  let index = 0;
  for (const event of events) {
    if (event.organizationId !== "acme" || event.correctsEventId || event.observedAt !== event.createdAt) continue;
    const finding = ctx.db.findings.id.find(event.findingId);
    const visualFinding = event.type === "finding" && /^IR-2041:UI-0[123]$/.test(event.findingId) &&
      finding?.title === event.title && finding.createdAt === event.createdAt;
    const visualDecision = event.type === "decision" && event.title === "Independent purchasing route documented" &&
      event.description.startsWith("Synthetic business continuity update:");
    const inventory = event.type === "scope" &&
      ["Synthetic scope inventory registered", "Scope inventory associations documented"].includes(event.title) &&
      event.createdAt === BigInt(Date.parse("2026-11-07T09:30:00-06:00"));
    if (!isInitialFixtureEvent(event) && !visualFinding && !visualDecision && !inventory) continue;
    const delay = BigInt(delays[index++ % delays.length]) * 60_000n;
    const evidenceId = event.type === "evidence" ? event.title.replace("Evidence attached: ", "") : "";
    const evidence = ctx.db.evidence.id.find(evidenceId);
    // Historical evidence and findings retain their actual source observations.
    // Recent demo reports use earlier observations so recording never lies in the future.
    const observedAt = visualFinding || visualDecision
      ? event.createdAt - delay
      : evidence ? evidence.collectedAt : event.observedAt;
    const createdAt = visualFinding || visualDecision || event.type === "incident"
      ? event.createdAt
      : event.createdAt > observedAt ? event.createdAt : observedAt + delay;
    planned.push({ event, observedAt, createdAt });
  }
  for (const item of planned) {
    const { event, observedAt } = item;
    let { createdAt } = item;
    if (event.type === "finding") {
      // A fixture artifact cannot have been attached before its finding existed.
      for (const evidence of planned.filter((other) => other.event.type === "evidence" &&
        other.event.findingId === event.findingId)) {
        if (evidence.createdAt >= observedAt && evidence.createdAt < createdAt) createdAt = evidence.createdAt;
      }
    }
    appendEvent(ctx, "acme", event.incidentId, "maya", "fixture_timing",
      "Synthetic observation time corrected",
      "Demo fixture correction: align observations with original evidence and findings, with recording delays of at most 30 minutes. Original event timestamps are preserved.", {
        correctsEventId: event.id.toString(),
        findingId: event.findingId,
        previousValue: json({ observedAt: event.observedAt.toString(), createdAt: event.createdAt.toString() }),
        newValue: json({ observedAt: observedAt.toString(), createdAt: createdAt.toString() }),
      });
  }
  ctx.db.scenarioSeeds.insert({ id: marker, createdAt: time(ctx) });
}
