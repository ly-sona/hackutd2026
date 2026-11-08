import { openGraphTools } from "./presentation-helpers";
import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";
import { command } from "../../lib/server/gateway";
import type {
  ScopeEntity,
  ScopeAssessment,
  ScopeRelationship,
  ScopeSummary,
} from "../../../shared/scope";
import type { IncidentEvent, Evidence } from "../../lib/incident-model";
const origin = "http://127.0.0.1:3100",
  root = resolve(process.cwd(), ".."),
  base = "/org/acme/incidents/IR-2041",
  scope = { organizationId: "acme", incidentId: "IR-2041" };
function configure() {
  const c = JSON.parse(
    readFileSync(resolve(root, ".spacetime/e2e/gateway.json"), "utf8"),
  );
  process.env.SPACETIMEDB_SERVER_TOKEN = c.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}
async function login(c: BrowserContext, id: string) {
  const a = (
    JSON.parse(
      readFileSync(resolve(root, ".spacetime/e2e/demo-accounts.json"), "utf8"),
    ) as { id: string; login: string; password: string }[]
  ).find((a) => a.id === id)!;
  expect(
    (
      await c.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { login: a.login, password: a.password },
      })
    ).status(),
  ).toBe(200);
}
const post = (r: APIRequestContext, action: string, data: object) =>
  r.post("/api/scope", {
    headers: { Origin: origin },
    data: { ...scope, action, ...data },
  });
const read = (
  r: APIRequestContext,
  operation: string,
  data: Record<string, string | number> = {},
) =>
  r.get(
    `/api/scope?${new URLSearchParams({ ...scope, operation, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) })}`,
  );
async function connection(c: BrowserContext) {
  const conn = await new Promise<DbConnection>((resolve, reject) =>
    DbConnection.builder()
      .withUri("http://127.0.0.1:3101")
      .withDatabaseName("aegis-e2e")
      .onConnect(resolve)
      .onConnectError((_, e) => reject(e))
      .build(),
  );
  expect(
    (
      await c.request.post("/api/connection/bind", {
        headers: { Origin: origin },
        data: { identity: conn.identity!.toHexString() },
      })
    ).status(),
  ).toBe(200);
  await new Promise<void>((resolve, reject) =>
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((e) => reject(e))
      .subscribe([
        "SELECT * FROM visible_scope_data",
        "SELECT * FROM visible_incident_data",
      ]),
  );
  return {
    conn,
    rows: <T>(kind: string, incident = "IR-2041") =>
      [...conn.db.visibleScopeData.iter()]
        .filter((r) => r.kind === kind && r.incidentId === incident)
        .map((r) => JSON.parse(r.body) as T),
    events: () =>
      [...conn.db.visibleIncidentData.iter()]
        .filter((r) => r.kind === "event" && r.incidentId === "IR-2041")
        .map((r) => JSON.parse(r.body) as IncidentEvent),
  };
}
const asset = (reference: string, assetType = "Server") => ({
  reference,
  name: `Synthetic asset ${reference}`,
  assetType,
  owner: "Synthetic responder",
  description: "Synthetic test inventory; observed compromise not established.",
  status: "Unassessed",
  justification: "Initial test inventory report.",
  evidenceIds: [],
});
const assessment = (
  entityId: string,
  dimension: string,
  status: string,
  evidenceIds: string[] = [],
) => ({
  entityId,
  dimension,
  status,
  description:
    "Synthetic investigation assessment; dimensions remain independent.",
  justification: "Responder reviewed this specific test observation.",
  evidenceIds,
});
async function artifact(c: BrowserContext, content: string) {
  const res = await c.request.post(
    "/api/incident/evidence?organizationId=acme&incidentId=IR-2041",
    {
      headers: { Origin: origin },
      multipart: {
        file: {
          name: "scope-verification.log",
          mimeType: "text/plain",
          buffer: Buffer.from(content),
        },
        description:
          "Synthetic record-specific verification log for an automated test.",
        source: "Synthetic independent verifier",
        status: "Unverified",
        collectedAt: String(Date.now()),
      },
    },
  );
  expect(res.status()).toBe(200);
  return (await res.json()).evidenceId as string;
}

