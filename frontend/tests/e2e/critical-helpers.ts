import { expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";
import { tokenHash } from "../../lib/server/password";

export const origin = "http://127.0.0.1:3100";
export const scope = { organizationId: "acme", incidentId: "IR-2041" };
export const base = "/org/acme/incidents/IR-2041";

export function configureGateway() {
  const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "../.spacetime/e2e/gateway.json"), "utf8"));
  process.env.SPACETIMEDB_SERVER_TOKEN = credentials.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}

export async function login(context: BrowserContext, id: string) {
  const accounts = JSON.parse(readFileSync(resolve(process.cwd(), "../.spacetime/e2e/demo-accounts.json"), "utf8")) as
    { id: string; login: string; password: string }[];
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new Error(`Missing synthetic account: ${id}`);
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: origin }, data: { login: account.login, password: account.password },
  });
  expect(response.status()).toBe(200);
}

export const post = (request: APIRequestContext, path: string, data: object) =>
  request.post(`/api/${path}`, { headers: { Origin: origin }, data });

export async function ok<T = Record<string, string>>(request: APIRequestContext, path: string, data: object): Promise<T> {
  const response = await post(request, path, data);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<T>;
}

export const coord = (request: APIRequestContext, action: string, data: object, clientRequestId: string = randomUUID()) =>
  post(request, "coordination", { ...scope, action, clientRequestId, ...data });

export async function coordOk(request: APIRequestContext, action: string, data: object, clientRequestId?: string) {
  const response = await coord(request, action, data, clientRequestId);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<Record<string, string>>;
}

export async function sessionHash(context: BrowserContext) {
  const cookie = (await context.cookies()).find((item) => item.name === "aegis_session");
  if (!cookie) throw new Error("Missing authenticated session");
  return tokenHash(cookie.value);
}

export async function connectAnonymous() {
  return new Promise<DbConnection>((resolve, reject) => {
    const timer = setTimeout(() => { pending.disconnect(); reject(new Error("Test SDK connection timed out")); }, 10_000);
    const pending = DbConnection.builder().withUri("http://127.0.0.1:3101").withDatabaseName("aegis-e2e")
      .onConnect((connection) => { clearTimeout(timer); resolve(connection); })
      .onConnectError((_, error) => { clearTimeout(timer); reject(error); }).build();
  });
}

export async function live(context: BrowserContext) {
  const conn = await connectAnonymous();
  try {
    await ok(context.request, "connection/bind", { identity: conn.identity!.toHexString() });
    await new Promise<void>((resolve, reject) => conn.subscriptionBuilder().onApplied(() => resolve()).onError(reject).subscribe([
      "SELECT * FROM my_access", "SELECT * FROM visible_incident_data",
      "SELECT * FROM visible_scope_data", "SELECT * FROM visible_coordination_data",
    ]));
    const rows = <T>(source: "incident" | "scope" | "coordination", kind: string, incidentId = scope.incidentId): T[] => {
      const table = source === "incident" ? conn.db.visibleIncidentData : source === "scope" ? conn.db.visibleScopeData : conn.db.visibleCoordinationData;
      return [...table.iter()].filter((row) => row.kind === kind && row.incidentId === incidentId).map((row) => JSON.parse(row.body) as T);
    };
    return { conn, rows };
  } catch (error) { conn.disconnect(); throw error; }
}

export const findingData = (title: string) => ({
  title, description: "Synthetic bounded observation; cause remains unverified.", category: "Observation",
  priority: "High", status: "Suspected", observedAt: Date.now(), relatedSystem: "Customer Database",
  assignedTo: "alex", evidenceIds: [], reason: "",
});

export const taskData = (title: string) => ({
  title, description: "Synthetic investigation requiring independent human review.", kind: "Investigation",
  priority: "Critical", assignedUserId: "alex", backupUserId: "maya", dueAt: 0,
  references: [{ kind: "finding", id: "IR-2041:F-04" }],
});

export async function upload(request: APIRequestContext, incidentId: string, bytes: Buffer, findingId = "") {
  const response = await request.post(`/api/incident/evidence?organizationId=acme&incidentId=${incidentId}`, {
    headers: { Origin: origin }, multipart: {
      file: { name: "critical-verification.log", mimeType: "text/plain", buffer: bytes },
      description: "Synthetic record-specific verification log", source: "Independent synthetic test",
      status: "Unverified", collectedAt: String(Date.now()), ...(findingId ? { findingId } : {}),
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).evidenceId as string;
}
