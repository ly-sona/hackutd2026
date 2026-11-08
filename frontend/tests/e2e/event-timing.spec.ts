import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbConnection } from "../../src/module_bindings";
import type { IncidentEvent } from "../../lib/incident-model";
import { incidentTime } from "../../lib/incident-model";
import { command } from "../../lib/server/gateway";

test("demo events have varied delays up to 30 minutes with preserved originals and consistent timeline times", async ({ page, context }) => {
  const directory = resolve(process.cwd(), "../.spacetime/e2e");
  const accounts = JSON.parse(readFileSync(resolve(directory, "demo-accounts.json"), "utf8")) as
    { id: string; login: string; password: string }[];
  const account = accounts.find((item) => item.id === "maya")!;
  const response = await context.request.post("/api/auth/login", {
    data: { login: account.login, password: account.password },
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  expect(response.status()).toBe(200);
  const conn = await new Promise<DbConnection>((resolve, reject) => DbConnection.builder()
    .withUri("http://127.0.0.1:3101").withDatabaseName("aegis-e2e")
    .onConnect(resolve).onConnectError((_, error) => reject(error)).build());
  try {
    expect((await context.request.post("/api/connection/bind", {
      data: { identity: conn.identity!.toHexString() },
      headers: { Origin: "http://127.0.0.1:3100" },
    })).status()).toBe(200);
    await new Promise<void>((resolve, reject) => conn.subscriptionBuilder()
      .onApplied(() => resolve()).onError(reject).subscribe("SELECT * FROM visible_incident_data"));
    const events = () => [...conn.db.visibleIncidentData.iter()]
      .filter((row) => row.kind === "event").map((row) => JSON.parse(row.body) as IncidentEvent);
    const corrected = events().filter((event) => event.timingCorrectionId);
    expect(corrected.length).toBeGreaterThanOrEqual(26);
    const delays = corrected.map((event) => (Number(event.createdAt) - Number(event.observedAt)) / 60_000);
    expect([...new Set(delays)].sort((a, b) => a - b)).toEqual([0, 3, 7, 12, 18, 24, 30]);
    for (const event of corrected) expect(event.originalObservedAt).toBe(event.originalRecordedAt);

    // Reseeding must keep the same correction IDs and timestamps.
    process.env.SPACETIMEDB_SERVER_TOKEN = JSON.parse(readFileSync(resolve(directory, "gateway.json"), "utf8")).token;
    process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
    process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
    const before = events();
    await command("coord.seed", "", {});
    expect(events()).toEqual(before);
    const example = corrected.find((event) => event.findingId === "IR-2041:UI-01")!;
    expect(example).toBeTruthy();
    await page.goto(`/org/acme/incidents/IR-2041/timeline?event=${example.id}`);
    const detail = page.getByTestId("event-detail");
    await expect(detail.getByRole("heading", { name: example.title, exact: true })).toBeVisible();
    const short = (value: string) => incidentTime(value, false).replace(" CST", "").replace(" CDT", "");
    await expect(detail.locator("time").nth(0)).toHaveText(short(example.observedAt));
    await expect(detail.locator("time").nth(1)).toHaveText(short(example.createdAt));
    await detail.locator("summary").filter({ hasText: "Sources & audit details" }).click();
    await expect(detail).toContainText(`Synthetic fixture correction #${example.timingCorrectionId}`);
    await expect(detail).toContainText(`Original observation: ${incidentTime(example.originalObservedAt!)}`);
  } finally {
    conn.disconnect();
  }
});
