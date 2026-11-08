import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { command } from "../../lib/server/gateway";
import {
  processNextJob,
  workerCall,
} from "../../lib/server/investigation/runner";
import {
  verifyOriginal,
  type AgentJob,
} from "../../lib/server/investigation/agent";
import type {
  AgentObservation,
  Citation,
  GroundedProposal,
  ReviewedProposal,
} from "../../../shared/agent-investigation";
import {
  isImpact,
  type ImpactProposal,
  type InvestigationProposal,
} from "../../../shared/investigation-impact";
import {
  configureInvestigationTest,
  login,
  post,
  newIncident,
  connection,
  root,
} from "./investigation-support";

test.beforeEach(() => configureInvestigationTest());
const ids = (s: {
  organizationId: string;
  incidentId: string;
  agentRunId: string;
  runId: string;
}) => ({
  organizationId: s.organizationId,
  incidentId: s.incidentId,
  agentRunId: s.agentRunId,
  runId: s.runId,
});
async function prepare(context: Parameters<typeof newIncident>[0]) {
  await login(context);
  const scope = await newIncident(context);
  const collection = await post(context.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["customers", "identity", "network", "services"],
    operationId: randomUUID(),
  });
  expect(collection.status()).toBe(200);
  const runId = (await collection.json()).runId as string;
  expect(await processNextJob()).toBe(true);
  const start = await post(context.request, "investigation", {
    ...scope,
    action: "agent.start",
    runId,
    operationId: randomUUID(),
  });
  expect(start.status()).toBe(200);
  const agentRunId = (await start.json()).agentRunId as string;
  const job = await workerCall<AgentJob>("agent.claim"),
    base = { agentRunId, leaseToken: job.job.leaseToken };
  // Existing bounded worker protocol fixture: tests use real persisted A evidence;
  // B's unchanged live-model loop is carried forward rather than called for UI tests.
  await workerCall("agent.begin", {
    ...base,
    model: "desktop-review-protocol-fixture",
    endpoint: "http://127.0.0.1:1",
  });
  const tool = (name: string, args: object) =>
    workerCall<unknown>("agent.tool", {
      ...base,
      name,
      args,
      callId: randomUUID(),
    });
  const observations: AgentObservation[] = [];
  for (const source of job.sources)
    observations.push(
      ...((await tool("detect_anomalies", {
        sourceId: source.id,
      })) as AgentObservation[]),
    );
  const selected = [
    observations.find((o) => o.rule === "traffic-after-reported-isolation")!,
    observations.find((o) => o.rule === "new-signin-source")!,
  ];
  const citations = selected.flatMap((o) =>
    (JSON.parse(o.provenance) as Omit<Citation, "observationId">[]).map(
      (c) => ({ ...c, observationId: o.id }),
    ),
  );
  for (const ref of citations) {
    await verifyOriginal(job, ref.snapshotId, ref.key);
    await tool("parse_evidence", { snapshotId: ref.snapshotId, key: ref.key });
  }
  await tool("propose_findings", {
    proposals: [
      {
        observationIds: selected.map((o) => o.id),
        citations,
        priority: "High",
        interpretation: "Investigate containment",
      },
    ],
  });
  const read = async () => {
    const r = await post(context.request, "investigation", {
      ...scope,
      action: "agent.read",
      agentRunId,
    });
    expect(r.status()).toBe(200);
    return (await r.json()) as {
      rows: ReviewedProposal[];
      impactPrepared: boolean;
      assessedEntities: number;
    };
  };
  const output = await read();
  return { ...scope, runId, agentRunId, output, read };
}

