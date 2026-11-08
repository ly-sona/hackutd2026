import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { command, withServiceConnection } from "../../lib/server/gateway";
import {
  processNextJob,
  processJob,
  workerCall,
  type WorkerJob,
} from "../../lib/server/investigation/runner";
import { collectSnapshot } from "../../lib/server/investigation/collector";
import { evidenceDigest, storeEvidence } from "../../lib/server/evidence-store";
import type {
  InvestigationRun,
  SnapshotInput,
  Change,
} from "../../../shared/investigation";
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
test("creates through existing UI, collects four actual sources, keeps the dashboard and reference intact", async ({
  context,
  page,
}) => {
  await login(context);
  const before = await command<{
    rows: { table: string; id: string; body: string }[];
    artifacts: { id: string; sha256: string }[];
  }>("investigation.reference", "", {});
  await page.goto("/organizations");
  await expect(
    page.getByText("Administrative account review", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New incident", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    title = `Customer service intake ${Date.now()}`;
  await dialog.getByLabel("Incident title").fill(title);
  await dialog
    .getByLabel("Description", { exact: true })
    .fill(
      "Customer service disruption; scope and confidentiality impact unknown.",
    );
  await dialog.getByLabel("Incident Commander (optional)").selectOption("maya");
  await dialog.getByLabel("Alex Rivera", { exact: true }).check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const incidentId = /incidents\/(IR-\d+)/.exec(page.url())![1],
    scope = { organizationId: "acme", incidentId };
  await page
    .getByRole("link", { name: "Start Investigation", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${incidentId}/investigation$`));
  await expect(
    page.getByRole("heading", { name: "Investigation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("HR Records", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Payroll", { exact: true })).toBeDisabled();
  await expect(
    page
      .getByRole("navigation", { name: "Incident navigation" })
      .getByRole("link"),
  ).toHaveCount(5);
  const live = await connection(context);
  try {
    await page
      .getByRole("button", { name: "Start analysis", exact: true })
      .click();
    await expect
      .poll(() => live.rows<InvestigationRun>("run", incidentId).length)
      .toBe(1);
    await page
      .getByRole("link", { name: "Back to incident dashboard", exact: false })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await processNextJob()).toBe(true);
    await expect
      .poll(() => live.rows<InvestigationRun>("run", incidentId)[0]?.status)
      .toBe("Complete");
    expect(live.rows<InvestigationRun>("run", incidentId)[0]).toMatchObject({
      completedSnapshots: 8,
      analyzedSources: 4,
      collectionStatus: "Complete",
      deterministicStatus: "Complete",
      agentStatus: "Not configured",
    });
    const incidentRows = [...live.conn.db.visibleIncidentData.iter()].filter(
      (r) => r.incidentId === incidentId,
    );
    expect(incidentRows.filter((r) => r.kind === "finding")).toHaveLength(0);
    expect(incidentRows.filter((r) => r.kind === "evidence")).toHaveLength(8);
    expect(
      JSON.stringify([...live.conn.db.visibleInvestigationData.iter()]),
    ).not.toContain("leaseToken");
    expect(
      [...live.conn.db.visibleScopeData.iter()].filter(
        (r) => r.incidentId === incidentId && r.kind === "assessment",
      ),
    ).toHaveLength(0);
    const graph = [...live.conn.db.visibleScopeData.iter()].filter(
      (row) => row.incidentId === incidentId,
    );
    const entities = new Map(
      graph
        .filter((row) => row.kind === "entity")
        .map((row) => {
          const e = JSON.parse(row.body) as { id: string; kind: string };
          return [e.id, e];
        }),
    );
    const edges = graph
      .filter((row) => row.kind === "relationship")
      .map(
        (row) =>
          JSON.parse(row.body) as {
            sourceId: string;
            targetId: string;
            type: string;
          },
      );
    expect(
      edges.some(
        (edge) =>
          edge.type === "CONTAINS" &&
          entities.get(edge.sourceId)?.kind === "Dataset" &&
          entities.get(edge.targetId)?.kind === "Record Group",
      ),
    ).toBe(true);
    expect(
      edges
        .filter((edge) => edge.type === "STORED_IN")
        .every(
          (edge) =>
            entities.get(edge.sourceId)?.kind === "Dataset" &&
            entities.get(edge.targetId)?.kind === "System",
        ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Open Investigation", exact: true })
      .click();
    await expect(page.getByTestId("run-status")).toHaveText("Complete");
    await page
      .getByRole("button", { name: "Customer Records / CRM", exact: true })
      .click();
    await expect(page.getByTestId("source-differences")).toContainText(
      "C-1044 · modified",
    );
    await expect(page.getByTestId("source-differences")).toContainText(
      "C-1051 · missing",
    );
    const run = live.rows<InvestigationRun>("run", incidentId)[0];
    const observations = await post(context.request, "investigation", {
      ...scope,
      action: "read",
      kind: "observations",
      runId: run.id,
      limit: 50,
    });
    expect(observations.status()).toBe(200);
    const output = await observations.json();
    expect(output.total).toBeGreaterThan(3);
    for (const observation of output.rows)
      for (const ref of JSON.parse(observation.provenance)) {
        expect(ref.evidenceId).toMatch(/^EV-/);
        expect(ref.snapshotId).toMatch(/^[a-f0-9-]{36}$/);
        expect(ref.location).toMatch(/^\/records\/\d+$/);
        const original = await context.request.get(
          `/api/evidence/${ref.evidenceId}`,
        );
        expect(original.status()).toBe(200);
        const snapshot = JSON.parse(
          (await original.body()).toString(),
        ) as SnapshotInput;
        const sourceRow =
          snapshot.records[Number(ref.location.split("/").pop())];
        expect(sourceRow.key).toBe(ref.key);
        expect(sourceRow.observedAt).toBe(ref.observedAt);
      }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const after = await command<typeof before>(
      "investigation.reference",
      "",
      {},
    );
    const current = new Map(
      after.rows.map((r) => [`${r.table}:${r.id}`, r.body]),
    );
    for (const r of before.rows)
      expect(current.get(`${r.table}:${r.id}`)).toBe(r.body);
    expect(after.artifacts).toEqual(before.artifacts);
    const e = await context.request.get("/api/evidence/EV-018");
    expect(
      createHash("sha256")
        .update(await e.body())
        .digest("hex"),
    ).toBe(before.artifacts.find((a) => a.id === "EV-018")!.sha256);
    const reference = (args: string[]) =>
      promisify(execFile)(
        process.execPath,
        [
          resolve(root, "node_modules/tsx/dist/cli.mjs"),
          "scripts/reference-case.ts",
          ...args,
        ],
        { cwd: root, env: process.env, timeout: 15000 },
      );
    await reference(["--capture"]);
    expect((await reference([])).stdout).toContain(
      "Reference integrity verified",
    );
    const manifestPath = resolve(
        process.env.SPACETIMEDB_DATA_DIR!,
        "ir2041-integrity.json",
      ),
      manifestBytes = await readFile(manifestPath);
    const bad = JSON.parse(manifestBytes.toString());
    bad.rows[Object.keys(bad.rows)[0]] = "0".repeat(64);
    try {
      await writeFile(manifestPath, JSON.stringify(bad));
      await expect(reference([])).rejects.toThrow(
        "Reference integrity conflicts",
      );
    } finally {
      await writeFile(manifestPath, manifestBytes);
    }
    const scenarioIds = () =>
      [...live.conn.db.visibleInvestigationData.iter()]
        .filter(
          (row) =>
            row.kind === "metadata" &&
            (JSON.parse(row.body) as { scenario: string }).scenario,
        )
        .map((row) => row.incidentId)
        .sort();
    const scenariosBefore = scenarioIds();
    expect(scenariosBefore).toHaveLength(2);
    expect(await command("investigation.seed", "", {})).toEqual({
      seeded: false,
    });
    expect(await command("investigation.seed", "", {})).toEqual({
      seeded: false,
    });
    expect(scenarioIds()).toEqual(scenariosBefore);
    const reseeded = await command<typeof before>(
      "investigation.reference",
      "",
      {},
    );
    const preserved = new Map(
      reseeded.rows.map((row) => [`${row.table}:${row.id}`, row.body]),
    );
    for (const row of before.rows)
      expect(preserved.get(`${row.table}:${row.id}`)).toBe(row.body);
    await expect(
      command("incident.reset", "", {
        incidentId: "IR-2041",
        confirm: "RESET DISPOSABLE DEMO READ STATE",
      }),
    ).rejects.toThrow();
  } finally {
    live.conn.disconnect();
  }
});

test("processes available snapshots without a baseline and never claims unchanged or verified-safe records", async ({
  context,
}) => {
  await login(context);
  const scope = await newIncident(context),
    operationId = randomUUID();
  const response = await post(context.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["identity"],
    useBaseline: false,
    operationId,
  });
  expect(response.status()).toBe(200);
  const runId = (await response.json()).runId;
  expect(await processNextJob()).toBe(true);
  const live = await connection(context);
  try {
    expect(
      live.rows<InvestigationRun>("run", scope.incidentId)[0],
    ).toMatchObject({
      completedSnapshots: 1,
      expectedSnapshots: 1,
      deterministicStatus: "Complete",
      agentStatus: "Not configured",
    });
    const result = await post(context.request, "investigation", {
      ...scope,
      action: "read",
      kind: "differences",
      runId,
      sourceId: `acme:${scope.incidentId}:source:identity`,
    });
    const data = await result.json();
    expect(data.snapshots).toHaveLength(1);
    expect(data.rows.every((r: Change) => r.kind === "uncompared")).toBe(true);
    expect(
      (
        await post(context.request, "investigation", {
          ...scope,
          action: "read",
          kind: "observations",
          runId,
          limit: 51,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(context.request, "investigation", {
          ...scope,
          action: "start",
          connectorIds: ["identity"],
          useBaseline: true,
          operationId,
        })
      ).status(),
    ).toBe(400);
  } finally {
    live.conn.disconnect();
  }
});

test("enforces scopes, role permissions, immutable operation identities, and private subscriptions", async ({
  browser,
}) => {
  const maya = await browser.newContext(),
    admin = await browser.newContext(),
    operations = await browser.newContext(),
    anonymous = await browser.newContext();
  try {
    await login(maya);
    await login(admin, "sam");
    await login(operations, "jordan");
    const scope = await newIncident(maya);
    const start = {
      ...scope,
      action: "start",
      connectorIds: ["customers"],
      operationId: randomUUID(),
    };
    expect(
      (await post(anonymous.request, "investigation", start)).status(),
    ).toBe(401);
    for (const c of [admin, operations])
      expect((await post(c.request, "investigation", start)).status()).toBe(
        403,
      );
    expect(
      (
        await post(maya.request, "investigation", {
          ...start,
          organizationId: "northstar",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(maya.request, "investigation", {
          ...start,
          incidentId: "IR-2041",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(maya.request, "investigation", {
          ...start,
          connectorIds: ["payroll"],
        })
      ).status(),
    ).toBe(400);
    for (const action of [
      "seed",
      "reference",
      "test.expireLease",
      "claim",
      "analyze",
    ])
      expect(
        (
          await post(maya.request, "investigation", { ...start, action })
        ).status(),
      ).toBe(400);
    const first = await post(maya.request, "investigation", start),
      runId = (await first.json()).runId;
    expect(first.status()).toBe(200);
    expect(
      (await (await post(maya.request, "investigation", start)).json()).runId,
    ).toBe(runId);
    expect(
      (
        await post(maya.request, "investigation", {
          ...start,
          connectorIds: ["network"],
        })
      ).status(),
    ).toBe(400);
    const job = await workerCall<WorkerJob>("claim");
    expect(job.run.id).toBe(runId);
    expect(await workerCall("claim")).toBeNull(); // An active lease prevents another worker owning this run.
    await expect(
      workerCall("reserve", {
        runId,
        leaseToken: "forged",
        sourceId: job.sources[0].id,
        role: "current",
      }),
    ).rejects.toThrow();
    await expect(
      workerCall("reserve", {
        runId,
        leaseToken: job.run.leaseToken,
        sourceId: "acme:IR-2041:source:customers",
        role: "current",
      }),
    ).rejects.toThrow();
    await withServiceConnection(
      process.env.SPACETIMEDB_WORKER_TOKEN!,
      async (conn) => {
        await expect(
          conn.reducers.accessCommand({
            requestId: randomUUID(),
            sessionHash: "",
            action: "bootstrap",
            payload: "{}",
          }),
        ).rejects.toThrow();
        await expect(
          conn.procedures.lookupCredentials({ login: "maya.chen" }),
        ).rejects.toContain("Trusted server required");
      },
    );
    for (const table of [
      "analysis_runs",
      "source_snapshots",
      "analysis_observations",
      "snapshot_record_versions",
      "incident_investigations",
    ]) {
      const denied = await anonymous.request.post(
        "http://127.0.0.1:3101/v1/database/aegis-e2e/sql",
        {
          data: `SELECT * FROM ${table}`,
          headers: { "Content-Type": "text/plain" },
        },
      );
      expect(denied.ok()).toBe(false);
    }
    expect(
      (
        await post(maya.request, "investigation", {
          ...scope,
          action: "cancel",
          runId,
        })
      ).status(),
    ).toBe(200);
    await expect(
      workerCall("state", { runId, leaseToken: job.run.leaseToken }),
    ).rejects.toThrow();
    const privatePage = await operations.newPage();
    await privatePage.goto(
      `/org/acme/incidents/${scope.incidentId}/investigation`,
    );
    await expect(
      privatePage.getByText(
        "Collection requires an assigned Commander or Analyst",
        { exact: false },
      ),
    ).toBeVisible();
    expect(
      (
        await post(operations.request, "investigation", {
          ...scope,
          action: "read",
          kind: "observations",
          runId,
        })
      ).status(),
    ).toBe(403);
  } finally {
    for (const c of [maya, admin, operations, anonymous]) await c.close();
  }
});

test("continues after session expiry/browser closure, resumes staged work, and rejects later revocation", async ({
  browser,
}) => {
  const c = await browser.newContext();
  await login(c);
  const scope = await newIncident(c),
    hash = await sessionHash(c),
    id = randomUUID();
  const r = await post(c.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["customers"],
    operationId: id,
  });
  expect(r.status()).toBe(200);
  const runId = (await r.json()).runId as string;
  const job = await workerCall<WorkerJob>("claim");
  expect(job.run.id).toBe(runId);
  const snapshot = await workerCall<{ id: string; storageReference: string }>(
    "reserve",
    {
      runId,
      leaseToken: job.run.leaseToken,
      sourceId: job.sources[0].id,
      role: "baseline",
    },
  );
  const { bytes, data } = await collectSnapshot("customers", 0, root);
  await storeEvidence(bytes, snapshot.storageReference);
  await workerCall("metadata", {
    runId,
    leaseToken: job.run.leaseToken,
    sourceId: job.sources[0].id,
    snapshotId: snapshot.id,
    sha256: evidenceDigest(bytes),
    size: bytes.length,
    recordCount: data.records.length,
    coverage: data.coverage,
    collectedAt: data.collectedAt,
  });
  await command("test_expire_session", hash, {});
  await c.close();
  await command("investigation.test.expireLease", "", { runId });
  await expect(
    workerCall("state", { runId, leaseToken: job.run.leaseToken }),
  ).rejects.toThrow();
  expect(await processNextJob()).toBe(true);
  const current = await browser.newContext();
  try {
    await login(current);
    const live = await connection(current);
    try {
      expect(
        live.rows<InvestigationRun>("run", scope.incidentId)[0].status,
      ).toBe("Complete");
    } finally {
      live.conn.disconnect();
    }
    const next = await newIncident(current);
    const queued = await post(current.request, "investigation", {
      ...next,
      action: "start",
      connectorIds: ["identity"],
      operationId: randomUUID(),
    });
    const nextId = (await queued.json()).runId;
    const claim = await workerCall<WorkerJob>("claim");
    expect(claim.run.id).toBe(nextId);
    const sam = await browser.newContext();
    try {
      await login(sam, "sam");
      await command("member_role", await sessionHash(sam), {
        organizationId: "acme",
        userId: "maya",
        role: "operations",
      });
      await expect(processJob(claim)).rejects.toThrow();
      await command("test_restore_memberships", "", {});
      await expect(
        workerCall("state", {
          runId: nextId,
          leaseToken: claim.run.leaseToken,
        }),
      ).rejects.toThrow();
    } finally {
      await sam.close();
    }
  } finally {
    await current.close();
  }
});

test("fails on conflicting immutable source bytes and retries with fresh authorized work without losing evidence", async ({
  context,
}) => {
  await login(context);
  const scope = await newIncident(context);
  const r = await post(context.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["network"],
    operationId: randomUUID(),
  });
  const runId = (await r.json()).runId;
  const job = await workerCall<WorkerJob>("claim");
  expect(job.run.id).toBe(runId);
  const reserved = await workerCall<{ storageReference: string }>("reserve", {
    runId,
    leaseToken: job.run.leaseToken,
    sourceId: job.sources[0].id,
    role: "baseline",
  });
  const file = resolve(
    process.env.EVIDENCE_STORAGE_DIR!,
    reserved.storageReference,
  );
  await writeFile(file, "Conflicting synthetic original", {
    flag: "wx",
    mode: 0o600,
  });
  await expect(processJob(job)).rejects.toThrow("integrity");
  expect((await readFile(file)).toString()).toBe(
    "Conflicting synthetic original",
  );
  const retry = await post(context.request, "investigation", {
    ...scope,
    action: "start",
    connectorIds: ["network"],
    operationId: randomUUID(),
  });
  expect(retry.status()).toBe(200);
  expect(await processNextJob()).toBe(true);
  const live = await connection(context);
  try {
    const runs = live.rows<InvestigationRun>("run", scope.incidentId);
    expect(runs.map((r) => r.status).sort()).toEqual(["Complete", "Failed"]);
    const completed = runs.find((r) => r.status === "Complete")!;
    const read = await post(context.request, "investigation", {
      ...scope,
      action: "read",
      kind: "differences",
      runId: completed.id,
      sourceId: JSON.parse(completed.sourceIds)[0],
    });
    const result = await read.json();
    expect(
      (result.rows as Change[]).filter((r) => r.kind === "added"),
    ).toHaveLength(1);
    const wrong = await newIncident(context);
    expect(
      (
        await post(context.request, "investigation", {
          ...wrong,
          action: "read",
          kind: "observations",
          runId: completed.id,
        })
      ).status(),
    ).toBe(404);
  } finally {
    live.conn.disconnect();
  }
});
