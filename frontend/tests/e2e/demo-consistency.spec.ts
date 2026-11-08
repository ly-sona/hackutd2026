import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbConnection } from "../../src/module_bindings";
import { command } from "../../lib/server/gateway";
import type { IncidentEvent, Finding, Evidence } from "../../lib/incident-model";
import type { Conversation, Message, Task, Page } from "../../lib/coordination";
import type { ScopeEntity } from "../../lib/scope";

test("keeps demo chronology, references, counts and incident context consistent across all pages", async ({ page, context }) => {
  test.setTimeout(90_000);
  const directory = resolve(process.cwd(), "../.spacetime/e2e");
  const accounts = JSON.parse(readFileSync(resolve(directory, "demo-accounts.json"), "utf8")) as
    { id: string; login: string; password: string }[];
  const account = accounts.find((item) => item.id === "maya")!;
  expect((await context.request.post("/api/auth/login", {
    data: { login: account.login, password: account.password }, headers: { Origin: "http://127.0.0.1:3100" },
  })).status()).toBe(200);
  const conn = await new Promise<DbConnection>((resolve, reject) => DbConnection.builder()
    .withUri("http://127.0.0.1:3101").withDatabaseName("aegis-e2e").onConnect(resolve).onConnectError((_, e) => reject(e)).build());
  try {
    expect((await context.request.post("/api/connection/bind", {
      data: { identity: conn.identity!.toHexString() }, headers: { Origin: "http://127.0.0.1:3100" },
    })).status()).toBe(200);
    await new Promise<void>((resolve, reject) => conn.subscriptionBuilder().onApplied(() => resolve()).onError(reject)
      .subscribe(["SELECT * FROM visible_incident_data", "SELECT * FROM visible_scope_data", "SELECT * FROM visible_coordination_data"]));
    const read = <T,>(rows: Iterable<{ kind: string; body: string; incidentId: string }>, kind: string, incidentId: string): T[] =>
      [...rows].filter((row) => row.kind === kind && row.incidentId === incidentId).map((row) => JSON.parse(row.body) as T);
    for (const incidentId of ["IR-2041", "IR-2042", "IR-2043"]) {
      const incident = <T,>(kind: string) => read<T>(conn.db.visibleIncidentData.iter(), kind, incidentId);
      const coordination = <T,>(kind: string) => read<T>(conn.db.visibleCoordinationData.iter(), kind, incidentId);
      const events = incident<IncidentEvent>("event"), findings = incident<Finding>("finding"), evidence = incident<Evidence>("evidence");
      for (const event of events.filter((event) => event.timingCorrectionId)) {
        const delay = Number(event.createdAt) - Number(event.observedAt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(30 * 60_000);
        expect(Number(event.createdAt)).toBeLessThanOrEqual(Date.now());
        if (event.type === "finding") {
          const finding = findings.find((item) => item.id === event.findingId)!;
          expect(event.observedAt).toBe(finding.observedAt);
          expect(event.createdAt).toBe(finding.createdAt);
        }
        if (event.type === "evidence") {
          const original = evidence.find((item) => `Evidence attached: ${item.id}` === event.title)!;
          expect(event.observedAt).toBe(original.collectedAt);
          expect(event.createdAt).toBe(original.uploadedAt);
          const findingEvent = events.find((item) => item.type === "finding" && item.findingId === event.findingId);
          if (findingEvent) expect(Number(event.createdAt)).toBeGreaterThanOrEqual(Number(findingEvent.createdAt));
        }
      }
      const conversations = coordination<Conversation & { createdAt: string }>("conversation");
      const messages = coordination<Message>("message");
      for (const message of messages) {
        const conversation = conversations.find((item) => item.id === message.conversationId)!;
        expect(Number(message.createdAt)).toBeGreaterThanOrEqual(Number(conversation.createdAt));
        if (messages.some((item) => item.correctionOf === message.id)) continue;
        expect(message.content).not.toContain("09:15");
        if (incidentId !== "IR-2041") expect(message.content).not.toMatch(/October group|reported isolation time|Support coordination/);
      }
      const tasks = coordination<Task>("task"), pages = coordination<Page>("page");
      for (const task of tasks.filter((item) => /^acme:IR-204[123]:T-\d+$/.test(item.id))) expect(Number(task.dueAt)).toBeGreaterThanOrEqual(Number(task.createdAt));
      for (const alert of pages.filter((item) => item.id.startsWith("acme:seed:page-"))) {
        const task = tasks.find((item) => item.id === alert.taskId)!;
        expect(Number(alert.createdAt)).toBeGreaterThanOrEqual(Number(task.createdAt));
        if (alert.acknowledgedAt !== "0") expect(Number(alert.acknowledgedAt)).toBeGreaterThanOrEqual(Number(alert.createdAt));
        if (alert.parentPageId) expect(Number(alert.createdAt)).toBeGreaterThanOrEqual(Number(pages.find((item) => item.id === alert.parentPageId)!.escalatedAt));
      }
      const base = `/org/acme/incidents/${incidentId}`;
      for (const [section, title] of [["overview", ""], ["scope", "Scope & evidence"], ["operations", "Operations"], ["team", "Team"], ["timeline", "Timeline"]]) {
        await page.goto(`${base}/${section}`);
        await expect(page.getByRole("navigation", { name: "Incident navigation" })).toBeVisible();
        if (title) await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
        if (section === "overview") {
          const count = coordination<{ id: string }>("responder").length;
          await expect(page.getByText("Responders", { exact: true }).locator("..").locator("p").first()).toHaveText(String(count));
        }
        if (section === "operations") {
          await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
          if (incidentId !== "IR-2041") {
            await expect(page.getByText("No requests recorded.")).toBeVisible();
            await expect(page.getByText("Recovery hardware", { exact: true })).toHaveCount(0);
          } else {
            await expect(page.getByRole("button", { name: /Recovery hardware/ })).toBeVisible();
            await expect(page.getByText(/EV-011|Blocked by compromised SSO/)).toHaveCount(0);
          }
        }
      }
      if (incidentId === "IR-2043") {
        const entities = read<ScopeEntity>(conn.db.visibleScopeData.iter(), "entity", incidentId);
        expect(entities.some((item) => item.reference === "SYS-CUSTOMER-DB")).toBe(true);
        expect(entities.some((item) => item.kind === "Record" || item.kind === "Dataset")).toBe(false);
      }
    }
    // Reapplying the additive migrations must not duplicate corrections or messages.
    process.env.SPACETIMEDB_SERVER_TOKEN = JSON.parse(readFileSync(resolve(directory, "gateway.json"), "utf8")).token;
    process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
    process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
    const before = [...conn.db.visibleIncidentData.iter()].filter((row) => row.kind === "event").length;
    const messagesBefore = [...conn.db.visibleCoordinationData.iter()].filter((row) => row.kind === "message").length;
    await command("coord.seed", "", {});
    expect([...conn.db.visibleIncidentData.iter()].filter((row) => row.kind === "event")).toHaveLength(before);
    expect([...conn.db.visibleCoordinationData.iter()].filter((row) => row.kind === "message")).toHaveLength(messagesBefore);
  } finally { conn.disconnect(); }
});
