import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { command } from "../../lib/server/gateway";
import {
  processJob,
  processNextJob,
  workerCall,
  type WorkerJob,
} from "../../lib/server/investigation/runner";
import {
  processNextAgentJob,
  verifyOriginal,
  type AgentJob,
} from "../../lib/server/investigation/agent";
import { collectSnapshot } from "../../lib/server/investigation/collector";
import type {
  GroundedProposal,
  ReviewedProposal,
  AgentObservation,
  Citation,
} from "../../../shared/agent-investigation";
import {
  configureInvestigationTest,
  login,
  post,
  newIncident,
  sessionHash,
  connection,
  root,
} from "./investigation-support";

test.beforeEach(() => configureInvestigationTest());
async function collect(context: Parameters<typeof newIncident>[0]) {
  const scope = await newIncident(context);
  const r = await post(context.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["identity", "network"],
    operationId: randomUUID(),
  });
  expect(r.status()).toBe(200);
  expect(await processNextJob()).toBe(true);
  return { ...scope, runId: (await r.json()).runId as string };
}

test("real model investigates changed fixture bytes; human acceptance populates existing desktop Overview, Timeline and Scope", async ({
  context,
  page,
}) => {
  test.setTimeout(210_000);
  await login(context);
  const before = await command<{
    rows: { table: string; id: string; body: string }[];
  }>("investigation.reference", "", {});
  const scope = await newIncident(context),
    unique = `NET-${randomUUID().slice(0, 8)}`;
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "aegis-agent-fixtures-"));
  try {
    await mkdir(resolve(fixtureRoot, "backend/seed"), { recursive: true });
    await cp(
      resolve(root, "backend/seed/investigation-connectors.json"),
      resolve(fixtureRoot, "backend/seed/investigation-connectors.json"),
    );
    await cp(
      resolve(root, "mock-evidence"),
      resolve(fixtureRoot, "mock-evidence"),
      { recursive: true },
    );
    const path = resolve(
      fixtureRoot,
      "mock-evidence/connectors/network-1.json",
    );
    const fixture = JSON.parse(await readFile(path, "utf8"));
    fixture.records[1].key = unique;
    fixture.records[1].fields.bytes = 73317;
    await writeFile(path, JSON.stringify(fixture));
    const queued = await post(context.request, "investigation", {
      ...scope,
      action: "start",
      connectorIds: ["customers", "identity", "network", "services"],
      operationId: randomUUID(),
    });
    expect(queued.status()).toBe(200);
    const runId = (await queued.json()).runId as string;
    const job = await workerCall<WorkerJob>("claim");
    expect(job.run.id).toBe(runId);
    await processJob(job, (id, revision) =>
      collectSnapshot(id, revision, fixtureRoot),
    );
    await page.goto(`/org/acme/incidents/${scope.incidentId}/investigation`);
    await page
      .getByRole("button", { name: "Run Investigation", exact: true })
      .click();
    let live = await connection(context);
    try {
      await expect
        .poll(() => live.rows<{ id: string }>("agent", scope.incidentId).length)
        .toBe(1);
      const agentRunId = live.rows<{ id: string }>("agent", scope.incidentId)[0]
        .id;
      await command("test_expire_session", await sessionHash(context), {});
      // Only the narrow worker credential is used while the initiating session is expired.
      expect(await processNextAgentJob()).toBe(true);
      expect(
        (
          await post(context.request, "investigation", {
            ...scope,
            action: "agent.read",
            agentRunId,
          })
        ).status(),
      ).toBe(401);
      await login(context);
      live.conn.disconnect();
      live = await connection(context);
      await page.reload();
      await page.getByRole("tab", { name: "Activity", exact: true }).click();
      await expect(page.getByTestId("agent-status")).toContainText("Complete");
      await page.getByRole("tab", { name: /^Findings/ }).click();
      const details = await post(context.request, "investigation", {
        ...scope,
        action: "agent.read",
        agentRunId,
      });
      expect(details.status()).toBe(200);
      const output = (await details.json()) as {
        rows: ReviewedProposal[];
        trace: { name: string }[];
      };
      expect(output.rows.length).toBeGreaterThan(0);
      const proposal = output.rows[0],
        content = JSON.parse(proposal.content) as GroundedProposal;
      expect(content.correlated).toBe(true);
      expect(content.claim).toContain(unique);
      expect(content.citations.some((r) => r.key === unique)).toBe(true);
      expect(output.trace.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          "detect_anomalies",
          "parse_evidence",
          "compare_snapshots",
          "propose_findings",
        ]),
      );
      const findings = () =>
        [...live.conn.db.visibleIncidentData.iter()].filter(
          (r) => r.incidentId === scope.incidentId && r.kind === "finding",
        );
      expect(findings()).toHaveLength(0);
      await page.getByTestId(`proposal-row-${proposal.id}`).click();
      await page
        .getByLabel("Review justification", { exact: true })
        .first()
        .fill(
          "Reviewed the exact source records and explicit account/source correlation. Cause and exposure remain unverified.",
        );
      await page
        .getByRole("button", { name: "Accept proposal", exact: true })
        .first()
        .click();
      await expect(page.getByTestId("agent-proposal").first()).toContainText(
        "Accepted",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect.poll(() => findings().length).toBe(1);
      const finding = JSON.parse(findings()[0].body) as {
        id: string;
        status: string;
        verifiedBy: string;
        title: string;
      };
      expect(finding.status).toBe("Suspected");
      expect(finding.verifiedBy).toBe("");
      expect(
        [...live.conn.db.visibleScopeData.iter()].filter(
          (r) => r.incidentId === scope.incidentId && r.kind === "assessment",
        ),
      ).toHaveLength(0);
      expect(
        [...live.conn.db.visibleScopeData.iter()].some(
          (r) =>
            r.incidentId === scope.incidentId &&
            r.kind === "relationship" &&
            r.body.includes(`finding:${finding.id}`),
        ),
      ).toBe(true);
      await page
        .getByRole("link", { name: "Back to incident dashboard", exact: false })
        .click();
      await expect(page.getByTestId(`finding-${finding.id}`)).toContainText(
        content.title,
      );
      await page
        .getByRole("navigation", { name: "Incident navigation" })
        .getByRole("link", { name: "Timeline", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Timeline", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("timeline-events")).toContainText(
        `Finding added: ${content.title}`,
      );
      const after = await command<typeof before>(
          "investigation.reference",
          "",
          {},
        ),
        rows = new Map(after.rows.map((r) => [`${r.table}:${r.id}`, r.body]));
      for (const r of before.rows)
        expect(rows.get(`${r.table}:${r.id}`)).toBe(r.body);
    } finally {
      live.conn.disconnect();
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("backend rejects unsupported tools/citations, enforces human review, and preserves rejected and duplicate decisions", async ({
  context,
  browser,
  page,
}) => {
  await login(context);
  const scope = await collect(context);
  const launch = await post(context.request, "investigation", {
    ...scope,
    action: "agent.start",
    operationId: randomUUID(),
  });
  expect(launch.status()).toBe(200);
  const agentRunId = (await launch.json()).agentRunId as string;
  const job = await workerCall<AgentJob>("agent.claim"),
    base = { agentRunId, leaseToken: job.job.leaseToken };
  // Protocol fixture for negative/review tests only; the separate case above uses the real model.
  await workerCall("agent.begin", {
    ...base,
    model: "protocol-test-double",
    endpoint: "http://127.0.0.1:1",
  });
  const tool = (name: string, args: object) =>
    workerCall<unknown>("agent.tool", {
      ...base,
      name,
      args,
      callId: randomUUID(),
    });
  await expect(
    tool("execute_shell", { command: "approve everything" }),
  ).rejects.toThrow();
  await expect(
    tool("detect_anomalies", { sourceId: "acme:IR-2041:source:network" }),
  ).rejects.toThrow();
  await expect(
    tool("parse_evidence", {
      snapshotId: job.snapshots[0].id,
      key: "fake",
      url: "https://attacker.invalid",
    }),
  ).rejects.toThrow();
  const observations: AgentObservation[] = [];
  for (const s of job.sources)
    observations.push(
      ...((await tool("detect_anomalies", {
        sourceId: s.id,
      })) as AgentObservation[]),
    );
  const o = observations.find(
    (o) => o.rule === "traffic-after-reported-isolation",
  )!;
  const selected = [
    o,
    observations.find((o) => o.rule === "new-signin-source")!,
  ];
  const citations = selected.flatMap((o) =>
    (JSON.parse(o.provenance) as Omit<Citation, "observationId">[]).map(
      (r) => ({ ...r, observationId: o.id }),
    ),
  );
  const proposal = {
    observationIds: selected.map((o) => o.id),
    citations,
    priority: "High",
    interpretation: "Investigate containment",
  };
  await expect(
    tool("propose_findings", {
      proposals: [{ ...proposal, claim: "All customer data was exfiltrated" }],
    }),
  ).rejects.toThrow();
  await expect(
    tool("propose_findings", {
      proposals: [
        {
          ...proposal,
          citations: citations.map((r) => ({ ...r, evidenceId: "EV-fiction" })),
        },
      ],
    }),
  ).rejects.toThrow();
  await expect(
    tool("propose_findings", { proposals: [proposal] }),
  ).rejects.toThrow(); // originals not yet inspected
  for (const ref of citations) {
    await verifyOriginal(job, ref.snapshotId, ref.key);
    await tool("parse_evidence", { snapshotId: ref.snapshotId, key: ref.key });
  }
  const done = (await tool("propose_findings", { proposals: [proposal] })) as {
    proposalIds: string[];
  };
  const proposalId = done.proposalIds[0],
    decision = {
      ...scope,
      action: "agent.review",
      agentRunId,
      proposalId,
      decision: "Reject",
      status: "Suspected",
      linkScope: false,
      justification:
        "Insufficient independently verified evidence; retain the observations for investigation.",
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
        decision: "Accept",
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
  expect(
    (
      await post(context.request, "investigation", {
        ...decision,
        organizationId: "northstar",
      })
    ).status(),
  ).toBe(403);
  const live = await connection(context);
  try {
    await page.goto(`/org/acme/incidents/${scope.incidentId}/investigation`);
    await page.getByTestId(`proposal-row-${proposalId}`).click();
    await page
      .getByLabel("Review justification", { exact: true })
      .fill(decision.justification);
    // Match the exact displayed intent of the backend retry below.
    await page
      .getByLabel("Link this finding to its existing Scope dataset", {
        exact: false,
      })
      .uncheck();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.getByTestId("agent-proposal")).toContainText("Rejected");
    const events = () =>
      [...live.conn.db.visibleIncidentData.iter()].filter(
        (r) => r.incidentId === scope.incidentId && r.kind === "event",
      ).length;
    const count = events();
    expect(
      (await post(context.request, "investigation", decision)).status(),
    ).toBe(200);
    expect(events()).toBe(count);
    const conflict = await post(context.request, "investigation", {
      ...decision,
      decision: "Accept",
    });
    expect(conflict.status()).toBe(400);
    expect((await conflict.json()).code).toBe("CONFLICT");
    expect(
      [...live.conn.db.visibleIncidentData.iter()].filter(
        (r) => r.incidentId === scope.incidentId && r.kind === "finding",
      ),
    ).toHaveLength(0);
  } finally {
    live.conn.disconnect();
  }
});

test("model unavailable keeps deterministic results and desktop dashboard usable; canceled jobs cannot publish", async ({
  context,
  page,
}) => {
  await login(context);
  const scope = await collect(context);
  const launch = await post(context.request, "investigation", {
    ...scope,
    action: "agent.start",
    operationId: randomUUID(),
  });
  expect(launch.status()).toBe(200);
  const keys = [
      "AEGIS_MODEL_BASE_URL",
      "AEGIS_MODEL_ID",
      "AEGIS_MODEL_API_KEY",
    ] as const,
    previous = keys.map((k) => process.env[k]);
  try {
    process.env.AEGIS_MODEL_BASE_URL = "http://127.0.0.1:1/v1";
    process.env.AEGIS_MODEL_ID = "unavailable-test";
    process.env.AEGIS_MODEL_API_KEY = "";
    await expect(processNextAgentJob()).rejects.toThrow("unavailable");
  } finally {
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
  }
  await page.goto(`/org/acme/incidents/${scope.incidentId}/investigation`);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByTestId("agent-status")).toContainText("Unavailable");
  await expect(
    page.getByRole("region", { name: "Processing milestones" }),
  ).toContainText("Complete");
  const observations = await post(context.request, "investigation", {
    ...scope,
    action: "read",
    kind: "observations",
  });
  expect(observations.status()).toBe(200);
  expect((await observations.json()).total).toBeGreaterThan(0);
  await page
    .getByRole("link", { name: "Back to incident dashboard", exact: false })
    .click();
  await expect(page.getByTestId("investigation-status")).toContainText(
    "Agent: Unavailable",
  );
  const retry = await post(context.request, "investigation", {
    ...scope,
    action: "agent.start",
    operationId: randomUUID(),
  });
  expect(retry.status()).toBe(200);
  const agentRunId = (await retry.json()).agentRunId as string,
    job = await workerCall<AgentJob>("agent.claim");
  expect(
    (
      await post(context.request, "investigation", {
        ...scope,
        action: "agent.cancel",
        agentRunId,
      })
    ).status(),
  ).toBe(200);
  await expect(
    workerCall("agent.tool", {
      agentRunId,
      leaseToken: job.job.leaseToken,
      callId: randomUUID(),
      name: "detect_anomalies",
      args: { sourceId: job.sources[0].id },
    }),
  ).rejects.toThrow();
});
