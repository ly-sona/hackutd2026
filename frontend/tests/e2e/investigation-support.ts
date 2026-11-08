import {
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DbConnection } from "../../src/module_bindings";
import { tokenHash } from "../../lib/server/password";
export const root = resolve(process.cwd(), "..");
export const origin = "http://127.0.0.1:3100";
export function configureInvestigationTest() {
  const dir = resolve(root, ".spacetime/e2e");
  process.env.SPACETIMEDB_SERVER_TOKEN = JSON.parse(
    readFileSync(resolve(dir, "gateway.json"), "utf8"),
  ).token;
  process.env.SPACETIMEDB_WORKER_TOKEN = JSON.parse(
    readFileSync(resolve(dir, "investigation-worker.json"), "utf8"),
  ).token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
  process.env.EVIDENCE_STORAGE_DIR = resolve(dir, "evidence");
  process.env.SPACETIMEDB_DATA_DIR = dir;
}
export async function login(context: BrowserContext, id = "maya") {
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
export const post = (request: APIRequestContext, path: string, data: object) =>
  request.post(`/api/${path}`, { data, headers: { Origin: origin } });
export async function sessionHash(context: BrowserContext) {
  return tokenHash(
    (await context.cookies()).find((c) => c.name === "aegis_session")!.value,
  );
}
export async function newIncident(
  context: BrowserContext,
  responders = ["alex", "jordan", "sam", "priya"],
) {
  const r = await post(context.request, "incident/create", {
    organizationId: "acme",
    title: `Addition A ${Date.now()}`,
    description: "Synthetic incident with unknown scope.",
    type: "Ransomware",
    severity: "High",
    discoveredAt: Date.now(),
    commanderId: "maya",
    systems: "",
    impact: "",
    responderIds: responders,
  });
  expect(r.status()).toBe(200);
  return {
    organizationId: "acme",
    incidentId: (await r.json()).incidentId as string,
  };
}
export async function connection(context: BrowserContext) {
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
      await post(context.request, "connection/bind", {
        identity: conn.identity!.toHexString(),
      })
    ).status(),
  ).toBe(200);
  await new Promise<void>((resolve, reject) =>
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((e) => reject(e))
      .subscribe([
        "SELECT * FROM visible_investigation_data",
        "SELECT * FROM visible_incident_data",
        "SELECT * FROM visible_scope_data",
      ]),
  );
  return {
    conn,
    rows: <T>(kind: string, incidentId: string) =>
      [...conn.db.visibleInvestigationData.iter()]
        .filter((r) => r.incidentId === incidentId && r.kind === kind)
        .map((r) => JSON.parse(r.body) as T),
  };
}