test.describe("Phase 3 connected scope against real SpacetimeDB", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    configure();
    await command("test_restore_memberships", "", {});
  });
  test.afterAll(async () => {
    await command("test_restore_memberships", "", {});
  });
  test("renders connected entities and real EV-018, browses the 1,240 inventory and opens C-1044 without inventing confirmed impacts", async ({
    context,
    page,
  }) => {
    await login(context, "alex");
    await page.goto(`${base}/scope`);
    await expect(
      page.getByRole("heading", { name: "Scope & evidence", exact: true }),
    ).toBeVisible();
    await openGraphTools(page);
    await expect(page.getByTestId("inventory-record-count")).toHaveText(
      "1,240",
    );
    await expect(page.getByTestId("confirmed-record-count")).toHaveText("0");
    await expect(page.getByTestId("scope-node-EV-018")).toBeVisible();
    expect(await page.locator(".react-flow__node").count()).toBeLessThanOrEqual(
      50,
    );
    expect(await page.locator(".react-flow__edge").count()).toBeGreaterThan(3);
    await openGraphTools(page);
    await page.getByLabel("Find scope entity").selectOption("evidence:EV-018");
    const detail = page.getByTestId("scope-detail");
    await expect(detail.getByRole("heading", { level: 2 })).toHaveText(
      "EV-018-network.log",
    );
    await detail
      .getByRole("button", { name: "Review evidence · EV-018", exact: true })
      .click();
    await expect(page.locator("pre")).toContainText("09:21");
    await expect(page.getByRole("dialog")).toContainText("source and cause");
    await page.keyboard.press("Escape");
    const response = await read(context.request, "records", {
      groupId: "acme:scope:RG-OCTOBER",
      limit: 25,
    });
    expect(response.status()).toBe(200);
    const records = await response.json();
    expect(records.totalInGroup).toBe(1240);
    expect(records.records).toHaveLength(25);
    expect(
      (
        await read(context.request, "records", {
          groupId: "acme:scope:RG-OCTOBER",
          limit: 1240,
        })
      ).status(),
    ).toBe(400);
    await openGraphTools(page);
    await page
      .getByLabel("Find scope entity")
      .selectOption("acme:scope:RG-OCTOBER");
    await detail
      .getByRole("button", { name: "Browse 1,240 records", exact: true })
      .click();
    const browser = page.getByRole("dialog");
    await browser
      .getByRole("textbox", { name: "Search record ID" })
      .fill("C-1044");
    await expect(
      browser.getByRole("button", { name: "C-1044", exact: true }),
    ).toBeVisible();
    await browser.getByRole("button", { name: "C-1044", exact: true }).click();
    await expect(
      detail.getByRole("heading", { name: "C-1044", exact: true }),
    ).toBeVisible();
    await expect(detail.getByTestId("assessment-Exfiltration")).toContainText(
      "Suspected",
    );
    await expect(detail.getByTestId("assessment-Encryption")).toContainText(
      "Unassessed",
    );
    await expect(detail).toContainText("Group: October Customers");
    await expect(page.getByTestId("confirmed-record-count")).toHaveText("0");
  });
  test("creates a valid asset in the UI, records its actor and event, rejects invalid assets and preserves the responsive graph", async ({
    context,
    page,
  }) => {
    await login(context, "alex");
    const live = await connection(context);
    await page.goto(`${base}/scope`);
    await openGraphTools(page);
    await page.getByRole("button", { name: "Add asset", exact: true }).click();
    const form = page.getByRole("dialog");
    const reference = `SCOPE-${Date.now()}`;
    await form.getByLabel("Asset name").fill(reference);
    await form.getByLabel("Asset identifier").fill(reference);
    await form.getByLabel("Asset type").selectOption("Server");
    await form
      .getByLabel("Asset description")
      .fill("Synthetic server for scope integration.");
    await form
      .getByLabel("Assessment justification")
      .fill("Responder added actual inventory metadata.");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        live.rows<ScopeEntity>("entity").some((e) => e.reference === reference),
      )
      .toBe(true);
    await expect(page.getByTestId(`scope-node-${reference}`)).toBeAttached();
    await expect
      .poll(() =>
        live
          .events()
          .some(
            (e) =>
              e.type === "scope" &&
              e.title === `Asset added: ${reference}` &&
              e.actorId === "alex",
          ),
      )
      .toBe(true);
    expect(
      (
        await post(context.request, "asset.create", {
          ...asset("invalid"),
          assetType: "Unknown type",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(context.request, "asset.create", {
          ...asset("unsupported"),
          status: "Confirmed Compromise",
        })
      ).status(),
    ).toBe(400);
    expect(
      (await post(context.request, "asset.create", asset(reference))).status(),
    ).toBe(400);
    const businessRef = `BUSINESS-${Date.now()}`;
    const business = await post(context.request, "asset.create", {
      ...asset(businessRef, "Business service"),
      status: "Suspected Compromise",
    });
    expect(business.status()).toBe(200);
    const businessId = (await business.json()).entityId;
    await expect(page.getByTestId(`scope-node-${businessRef}`)).toBeAttached();
    await openGraphTools(page);
    await page.getByLabel("Find scope entity").selectOption(businessId);
    await expect(
      page.getByTestId("scope-detail").getByTestId("assessment-Compromise"),
    ).toContainText("Suspected Compromise");
    await expect(
      page.getByTestId("scope-detail").getByTestId("assessment-Availability"),
    ).toContainText("Unassessed");
    await page.setViewportSize({ width: 390, height: 844 });
    await openGraphTools(page);
    await page
      .getByLabel("Find scope entity")
      .selectOption(`acme:scope:${reference}`);
    await expect(
      page.getByRole("dialog", { name: "Entity investigation" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    live.conn.disconnect();
  });
  test("validates durable relationships, rejects missing/cross-organization endpoints and duplicate edges", async ({
    context,
  }) => {
    await login(context, "alex");
    const live = await connection(context),
      n = Date.now();
    const account = await post(
        context.request,
        "asset.create",
        asset(`ACC-${n}`, "Administrator account"),
      ),
      system = await post(
        context.request,
        "asset.create",
        asset(`DB-${n}`, "Database"),
      );
    expect(account.status()).toBe(200);
    expect(system.status()).toBe(200);
    const sourceId = (await account.json()).entityId,
      targetId = (await system.json()).entityId;
    const edge = {
      sourceId,
      targetId,
      type: "CAN_ACCESS",
      status: "Unverified",
      justification:
        "Synthetic inventory capability; actual access unconfirmed.",
      evidenceIds: [],
    };
    const created = await post(context.request, "relationship", edge);
    expect(created.status()).toBe(200);
    const relationshipId = (await created.json()).relationshipId;
    await expect
      .poll(() =>
        live
          .rows<ScopeRelationship>("relationship")
          .some(
            (r) =>
              r.id === relationshipId &&
              r.sourceId === sourceId &&
              r.targetId === targetId,
          ),
      )
      .toBe(true);
    expect((await post(context.request, "relationship", edge)).status()).toBe(
      400,
    );
    expect(
      (
        await post(context.request, "relationship", {
          ...edge,
          targetId: "acme:scope:MISSING",
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(context.request, "relationship", {
          ...edge,
          targetId: "northstar:scope:DB",
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await post(context.request, "relationship", {
          ...edge,
          type: "CONTAINS",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post(context.request, "relationship", {
          ...edge,
          sourceId: targetId,
          targetId: sourceId,
          type: "RELATED_TO",
          status: "Confirmed",
        })
      ).status(),
    ).toBe(400);
    live.conn.disconnect();
  });
  test("confirms only a specific record and impact using real evidence, updates another session and preserves correction history", async ({
    browser,
  }) => {
    const a = await browser.newContext(),
      b = await browser.newContext();
    await login(a, "alex");
    await login(b, "maya");
    const live = await connection(a),
      id = "acme:record:C-2240";
    const page = await b.newPage();
    await page.goto(`${base}/scope?entity=${encodeURIComponent(id)}`);
    await openGraphTools(page);
    await expect(
      page
        .getByTestId("scope-detail")
        .getByRole("heading", { name: "C-2240", exact: true }),
    ).toBeVisible();
    try {
      expect(
        (
          await post(
            a.request,
            "assessment",
            assessment(id, "Encryption", "Confirmed"),
          )
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(
            a.request,
            "assessment",
            assessment(id, "Encryption", "Confirmed", ["EV-024"]),
          )
        ).status(),
      ).toBe(400);
      const ev = await artifact(
        a,
        "SYNTHETIC TEST VERIFICATION\nrecord=C-2240 check=encryption observed=encrypted\nThis artifact supports this one synthetic record and dimension only.\n",
      );
      expect(
        (
          await post(
            a.request,
            "assessment",
            assessment(id, "Exfiltration", "Suspected", ["EV-021"]),
          )
        ).status(),
      ).toBe(200);
      expect(
        (
          await post(a.request, "assessment", {
            ...assessment(id, "Encryption", "Confirmed", [ev]),
            description:
              "Independent synthetic check verified C-2240 encryption only.",
            justification:
              "Reviewed the record-specific verification log; exfiltration remains suspected.",
          })
        ).status(),
      ).toBe(200);
      await expect(
        page.getByTestId("scope-detail").getByTestId("assessment-Encryption"),
      ).toContainText("Confirmed");
      await expect(
        page.getByTestId("scope-detail").getByTestId("assessment-Exfiltration"),
      ).toContainText("Suspected");
      await expect(page.getByTestId("confirmed-record-count")).toHaveText("1");
      await expect(page.getByTestId("potential-record-count")).toHaveText(
        "1,239",
      );
      await expect
        .poll(
          () =>
            live
              .rows<ScopeAssessment>("assessment")
              .find((s) => s.entityId === id && s.dimension === "Encryption")
              ?.verifiedBy,
        )
        .toBe("alex");
      expect(
        (
          await post(a.request, "assessment", {
            ...assessment(id, "Encryption", "Ruled Out", [ev]),
            description:
              "Correction: the synthetic verification result was challenged.",
            justification:
              "Preserve the earlier confirmed assessment and explicitly correct its interpretation.",
          })
        ).status(),
      ).toBe(200);
      await expect
        .poll(() =>
          live
            .events()
            .some(
              (e) =>
                e.type === "scope" &&
                JSON.parse(e.newValue).scopeEntityId === id &&
                e.previousValue &&
                JSON.parse(e.previousValue).status === "Confirmed",
            ),
        )
        .toBe(true);
      const event = live
        .events()
        .find(
          (e) =>
            e.type === "scope" && JSON.parse(e.newValue).scopeEntityId === id,
        )!;
      await page.goto(`${base}/timeline?event=${event.id}`);
      await page
        .getByLabel("Filter timeline events")
        .selectOption("Scope Changes");
      await expect(page.getByTestId("event-detail")).toContainText(
        "Open scope entity",
      );
    } finally {
      for (const dimension of ["Encryption", "Exfiltration"])
        await post(a.request, "assessment", {
          ...assessment(id, dimension, "Unassessed"),
          justification:
            "End of isolated synthetic integration test; return to an unassessed current state.",
        });
      live.conn.disconnect();
      await a.close();
      await b.close();
    }
  });
  test("filters and expands the graph, links Phase 2 evidence and creates a connected follow-up finding", async ({
    context,
    page,
  }) => {
    await login(context, "alex");
    const live = await connection(context);
    await page.goto(`${base}/scope`);
    await expect(page.getByTestId("scope-node-A-09")).toBeVisible();
    const initial = await page.locator(".react-flow__node").count();
    await openGraphTools(page);
    await page.getByLabel("Find scope entity").selectOption("acme:scope:A-09");
    await page
      .getByRole("button", { name: "Expand related", exact: true })
      .click();
    await expect
      .poll(() => page.locator(".react-flow__node").count())
      .toBeGreaterThan(initial);
    const expanded = await page.locator(".react-flow__node").count();
    await page
      .getByRole("button", { name: "Collapse related", exact: true })
      .click();
    await expect
      .poll(() => page.locator(".react-flow__node").count())
      .toBeLessThan(expanded);
    await expect(
      page.getByTestId("scope-node-SYS-CUSTOMER-DB"),
    ).not.toBeAttached();
    await page
      .getByRole("button", { name: "Reset focus", exact: true })
      .click();
    await page.getByRole("button", { name: "Filter", exact: true }).click();
    await page
      .getByLabel("Filter entity type", { exact: true })
      .selectOption("Account");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.getByTestId("scope-node-A-09")).toBeVisible();
    expect(
      await page
        .locator(".react-flow__node [data-entity-kind]")
        .evaluateAll((nodes) =>
          nodes.every(
            (node) => node.getAttribute("data-entity-kind") === "Account",
          ),
        ),
    ).toBe(true);
    await expect(
      page.getByTestId("scope-node-SYS-CUSTOMER-DB"),
    ).not.toBeAttached();
    await page
      .getByRole("button", { name: "Reset focus", exact: true })
      .click();
    await openGraphTools(page);
    await page
      .getByLabel("Find scope entity")
      .selectOption("acme:scope:SYS-CUSTOMER-DB");
    await page
      .getByTestId("scope-detail")
      .getByRole("button", { name: /Open full investigation/ })
      .click();
    const detail = page.getByRole("dialog").first();
    await detail
      .getByRole("button", { name: "Link evidence", exact: true })
      .click();
    const link = page.getByRole("dialog").last();
    await link.getByLabel("Existing evidence").selectOption("EV-018");
    await link
      .getByLabel("Evidence annotation", { exact: true })
      .fill(
        "09:21 traffic observed after the isolation report; not proof of origin.",
      );
    await link.getByLabel("Relevant literal excerpt (optional)").fill("09:21");
    await link.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        live
          .events()
          .some((e) => e.title === "Scope evidence linked: Customer Database"),
      )
      .toBe(true);
    await detail
      .getByRole("button", { name: "Add finding", exact: true })
      .click();
    const form = page.getByRole("dialog").last(),
      title = `Scope follow-up ${Date.now()}`;
    await form.getByLabel("Finding title").fill(title);
    await form
      .getByLabel("Description / what was observed")
      .fill("Investigate the traffic source; no verified containment claimed.");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() =>
        live
          .rows<ScopeEntity>("entity")
          .some((e) => e.kind === "Finding" && e.name === title),
      )
      .toBe(true);
    const finding = live
      .rows<ScopeEntity>("entity")
      .find((e) => e.name === title)!;
    expect(
      live
        .rows<ScopeRelationship>("relationship")
        .some(
          (r) =>
            r.sourceId === "acme:scope:SYS-CUSTOMER-DB" &&
            r.targetId === finding.id,
        ),
    ).toBe(true);
    live.conn.disconnect();
  });
  test("enforces role, tenant, record and private subscription boundaries, including live revocation", async ({
    browser,
  }) => {
    const admin = await browser.newContext(),
      legal = await browser.newContext(),
      operations = await browser.newContext(),
      alex = await browser.newContext(),
      anonymous = await browser.newContext();
    for (const [c, id] of [
      [admin, "sam"],
      [legal, "priya"],
      [operations, "jordan"],
      [alex, "alex"],
    ] as const)
      await login(c, id);
    for (const c of [admin, legal, operations])
      expect(
        (await post(c.request, "asset.create", asset("FORBIDDEN"))).status(),
      ).toBe(403);
    expect(
      (
        await read(admin.request, "entity", { entityId: "acme:record:C-1044" })
      ).status(),
    ).toBe(403);
    expect(
      (
        await read(legal.request, "entity", { entityId: "acme:record:C-1044" })
      ).status(),
    ).toBe(200);
    expect(
      (
        await read(operations.request, "records", {
          groupId: "acme:scope:RG-OCTOBER",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await read(anonymous.request, "entity", {
          entityId: "acme:record:C-1044",
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await read(alex.request, "entity", {
          organizationId: "northstar",
          entityId: "acme:record:C-1044",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await read(alex.request, "entity", {
          incidentId: "IR-2043",
          entityId: "acme:record:C-1044",
        })
      ).status(),
    ).toBe(404);
    for (const name of [
      "scope_entities",
      "scope_records",
      "scope_relationships",
      "scope_assessments",
      "scope_evidence_links",
    ])
      expect(
        (
          await anonymous.request.post(
            "http://127.0.0.1:3101/v1/database/aegis-e2e/sql",
            {
              data: `SELECT * FROM ${name}`,
              headers: { "Content-Type": "text/plain" },
            },
          )
        ).ok(),
      ).toBe(false);
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
        unbound.procedures.scopeRead({
          sessionHash: "forged",
          payload: JSON.stringify({
            ...scope,
            operation: "entity",
            entityId: "acme:record:C-1044",
          }),
        }),
      ).rejects.toContain("Trusted server required");
      await new Promise<void>((resolve, reject) =>
        unbound
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError((e) => reject(e))
          .subscribe("SELECT * FROM visible_scope_data"),
      );
      expect([...unbound.db.visibleScopeData.iter()]).toHaveLength(0);
    } finally {
      unbound.disconnect();
    }
    const live = await connection(alex),
      page = await alex.newPage();
    await page.goto(`${base}/scope`);
    await expect(page.getByTestId("scope-graph")).toBeVisible();
    expect(
      (
        await admin.request.post("/api/members/revoke", {
          headers: { Origin: origin },
          data: { organizationId: "acme", userId: "alex" },
        })
      ).status(),
    ).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Access revoked", exact: true }),
    ).toBeVisible();
    await expect.poll(() => live.rows("entity").length).toBe(0);
    expect(
      (
        await read(alex.request, "entity", { entityId: "acme:record:C-1044" })
      ).status(),
    ).toBe(403);
    expect((await alex.request.get("/api/evidence/EV-018")).status()).toBe(403);
    await command("test_restore_memberships", "", {});
    live.conn.disconnect();
    for (const c of [admin, legal, operations, alex, anonymous])
      await c.close();
  });
  test("preserves incident-specific assessments, fixture relationships and originals through idempotent scope seeding", async ({
    context,
  }) => {
    await login(context, "maya");
    const live = await connection(context),
      ref = `PRESERVE-${Date.now()}`,
      created = await post(context.request, "asset.create", asset(ref));
    expect(created.status()).toBe(200);
    const entityId = (await created.json()).entityId;
    expect(
      (
        await post(
          context.request,
          "assessment",
          assessment(entityId, "Compromise", "Suspected Compromise"),
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(context.request, "associate", {
          entityId,
          incidentId: "IR-2042",
          justification:
            "Reuse asset inventory only, with an independent incident assessment.",
        })
      ).status(),
    ).toBe(200);
    await expect
      .poll(() =>
        live
          .rows<ScopeEntity>("entity", "IR-2042")
          .some((e) => e.id === entityId),
      )
      .toBe(true);
    expect(
      live
        .rows<ScopeAssessment>("assessment", "IR-2042")
        .some((a) => a.entityId === entityId),
    ).toBe(false);
    const before = [...live.conn.db.visibleScopeData.iter()]
      .map((r) => r.id)
      .sort();
    expect(await command("scope.seed", "", {})).toMatchObject({
      seeded: false,
    });
    expect(await command("scope.seed", "", {})).toMatchObject({
      seeded: false,
    });
    expect(
      [...live.conn.db.visibleScopeData.iter()].map((r) => r.id).sort(),
    ).toEqual(before);
    expect(
      live.rows<ScopeEntity>("entity").some((e) => e.reference === ref),
    ).toBe(true);
    const entityIds = new Set(
      live.rows<ScopeEntity>("entity").map((e) => e.id),
    );
    expect(
      live
        .rows<ScopeRelationship>("relationship")
        .every((r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId)),
    ).toBe(true);
    const ev = [...live.conn.db.visibleIncidentData.iter()]
      .filter((r) => r.kind === "evidence")
      .map((r) => JSON.parse(r.body) as Evidence)
      .find((e) => e.id === "EV-018")!;
    const original = await context.request.get("/api/evidence/EV-018");
    expect(
      createHash("sha256")
        .update(await original.body())
        .digest("hex"),
    ).toBe(ev.sha256);
    const summary = live.rows<ScopeSummary>("summary")[0];
    expect(summary.totalRecords).toBe(1240);
    expect(summary.individuallyConfirmedRecords).toBe(0);
    live.conn.disconnect();
  });
});
