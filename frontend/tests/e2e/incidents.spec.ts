import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DbConnection } from "../../src/module_bindings";
import { command } from "../../lib/server/gateway";
import { tokenHash } from "../../lib/server/password";
import type {
  Finding,
  Incident,
  IncidentEvent,
  Evidence,
} from "../../lib/incident-model";
const origin = "http://127.0.0.1:3100",
  base = "/org/acme/incidents/IR-2041",
  scope = { organizationId: "acme", incidentId: "IR-2041" };
const root = resolve(process.cwd(), "..");
function configure() {
  const c = JSON.parse(
    readFileSync(resolve(root, ".spacetime/e2e/gateway.json"), "utf8"),
  );
  process.env.SPACETIMEDB_SERVER_TOKEN = c.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}
const post = (request: APIRequestContext, path: string, data: object) =>
  request.post(`/api/incident/${path}`, { data, headers: { Origin: origin } });
async function login(context: BrowserContext, id: string) {
  const accounts = JSON.parse(
    readFileSync(resolve(root, ".spacetime/e2e/demo-accounts.json"), "utf8"),
  ) as { id: string; login: string; password: string }[];
  const a = accounts.find((a) => a.id === id)!;
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { login: a.login, password: a.password },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200);
}
async function dataConnection(context: BrowserContext) {
  const conn = await new Promise<DbConnection>((resolve, reject) =>
    DbConnection.builder()
      .withUri("http://127.0.0.1:3101")
      .withDatabaseName("aegis-e2e")
      .onConnect((c) => resolve(c))
      .onConnectError((_, e) => reject(e))
      .build(),
  );
  expect(
    (
      await context.request.post("/api/connection/bind", {
        data: { identity: conn.identity!.toHexString() },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200);
  await new Promise<void>((resolve, reject) =>
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((e) => reject(e))
      .subscribe(["SELECT * FROM visible_incident_data"]),
  );
  return {
    conn,
    rows: <T>(kind: string, inc = "IR-2041") =>
      Array.from(conn.db.visibleIncidentData.iter())
        .filter((r) => r.kind === kind && r.incidentId === inc)
        .map((r) => JSON.parse(r.body) as T),
  };
}
const finding = (title: string) => ({
  ...scope,
  title,
  description: "Synthetic observation, outcome unverified.",
  category: "Observation",
  priority: "High",
  status: "Suspected",
  observedAt: Date.now(),
  relatedSystem: "Customer Database",
  assignedTo: "alex",
  evidenceIds: [],
  reason: "",
});
async function hash(context: BrowserContext) {
  return tokenHash(
    (await context.cookies()).find((c) => c.name === "aegis_session")!.value,
  );
}

test.describe("Phase 2 real incident documentation", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    configure();
    await command("test_restore_memberships", "", {});
  });
  test.afterAll(async () => {
    await command("test_restore_memberships", "", {});
  });
  test("creates an incident in the UI with memberships and immutable history, validates input and enforces update permissions", async ({
    browser,
  }) => {
    const c = await browser.newContext();
    await login(c, "maya");
    const page = await c.newPage();
    await page.goto(`${base}/overview`);
    await page
      .getByRole("button", {
        name: "Incident details and actions",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "New incident", exact: true })
      .click();
    const form = page.getByRole("dialog");
    const title = `Synthetic incident ${Date.now()}`;
    await form.getByLabel("Incident title").fill(title);
    await form
      .getByLabel("Description", { exact: true })
      .fill("Initial synthetic report, progressive documentation.");
    await form.getByLabel("Incident Commander (optional)").selectOption("maya");
    await form.getByLabel("Alex Rivera", { exact: true }).check();
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const incidentId = /incidents\/(IR-\d+)/.exec(page.url())![1];
    await page.setViewportSize({ width: 390, height: 844 });
    const selector = await page
      .getByLabel("Select incident", { exact: true })
      .boundingBox();
    const search = await page
      .getByRole("button", { name: "Search workspace", exact: true })
      .boundingBox();
    expect(selector!.x + selector!.width).toBeLessThanOrEqual(search!.x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    const live = await dataConnection(c);
    await expect
      .poll(() =>
        live
          .rows<IncidentEvent>("event", incidentId)
          .some((e) => e.type === "incident"),
      )
      .toBe(true);
    const update = {
      organizationId: "acme",
      incidentId,
      description: "Updated synthetic context",
      severity: "Critical",
      status: "Contained",
      commanderId: "maya",
      reason: "Independent verification documented for this test scenario.",
    };
    expect((await post(c.request, "update", update)).status()).toBe(200);
    await expect
      .poll(() => live.rows<Incident>("incident", incidentId)[0]?.status)
      .toBe("Contained");
    const events = live.rows<IncidentEvent>("event", incidentId);
    expect(
      events.some(
        (e) => e.type === "incident" && e.title === "Incident opened",
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "status" &&
          e.previousValue === "Open" &&
          e.newValue === "Contained",
      ),
    ).toBe(true);
    expect(
      events.some(
        (e) => e.title === "severity changed" && e.newValue === "Critical",
      ),
    ).toBe(true);
    const analyst = await browser.newContext();
    await login(analyst, "alex");
    expect((await post(analyst.request, "update", update)).status()).toBe(403);
    expect(
      (
        await post(c.request, "create", {
          organizationId: "acme",
          title: "bad",
          description: "x",
          severity: "INVALID",
          type: "Ransomware",
          discoveredAt: Date.now(),
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(c.request, "create", {
          ...update,
          organizationId: "northstar",
          title: "cross organization",
          type: "Other",
          discoveredAt: Date.now(),
        })
      ).status(),
    ).toBe(403);
    live.conn.disconnect();
    await analyst.close();
    await c.close();
  });
  test("propagates a new finding to a second session, keeps unread independent of investigation, and preserves visit cutoffs", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    const b = await alex.newPage();
    await b.goto(`${base}/overview`);
    await expect(
      b.getByRole("heading", { name: "Ransomware response", exact: true }),
    ).toBeVisible();
    const visitId = `visit-test-${Date.now()}`;
    const initialVisit = await post(alex.request, "visit", {
      ...scope,
      visitId,
    });
    const cutoff = (await initialVisit.json()).cutoff;
    const title = `Live observed finding ${Date.now()}`;
    const a = await maya.newPage();
    await a.goto(`${base}/overview`);
    await a.getByRole("button", { name: "Add finding", exact: true }).click();
    const dialog = a.getByRole("dialog");
    await dialog.getByLabel("Finding title").fill(title);
    await dialog
      .getByLabel("Description / what was observed")
      .fill("Synthetic bounded claim.");
    await dialog.getByLabel("Investigation status").selectOption("Suspected");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const row = b.getByRole("button").filter({ hasText: title }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("New");
    await expect(row).toContainText("Unresolved");
    await row.click();
    await expect(
      b.getByRole("dialog").getByRole("heading", { name: title }),
    ).toBeVisible();
    await b.keyboard.press("Escape");
    await expect(row).not.toContainText("New");
    await expect(row).toContainText("Unresolved");
    await b.getByRole("link", { name: "Timeline", exact: true }).click();
    await expect(b.getByTestId("timeline-events")).toContainText(title);
    await b.getByLabel("Filter timeline events").selectOption("Findings");
    await expect(b.locator("[data-event-type]")).not.toHaveCount(0);
    expect(
      await b
        .locator("[data-event-type]")
        .evaluateAll((elements) =>
          elements.every(
            (e) => e.getAttribute("data-event-type") === "finding",
          ),
        ),
    ).toBe(true);
    await b
      .getByTestId("timeline-events")
      .getByRole("button")
      .filter({ hasText: title })
      .click();
    await expect(b.getByTestId("event-detail")).toContainText(title);
    const second = await post(alex.request, "visit", { ...scope, visitId });
    expect((await second.json()).cutoff).toBe(cutoff);
    await b.reload();
    await expect
      .poll(async () =>
        Number(
          await b.getByTestId("timeline-events").getByRole("button").count(),
        ),
      )
      .toBeGreaterThan(0);
    await b.getByLabel("Since my last visit").check();
    await expect(b.getByTestId("timeline-events")).toContainText(title);
    await maya.close();
    await alex.close();
  });
  test("requires linked evidence and human justification for confirmation and preserves earlier events through resolution and correction", async ({
    context,
  }) => {
    await login(context, "alex");
    const live = await dataConnection(context);
    const payload = finding(`Verified finding ${Date.now()}`);
    const created = await post(context.request, "findings", payload);
    expect(created.status()).toBe(200);
    const id = (await created.json()).findingId;
    expect(
      (
        await post(context.request, "findings/update", {
          ...payload,
          findingId: id,
          status: "Confirmed",
          reason: "Reviewed",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(context.request, "findings/update", {
          ...payload,
          findingId: id,
          status: "Confirmed",
          evidenceIds: ["EV-024"],
          reason: "Wrong incident",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(context.request, "findings/update", {
          ...payload,
          findingId: id,
          status: "Confirmed",
          evidenceIds: ["EV-018"],
          reason:
            "Verified only that a traffic observation is recorded; origin remains unknown.",
        })
      ).status(),
    ).toBe(200);
    await expect
      .poll(
        () =>
          live.rows<Finding>("finding").find((f) => f.id === id)?.verifiedBy,
      )
      .toBe("alex");
    const original = live
      .rows<IncidentEvent>("event")
      .find((e) => e.findingId === id && e.previousValue === "")!;
    expect(
      (
        await post(context.request, "note", {
          ...scope,
          type: "correction",
          title: "Clarification of observation",
          description:
            "This report confirms traffic only, not successful containment.",
          findingId: id,
          correctsEventId: original.id,
          evidenceIds: ["EV-018"],
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(context.request, "findings/update", {
          ...payload,
          findingId: id,
          status: "Resolved",
          evidenceIds: ["EV-018"],
          reason:
            "Test observation reviewed and addressed, without claiming incident containment.",
        })
      ).status(),
    ).toBe(200);
    await expect
      .poll(
        () => live.rows<Finding>("finding").find((f) => f.id === id)?.status,
      )
      .toBe("Resolved");
    expect(
      live
        .rows<IncidentEvent>("event")
        .some((e) => e.id === original.id && e.status === "Suspected"),
    ).toBe(true);
    expect(
      live
        .rows<IncidentEvent>("event")
        .some((e) => e.correctsEventId === original.id),
    ).toBe(true);
    const operations = await context.browser()!.newContext();
    await login(operations, "jordan");
    expect(
      (
        await post(operations.request, "findings/update", {
          ...payload,
          findingId: id,
        })
      ).status(),
    ).toBe(403);
    await operations.close();
    live.conn.disconnect();
  });
  test("uploads private original evidence, hashes and links it, safely previews text, and rejects unsafe or oversized files", async ({
    context,
    page,
  }) => {
    await login(context, "alex");
    const live = await dataConnection(context);
    const payload = finding(`Evidence finding ${Date.now()}`);
    const id = (await (await post(context.request, "findings", payload)).json())
      .findingId;
    const bytes = Buffer.from(
      "2026-11-07 09:21 synthetic observed traffic\n<script>window.__executed = true</script>\n",
    );
    const res = await context.request.post(
      `/api/incident/evidence?organizationId=acme&incidentId=IR-2041`,
      {
        headers: { Origin: origin },
        multipart: {
          file: {
            name: "synthetic.log",
            mimeType: "text/plain",
            buffer: bytes,
          },
          description: "Synthetic observation log",
          source: "Test responder",
          status: "Unverified",
          findingId: id,
          collectedAt: String(Date.now() - 1000),
          annotation: "Review traffic timestamp",
          excerpt: "09:21",
        },
      },
    );
    expect(res.status()).toBe(200);
    const evidenceId = (await res.json()).evidenceId;
    await expect
      .poll(
        () =>
          live.rows<Evidence>("evidence").find((e) => e.id === evidenceId)
            ?.sha256,
      )
      .toBe(createHash("sha256").update(bytes).digest("hex"));
    const original = await context.request.get(`/api/evidence/${evidenceId}`);
    expect(original.status()).toBe(200);
    expect(await original.body()).toEqual(bytes);
    expect(original.headers()["x-content-type-options"]).toBe("nosniff");
    expect(original.headers()["content-disposition"]).toContain("attachment");
    expect(JSON.stringify(live.rows<Evidence>("evidence"))).not.toContain(
      "storageReference",
    );
    await page.goto(`${base}/overview?finding=${encodeURIComponent(id)}`);
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: "Review evidence · synthetic.log",
        exact: true,
      })
      .click();
    await expect(page.locator("pre")).toContainText(
      "<script>window.__executed = true</script>",
    );
    await expect(page.locator("mark")).toHaveText("09:21");
    expect(await page.evaluate(() => "__executed" in window)).toBe(false);
    for (const file of [
      { name: "attack.html", mimeType: "text/html", buffer: bytes },
      { name: "fake.png", mimeType: "image/png", buffer: bytes },
      {
        name: "too-large.txt",
        mimeType: "text/plain",
        buffer: Buffer.alloc(5242881, 65),
      },
    ]) {
      const denied = await context.request.post(
        "/api/incident/evidence?organizationId=acme&incidentId=IR-2041",
        {
          headers: { Origin: origin },
          multipart: {
            file,
            description: "Rejected",
            source: "test",
            status: "Unverified",
          },
        },
      );
      expect(denied.status()).toBe(400);
    }
    live.conn.disconnect();
  });
  test("denies anonymous, unassigned, cross-organization and revoked evidence access, and never serves ground truth", async ({
    browser,
  }) => {
    const anonymous = await browser.newContext();
    for (const table of [
      "incidents",
      "findings",
      "incident_events",
      "evidence",
      "evidence_links",
      "notifications",
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
    const unbound = await new Promise<DbConnection>((resolve, reject) =>
      DbConnection.builder()
        .withUri("http://127.0.0.1:3101")
        .withDatabaseName("aegis-e2e")
        .onConnect(resolve)
        .onConnectError((_, e) => reject(e))
        .build(),
    );
    try {
      await expect(
        unbound.procedures.evidenceDescriptor({
          sessionHash: "spoofed",
          evidenceId: "EV-018",
        }),
      ).rejects.toContain("Trusted server required");
      await new Promise<void>((resolve, reject) =>
        unbound
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError((e) => reject(e))
          .subscribe("SELECT * FROM visible_incident_data"),
      );
      expect([...unbound.db.visibleIncidentData.iter()]).toHaveLength(0);
    } finally {
      unbound.disconnect();
    }

    expect((await anonymous.request.get("/api/evidence/EV-018")).status()).toBe(
      401,
    );
    const temp = await browser.newContext();
    await login(temp, "taylor");
    expect((await temp.request.get("/api/evidence/EV-018")).status()).toBe(403);
    const jordan = await browser.newContext();
    await login(jordan, "jordan");
    expect((await jordan.request.get("/api/evidence/EV-018")).status()).toBe(
      403,
    );
    const alex = await browser.newContext();
    await login(alex, "alex");
    expect(
      (
        await post(alex.request, "findings", {
          ...finding("cross org"),
          organizationId: "northstar",
        })
      ).status(),
    ).toBe(403);
    expect(
      (await alex.request.get("/api/incident/ground-truth")).status(),
    ).toBe(405);
    expect(
      (
        await alex.request.get("/tests/fixtures/ground-truth.private.ts")
      ).status(),
    ).toBe(404);
    const live = await dataConnection(alex);
    expect(JSON.stringify(live.rows("finding"))).not.toContain(
      "synthetic residual connection",
    );
    expect((await alex.request.get("/api/evidence/EV-018")).status()).toBe(200);
    await command("test_expire_membership", "", { id: "acme:alex" });
    expect((await alex.request.get("/api/evidence/EV-018")).status()).toBe(403);
    await expect.poll(() => live.rows("finding").length).toBe(0);
    await command("test_restore_memberships", "", {});
    live.conn.disconnect();
    for (const c of [anonymous, temp, jordan, alex]) await c.close();
  });
  test("reseeds twice without duplicates or overwriting user records, validates actual artifacts and gates disposable reset", async ({
    context,
  }) => {
    await login(context, "maya");
    const live = await dataConnection(context);
    const title = `Preserved during seed ${Date.now()}`;
    const created = await post(context.request, "findings", finding(title));
    expect(created.status()).toBe(200);
    const id = (await created.json()).findingId;
    await expect
      .poll(() => live.rows<Finding>("finding").some((f) => f.id === id))
      .toBe(true);
    const before = Array.from(live.conn.db.visibleIncidentData.iter())
      .filter((r) =>
        [
          "incident",
          "finding",
          "event",
          "evidence",
          "link",
        ].includes(r.kind),
      )
      .map((r) => r.id)
      .sort();
    for (let n = 0; n < 2; n++)
      await promisify(execFile)(process.execPath, ["scripts/seed.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          AEGIS_E2E: "1",
          NEXT_PUBLIC_SPACETIMEDB_HOST: "http://127.0.0.1:3101",
          NEXT_PUBLIC_SPACETIMEDB_DB_NAME: "aegis-e2e",
          SPACETIMEDB_DATA_DIR: ".spacetime/e2e",
        },
        timeout: 30000,
      });
    expect(
      Array.from(live.conn.db.visibleIncidentData.iter())
        .filter((r) =>
          [
            "incident",
            "finding",
            "event",
            "evidence",
            "link",
          ].includes(r.kind),
        )
        .map((r) => r.id)
        .sort(),
    ).toEqual(before);
    expect(live.rows<Finding>("finding").find((f) => f.id === id)?.title).toBe(
      title,
    );
    for (const inc of ["IR-2041", "IR-2042", "IR-2043"])
      for (const e of live.rows<Evidence>("evidence", inc)) {
        const res = await context.request.get(`/api/evidence/${e.id}`);
        expect(res.status()).toBe(200);
        expect(
          createHash("sha256")
            .update(await res.body())
            .digest("hex"),
        ).toBe(e.sha256);
      }
    expect(
      live
        .rows<Finding>("finding")
        .filter((f) => ["IR-2041:F-01", "IR-2041:F-03"].includes(f.id))
        .every((f) => f.status === "Suspected"),
    ).toBe(true);
    await expect(
      command("incident.reset", "", { incidentId: "IR-2043" }),
    ).rejects.toThrow("Reset requires");
    await expect(
      command("incident.reset", "", {
        incidentId: "IR-2041",
        confirm: "RESET DISPOSABLE DEMO READ STATE",
      }),
    ).rejects.toThrow("Reset requires");
    expect((await post(context.request, "reset", { ...scope })).status()).toBe(
      404,
    );
    expect(
      await command("incident.reset", "", {
        incidentId: "IR-2043",
        confirm: "RESET DISPOSABLE DEMO READ STATE",
      }),
    ).toEqual({ reset: true });
    expect(live.rows<Finding>("finding").some((f) => f.id === id)).toBe(true);
    expect(await hash(context)).toHaveLength(64);
    live.conn.disconnect();
  });
  test("blocks disposable reset in a separately published production-mode module", async () => {
    const credentials = JSON.parse(
      readFileSync(resolve(root, ".spacetime/e2e/gateway.json"), "utf8"),
    );
    const database = "aegis-e2e-production-guard";
    await promisify(execFile)(
      process.env.SPACETIME_CLI ??
        resolve(process.env.HOME!, ".local/bin/spacetime"),
      [
        "--config-path",
        resolve(root, ".spacetime/e2e/cli.toml"),
        "publish",
        "--no-config",
        "--server",
        "http://127.0.0.1:3101",
        "--module-path",
        resolve(root, "backend/spacetimedb"),
        "--delete-data=never",
        "--yes=skip-login",
        database,
      ],
      {
        cwd: root,
        timeout: 30000,
        env: {
          ...process.env,
          AEGIS_GATEWAY_IDENTITY: credentials.identity,
          AEGIS_TEST_MODE: "false",
          AEGIS_DEVELOPMENT_MODE: "false",
        },
      },
    );
    const previous = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME;
    process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = database;
    try {
      await expect(
        command("incident.reset", "", {
          incidentId: "IR-2043",
          confirm: "RESET DISPOSABLE DEMO READ STATE",
        }),
      ).rejects.toThrow("Reset requires");
    } finally {
      process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = previous;
    }
  });
});
