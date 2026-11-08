import { test, expect, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { command } from "../../lib/server/gateway";
import { collectSnapshot } from "../../lib/server/investigation/collector";
import {
  processJob,
  processNextJob,
  workerCall,
  type WorkerJob,
} from "../../lib/server/investigation/runner";
import { processNextAgentJob } from "../../lib/server/investigation/agent";
import type {
  AgentObservation,
  ReviewedProposal,
  GroundedProposal,
} from "../../../shared/agent-investigation";
import {
  isImpact,
  type InvestigationProposal,
} from "../../../shared/investigation-impact";
import {
  configureInvestigationTest,
  login,
  post,
  newIncident,
  connection,
  sessionHash,
} from "./investigation-support";
const ok = async <T>(response: APIResponse): Promise<T> => {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body as T;
};
test.beforeEach(() => configureInvestigationTest());
test("later actual evidence drives a real agent review, Scope, follow-up task and immutable report v2 on desktop", async ({
  context,
  page,
}) => {
  test.setTimeout(210_000);
  await login(context);
  const reference = await command<{
    version: string;
    rows: { table: string; id: string; body: string }[];
    artifacts: unknown[];
  }>("investigation.reference", "", {});
  const scope = await newIncident(context),
    sourceId = `acme:${scope.incidentId}:source:customers`,
    base = `/org/acme/incidents/${scope.incidentId}`;
  const initial = await ok<{ runId: string }>(
    await post(context.request, "investigation", {
      ...scope,
      action: "start",
      connectorIds: ["customers", "identity", "network", "services"],
      operationId: randomUUID(),
    }),
  );
  expect(await processNextJob()).toBe(true);
  const differences = await ok<{
    snapshots: { id: string; evidenceId: string; role: string }[];
  }>(
    await post(context.request, "investigation", {
      ...scope,
      action: "read",
      kind: "differences",
      runId: initial.runId,
      sourceId,
      limit: 50,
    }),
  );
  const initialSnapshot = differences.snapshots.find(
    (s) => s.role === "current",
  )!;
  const assessment = await ok<{ assessmentId: string }>(
    await post(context.request, "scope", {
      ...scope,
      action: "assessment",
      entityId: `${sourceId}:record:C-1044`,
      dimension: "Alteration",
      status: "Suspected",
      description:
        "Earlier human-reviewed alteration decision, preserved across new access context.",
      justification:
        "Review actual source differences without confirming their cause.",
      evidenceIds: [initialSnapshot.evidenceId],
      findingId: "",
      annotation: "",
      excerpt: "",
    }),
  );
  const report1 = await ok<{ reportId: string }>(
    await post(context.request, "recovery", {
      ...scope,
      action: "report.generate",
      type: "Detailed Incident Report",
      includeLegal: false,
      operationId: randomUUID(),
    }),
  );
  const reportUrl = (id: string) =>
    `/api/reports/${id}?organizationId=acme&incidentId=${scope.incidentId}`;
  const oldBytes = await (
    await context.request.get(reportUrl(report1.reportId))
  ).body();
  const live = await connection(context);
  try {
    await new Promise<void>((resolve, reject) =>
      live.conn
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError((e) => reject(e))
        .subscribe([
          "SELECT * FROM visible_coordination_data",
          "SELECT * FROM visible_recovery_data",
        ]),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/investigation`);
    await page
      .getByRole("button", { name: "Collect next snapshot", exact: true })
      .click();
    await expect
      .poll(() => live.rows<{ id: string }>("run", scope.incidentId).length)
      .toBe(2);
    const job = await workerCall<WorkerJob>("claim");
    expect(job.run.id).not.toBe(initial.runId);
    const operationId = randomUUID();
    // The already queued UI operation has stable identity; competing operations cannot duplicate work.
    expect(
      (
        await post(context.request, "investigation", {
          ...scope,
          action: "refresh",
          runId: initial.runId,
          operationId,
        })
      ).status(),
    ).toBe(400);
    await command("test_expire_session", await sessionHash(context), {});
    const unique = `NET-${randomUUID().slice(0, 8)}`;
    await processJob(job, async (id, revision) => {
      const result = await collectSnapshot(id, revision);
      if (revision === 2 && id === "network") {
        result.data.records.at(-1)!.key = unique;
        result.data.records.at(-1)!.fields.bytes = 78123;
      }
      if (revision === 2 && id === "customers") {
        result.data.records = result.data.records.filter(
          (r) => r.key !== "C-1043",
        );
        result.data.records.push({ ...result.data.records[0], key: "C-2099" });
      }
      return {
        ...result,
        bytes: Buffer.from(JSON.stringify(result.data), "utf8"),
      };
    });
    expect(
      (
        await post(context.request, "investigation", {
          ...scope,
          action: "read",
          kind: "observations",
          runId: job.run.id,
        })
      ).status(),
    ).toBe(401);
    await login(context);
    await ok(
      await post(context.request, "connection/bind", {
        identity: live.conn.identity!.toHexString(),
      }),
    );
    await page.reload();
    await page.getByText("Snapshot changes", { exact: false }).click();
    await expect(page.getByTestId("reassessment-summary")).toContainText(
      "missing",
    );
    const summary = await ok<{
      revision: number;
      sources: {
        sourceId: string;
        baselineSnapshotId: string;
        counts: Record<string, number>;
      }[];
    }>(
      await post(context.request, "investigation", {
        ...scope,
        action: "read",
        kind: "monitoring",
        runId: job.run.id,
      }),
    );
    expect(summary.revision).toBe(2);
    const customer = summary.sources.find((s) => s.sourceId === sourceId)!;
    expect(customer.baselineSnapshotId).toBe(initialSnapshot.id);
    expect(customer.counts).toMatchObject({
      added: 1,
      modified: 1,
      missing: 1,
      unchanged: 10,
    });
    const obs = await ok<{ rows: AgentObservation[] }>(
      await post(context.request, "investigation", {
        ...scope,
        action: "read",
        kind: "observations",
        runId: job.run.id,
        limit: 50,
      }),
    );
    expect(
      obs.rows.some(
        (o) => o.rule === "new-access-context" && o.key === "C-1044",
      ),
    ).toBe(true);
    expect(
      obs.rows
        .filter((o) => o.rule === "traffic-after-reported-isolation")
        .map((o) => o.key),
    ).toEqual([unique]);
    expect(
      obs.rows.find((o) => o.rule === "missing-export-entry")?.description,
    ).toContain("deletion has not been established");
    await expect
      .poll(
        () =>
          [...live.conn.db.visibleIncidentData.iter()].filter(
            (r) =>
              r.incidentId === scope.incidentId &&
              r.kind === "event" &&
              JSON.parse(r.body).title === "Incremental reassessment ready" &&
              JSON.parse(JSON.parse(r.body).newValue).revision === 2,
          ).length,
      )
      .toBeGreaterThan(0);
    expect([...live.conn.db.visibleIncidentData.iter()].filter(
      (r) => r.incidentId === scope.incidentId && r.kind === "notification",
    )).toHaveLength(0);
    await expect
      .poll(() => live.rows<{ id: string }>("agent", scope.incidentId).length)
      .toBe(1);
    expect(await processNextAgentJob()).toBe(true);
    const agent = live.rows<{ id: string; status: string }>(
      "agent",
      scope.incidentId,
    )[0];
    await expect
      .poll(
        () =>
          live.rows<{ status: string }>("agent", scope.incidentId)[0]?.status,
      )
      .toBe("Complete");
    const proposals = await ok<{ rows: ReviewedProposal[] }>(
      await post(context.request, "investigation", {
        ...scope,
        action: "agent.read",
        agentRunId: agent.id,
      }),
    );
    const finding = proposals.rows.find(
      (p) => !isImpact(JSON.parse(p.content) as InvestigationProposal),
    )!;
    const content = JSON.parse(finding.content) as GroundedProposal;
    expect(content.correlated).toBe(true);
    expect(content.citations.some((c) => c.key === unique)).toBe(true);
    expect(content.claim).toContain(unique);
    await page.getByTestId(`proposal-row-${finding.id}`).click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Review justification")
      .fill(
        "New correlated event requires investigation; transferred contents and authorization remain unknown.",
      );
    await dialog
      .getByRole("button", { name: "Accept proposal", exact: true })
      .click();
    await expect(dialog).toContainText("Suspected finding created");
    await dialog
      .getByRole("button", {
        name: "Create follow-up task for me",
        exact: true,
      })
      .click();
    await expect(dialog).toContainText("Follow-up investigation task created");
    const repeatTask = {
      ...scope,
      action: "agent.task",
      agentRunId: agent.id,
      proposalId: finding.id,
    };
    const t1 = await ok<{ taskId: string }>(
      await post(context.request, "investigation", repeatTask),
    );
    const t2 = await ok<{ taskId: string }>(
      await post(context.request, "investigation", repeatTask),
    );
    expect(t1).toEqual(t2);
    await page.keyboard.press("Escape");
    const alteration = proposals.rows.find((p) => {
      const c = JSON.parse(p.content) as InvestigationProposal;
      return (
        isImpact(c) &&
        c.dimension === "Alteration" &&
        c.entityId.endsWith(":C-1042")
      );
    })!;
    expect(alteration).toBeTruthy();
    await page.getByTestId(`proposal-row-${alteration.id}`).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Review justification")
      .fill(
        "Review this newly changed record through existing Scope validation; cause remains unverified.",
      );
    await dialog
      .getByRole("button", { name: "Accept assessment", exact: true })
      .click();
    await expect(dialog).toContainText(
      "Alteration assessment recorded in Scope as Suspected",
    );
    await dialog
      .getByRole("link", { name: "View assessment in Scope", exact: true })
      .click();
    await expect(
      page.getByTestId("assessment-Alteration").first(),
    ).toContainText("Suspected");
    const old = () =>
      [...live.conn.db.visibleScopeData.iter()]
        .filter(
          (r) => r.incidentId === scope.incidentId && r.kind === "assessment",
        )
        .map(
          (r) =>
            JSON.parse(r.body) as {
              id: string;
              description: string;
              verifiedAt: string;
            },
        );
    await expect
      .poll(() => old().some((r) => r.id === assessment.assessmentId))
      .toBe(true);
    expect(
      old().find((r) => r.id === assessment.assessmentId)?.description,
    ).toContain("Earlier human-reviewed");
    expect(old().every((r) => r.verifiedAt === "0")).toBe(true);
    await page.goto(`${base}/overview`);
    await expect(
      page.getByText(unique, { exact: false }).first(),
    ).toBeVisible();
    await page.goto(`${base}/timeline`);
    await expect(
      page.getByText("Incremental reassessment ready", { exact: true }).first(),
    ).toBeVisible();
    await page.goto(`${base}/team`);
    await page
      .getByRole("button", { name: "Incident tasks", exact: true })
      .click();
    await expect(page.getByText(/Follow up:/).first()).toBeVisible();
    const report2 = await ok<{ reportId: string }>(
      await post(context.request, "recovery", {
        ...scope,
        action: "report.generate",
        type: "Detailed Incident Report",
        includeLegal: false,
        operationId: randomUUID(),
      }),
    );
    expect(report2.reportId).not.toBe(report1.reportId);
    const newBytes = await (
      await context.request.get(reportUrl(report2.reportId))
    ).body();
    expect(newBytes.toString()).toContain(unique);
    expect(newBytes.toString()).toContain("Snapshot history");
    expect(
      await (await context.request.get(reportUrl(report1.reportId))).body(),
    ).toEqual(oldBytes);
    await page.goto(`${base}/investigation`);
    await page.getByLabel("Snapshot history").selectOption(initial.runId);
    await expect(
      page.getByRole("button", { name: "Run Investigation", exact: true }),
    ).toHaveCount(0);
    await page
      .getByText("Source snapshots and comparisons", { exact: false })
      .click();
    await page
      .getByRole("button", { name: "Customer Records / CRM", exact: true })
      .click();
    await expect(page.getByTestId("source-differences")).not.toContainText(
      "later-change@example.invalid",
    );
    const after = await command<typeof reference>(
      "investigation.reference",
      "",
      {},
    );
    const existing = new Map(
      after.rows.map((r) => [`${r.table}:${r.id}`, r.body]),
    );
    for (const row of reference.rows)
      expect(existing.get(`${row.table}:${row.id}`)).toBe(row.body);
    const referenceRows = (rows: typeof reference.rows) =>
      rows.filter((r) => {
        const b = JSON.parse(r.body) as { incidentKey?: string; id: string };
        return b.incidentKey === "acme:IR-2041" || b.id === "acme:IR-2041";
      });
    expect(referenceRows(after.rows)).toEqual(referenceRows(reference.rows));
    expect(after.artifacts).toEqual(reference.artifacts);
    expect(after.version).toBe(reference.version);
  } finally {
    live.conn.disconnect();
  }
});

test("subsequent collection preserves authorization, rejects stale parents and bounded revisions, and never duplicates a job", async ({
  context,
  browser,
}) => {
  await login(context);
  const scope = await newIncident(context);
  const r = await ok<{ runId: string }>(
    await post(context.request, "investigation", {
      ...scope,
      action: "start",
      connectorIds: ["customers"],
      operationId: randomUUID(),
    }),
  );
  expect(await processNextJob()).toBe(true);
  const data = {
    ...scope,
    action: "refresh",
    runId: r.runId,
    operationId: randomUUID(),
  };
  const ops = await browser.newContext();
  try {
    await login(ops, "jordan");
    expect((await post(ops.request, "investigation", data)).status()).toBe(403);
  } finally {
    await ops.close();
  }
  expect(
    (
      await post(context.request, "investigation", {
        ...data,
        incidentId: "IR-2041",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(context.request, "investigation", {
        ...data,
        organizationId: "northstar",
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(context.request, "investigation", {
        ...data,
        runId: "fictional",
      })
    ).status(),
  ).toBe(400);
  const later = await ok<{ runId: string }>(
    await post(context.request, "investigation", data),
  );
  expect(await processNextJob()).toBe(true);
  expect(await ok(await post(context.request, "investigation", data))).toEqual(
    later,
  );
  const live = await connection(context);
  try {
    await expect.poll(() => [...live.conn.db.visibleIncidentData.iter()].some((row) => {
      if (row.incidentId !== scope.incidentId || row.kind !== "event") return false;
      const event = JSON.parse(row.body);
      return event.title === "Incremental reassessment ready" && JSON.parse(event.newValue).revision === 2;
    })).toBe(true);
    expect([...live.conn.db.visibleIncidentData.iter()].filter(
      (row) => row.incidentId === scope.incidentId && row.kind === "notification",
    )).toHaveLength(0);
  } finally { live.conn.disconnect(); }
  const report = await ok<{ reportId: string }>(await post(context.request, "recovery", {
    ...scope, action: "report.generate", type: "Detailed Incident Report",
    includeLegal: false, operationId: randomUUID(),
  }));
  const artifact = await context.request.get(`/api/reports/${report.reportId}?organizationId=acme&incidentId=${scope.incidentId}`);
  expect(artifact.status()).toBe(200);
  const html = (await artifact.body()).toString();
  expect(html).toContain("Snapshot history");
  expect(html).toContain(r.runId);
  expect(html).toContain(later.runId);
  expect(
    (
      await post(context.request, "investigation", {
        ...data,
        runId: later.runId,
      })
    ).status(),
  ).toBe(400);
  const end = await post(context.request, "investigation", {
    ...data,
    runId: later.runId,
    operationId: randomUUID(),
  });
  expect(end.status()).toBe(503);
  expect((await end.json()).code).toBe("UNAVAILABLE");
});