test("desktop results, evidence, finding acceptance and Phase 3 assessment review preserve the reference case", async ({
  context,
  page,
}) => {
  await login(context);
  const before = await command<{
    rows: { table: string; id: string; body: string }[];
    artifacts: unknown[];
  }>("investigation.reference", "", {});
  const s = await prepare(context),
    live = await connection(context);
  const finding = s.output.rows.find(
    (p) => !isImpact(JSON.parse(p.content) as InvestigationProposal),
  )!;
  const assessment = s.output.rows.find((p) => {
    const c = JSON.parse(p.content) as InvestigationProposal;
    return isImpact(c) && c.dimension === "Availability";
  })!;
  const impact = JSON.parse(assessment.content) as ImpactProposal;
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/org/acme/incidents/${s.incidentId}/investigation`);
    await expect(page.getByRole("tab", { name: /^Findings/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("heading", { name: "Needs Review", exact: false }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("tablist", { name: "Investigation views" })
        .getByRole("tab"),
    ).toHaveCount(3);
    await expect(
      page
        .getByRole("navigation", { name: "Incident navigation" })
        .getByRole("link"),
    ).toHaveCount(5);
    await expect(
      page.getByRole("heading", { name: "Potential Impact", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Investigation summary")).toContainText("18");
    await expect(page.getByLabel("Investigation summary")).toContainText("7");
    await expect(
      page.getByLabel("Customer Records / CRM", { exact: true }),
    ).toHaveCount(0);
    await mkdir(resolve(root, ".spacetime/diagnostics"), { recursive: true });
    await page.screenshot({
      path: resolve(
        root,
        ".spacetime/diagnostics/investigation-findings-desktop.png",
      ),
    });
    await page.getByRole("tab", { name: "Evidence", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Evidence sources", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Customer Records / CRM", exact: true })
      .click();
    await expect(page.getByTestId("source-differences")).toContainText(
      "C-1044",
    );
    await expect(page.getByTestId("source-differences")).toContainText(
      "modified",
    );
    await page
      .getByTestId("source-differences")
      .getByText("C-1044", { exact: true })
      .click();
    await expect(page.getByTestId("source-differences")).toContainText(
      "Contact email",
    );
    await expect(page.getByTestId("source-differences")).toContainText(
      "deletion",
    );
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Processing milestones" }),
    ).toContainText("Complete");
    await expect(
      page.getByText("Completed tool calls", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /^Findings/ }).click();
    await page.getByTestId(`proposal-row-${finding.id}`).click();
    let review = page.getByRole("dialog");
    await expect(
      review.getByText("What AEGIS found", { exact: true }),
    ).toBeVisible();
    await review
      .getByRole("button", { name: /^Review evidence/ })
      .first()
      .click();
    const original = page.getByRole("dialog").last();
    await expect(original.locator("pre")).toContainText("NET-002");
    await original.getByRole("button", { name: "Close", exact: true }).click();
    review = page.getByRole("dialog");
    await review
      .getByLabel("Review justification", { exact: true })
      .fill(
        "Reviewed the specific source records and their limits; record the finding as suspected only.",
      );
    await review
      .getByRole("button", { name: "Accept proposal", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "Suspected finding created",
    );
    await review.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByTestId(`proposal-row-${assessment.id}`).click();
    review = page.getByRole("dialog");
    await expect(review).toContainText("Reported interruption");
    await expect(review).toContainText("not independently verified");
    await page.screenshot({
      path: resolve(
        root,
        ".spacetime/diagnostics/investigation-review-desktop.png",
      ),
    });
    const reason =
      "Reviewed the reported service outage and original snapshot. Availability remains suspected pending independent verification.";
    await review
      .getByLabel("Review justification", { exact: true })
      .fill(reason);
    await review
      .getByRole("button", { name: "Accept assessment", exact: true })
      .click();
    await expect(review.getByRole("status")).toContainText(
      "Availability assessment recorded in Scope as Suspected",
    );
    const state = await post(context.request, "investigation", {
      ...ids(s),
      action: "agent.inspect",
      proposalId: assessment.id,
    });
    expect(state.status()).toBe(200);
    const current = (await state.json()).currentAssessment;
    expect(current.id).toBe(impact.assessmentId);
    expect(current.status).toBe("Suspected");
    expect(current.verifiedBy).toBe("");
    expect(current.verifiedAt).toBe("0");
    await expect
      .poll(
        () =>
          [...live.conn.db.visibleIncidentData.iter()].filter(
            (r) => r.incidentId === s.incidentId && r.kind === "finding",
          ).length,
      )
      .toBe(1);
    const events = () =>
      [...live.conn.db.visibleIncidentData.iter()].filter(
        (r) => r.incidentId === s.incidentId && r.kind === "event",
      ).length;
    const count = events();
    const retry = await post(context.request, "investigation", {
      ...ids(s),
      action: "agent.review",
      proposalId: assessment.id,
      decision: "Accept",
      status: impact.proposedStatus,
      linkScope: false,
      justification: reason,
    });
    expect(retry.status()).toBe(200);
    expect(events()).toBe(count);
    await review
      .getByRole("link", { name: "View assessment in Scope", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Scope & evidence", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("assessment-Availability").first(),
    ).toContainText("Suspected");
    await page
      .getByRole("navigation", { name: "Incident navigation" })
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    const title = (JSON.parse(finding.content) as GroundedProposal).title;
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    const after = await command<typeof before>(
        "investigation.reference",
        "",
        {},
      ),
      rows = new Map(after.rows.map((r) => [`${r.table}:${r.id}`, r.body]));
    for (const row of before.rows)
      expect(rows.get(`${row.table}:${row.id}`)).toBe(row.body);
    expect(after.artifacts).toEqual(before.artifacts);
  } finally {
    live.conn.disconnect();
  }
});

test("assessment permissions, certainty rejection, idempotent derivation and stale human decisions use existing Scope rules", async ({
  context,
  browser,
  page,
}) => {
  const s = await prepare(context),
    impactRows = s.output.rows.filter((p) =>
      isImpact(JSON.parse(p.content) as InvestigationProposal),
    );
  expect(impactRows).toHaveLength(5);
  expect(
    impactRows.some(
      (p) =>
        (JSON.parse(p.content) as ImpactProposal).dimension === "Encryption",
    ),
  ).toBe(false);
  const proposal = impactRows.find(
      (p) =>
        (JSON.parse(p.content) as ImpactProposal).dimension === "Alteration",
    )!,
    content = JSON.parse(proposal.content) as ImpactProposal;
  const decision = {
    ...ids(s),
    action: "agent.review",
    proposalId: proposal.id,
    decision: "Accept",
    status: content.proposedStatus,
    linkScope: false,
    justification:
      "Inspect the record alteration without claiming malicious cause.",
  };
  const operations = await browser.newContext();
  try {
    await login(operations, "jordan");
    expect(
      (await post(operations.request, "investigation", decision)).status(),
    ).toBe(403);
  } finally {
    await operations.close();
  }
  expect(
    (
      await post(context.request, "investigation", {
        ...decision,
        organizationId: "northstar",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(context.request, "investigation", {
        ...decision,
        status: "Confirmed",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await post(context.request, "investigation", {
        ...decision,
        justification: " ",
      })
    ).status(),
  ).toBe(400);
  for (let i = 0; i < 2; i++) {
    const r = await post(context.request, "investigation", {
      ...ids(s),
      action: "agent.assess",
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).created).toBe(0);
  }
  expect((await s.read()).rows).toHaveLength(s.output.rows.length);
  const manual = await post(context.request, "scope", {
    ...ids(s),
    action: "assessment",
    entityId: content.entityId,
    dimension: "Alteration",
    status: "Suspected",
    description: "Existing independently entered human assessment.",
    justification: "Preserve this explicit manual decision.",
    evidenceIds: [...new Set(content.citations.map((c) => c.evidenceId))],
    findingId: "",
    annotation: "",
    excerpt: "",
  });
  expect(manual.status()).toBe(200);
  const stale = await post(context.request, "investigation", decision);
  expect(stale.status()).toBe(400);
  expect((await stale.json()).code).toBe("CONFLICT");
  await page.goto(`/org/acme/incidents/${s.incidentId}/investigation`);
  await page.getByTestId(`proposal-row-${proposal.id}`).click();
  const review = page.getByRole("dialog");
  await expect(review).toContainText("changed after this proposal");
  await expect(
    review.getByRole("button", { name: "Accept assessment", exact: true }),
  ).toBeDisabled();
  await review
    .getByLabel("Review justification", { exact: true })
    .fill(
      "Keep the existing human assessment and reject this stale suggestion.",
    );
  await review.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(review.getByRole("status")).toContainText("Proposal rejected");
  const preserved = await post(context.request, "investigation", {
    ...ids(s),
    action: "agent.inspect",
    proposalId: proposal.id,
  });
  expect((await preserved.json()).currentAssessment.description).toBe(
    "Existing independently entered human assessment.",
  );
});
