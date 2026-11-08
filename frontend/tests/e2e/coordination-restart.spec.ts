import { test, expect } from "@playwright/test";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";
import { hashPassword, newToken, tokenHash } from "../../lib/server/password";
import type { Page, Task, Message } from "../../lib/coordination";
// A separate disposable standalone process proves persisted scheduling after an actual restart.
// It never stops the shared test server (3101) or the developer's server (3001).
test("persists pending pages and scheduled escalation through a real standalone restart", async () => {
  test.setTimeout(90_000);
  const state = await mkdtemp(join(tmpdir(), "aegis-page-restart-"));
  const cli =
    process.env.SPACETIME_CLI ??
    join(process.env.HOME!, ".local/bin/spacetime");
  const endpoint = "http://127.0.0.1:3201",
    database = "aegis-page-restart",
    root = resolve(process.cwd(), ".."),
    config = join(state, "cli.toml");
  let server: ChildProcess | undefined,
    log = "";
  const connections = new Set<DbConnection>();
  async function start() {
    server = spawn(
      cli,
      [
        "--config-path",
        config,
        "start",
        "--listen-addr",
        "127.0.0.1:3201",
        "--data-dir",
        state,
        "--non-interactive",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stdout!.on("data", (b) => {
      log = (log + String(b)).slice(-12000);
    });
    server.stderr!.on("data", (b) => {
      log = (log + String(b)).slice(-12000);
    });
    await expect
      .poll(
        async () => {
          if (server!.exitCode !== null)
            throw new Error("Isolated database exited: " + log);
          try {
            return (
              await fetch(endpoint + "/v1/ping", {
                signal: AbortSignal.timeout(500),
              })
            ).ok;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
  }
  async function stop() {
    const child = server;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Database did not shut down gracefully."));
      }, 15000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
  async function connect(token?: string) {
    const conn = await new Promise<DbConnection>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Restart connection timed out.")),
        10000,
      );
      DbConnection.builder()
        .withUri(endpoint)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((c) => {
          clearTimeout(timer);
          resolve(c);
        })
        .onConnectError((_, e) => {
          clearTimeout(timer);
          reject(e);
        })
        .build();
    });
    connections.add(conn);
    return conn;
  }
  try {
    await expect
      .poll(
        async () => {
          try {
            return !(
              await fetch(endpoint + "/v1/ping", {
                signal: AbortSignal.timeout(200),
              })
            ).ok;
          } catch {
            return true;
          }
        },
        { timeout: 1000 },
      )
      .toBe(true);
    await start();
    const identity = (await (
      await fetch(endpoint + "/v1/identity", { method: "POST" })
    ).json()) as { token: string; identity: string };
    await promisify(execFile)(
      cli,
      [
        "--config-path",
        config,
        "publish",
        "--no-config",
        "--server",
        endpoint,
        "--module-path",
        resolve(root, "backend/spacetimedb"),
        "--delete-data=never",
        "--yes=skip-login",
        database,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          AEGIS_GATEWAY_IDENTITY: identity.identity,
          AEGIS_DEVELOPMENT_MODE: "true",
          AEGIS_TEST_MODE: "true",
          AEGIS_PAGE_ACK_SECONDS: "5",
        },
        timeout: 30000,
        maxBuffer: 1_000_000,
      },
    );
    let service = await connect(identity.token);
    async function cmd<T = Record<string, string>>(
      action: string,
      hash: string,
      payload: object,
    ): Promise<T> {
      const requestId = randomUUID();
      await service.reducers.accessCommand({
        requestId,
        sessionHash: hash,
        action,
        payload: JSON.stringify(payload),
      });
      const result = JSON.parse(
        await service.procedures.takeCommandResult({ requestId }),
      );
      if (!result.ok) throw new Error(result.error);
      return result.data as T;
    }
    const digest = await hashPassword(newToken());
    const profiles = [
      { id: "maya", name: "Maya Chen", role: "commander" },
      { id: "alex", name: "Alex Rivera", role: "analyst" },
      { id: "priya", name: "Priya Shah", role: "legal" },
      { id: "jordan", name: "Jordan Davis", role: "operations" },
      { id: "taylor", name: "Taylor Morgan", role: "analyst" },
      { id: "sam", name: "Sam Patel", role: "administrator" },
    ];
    await cmd("bootstrap", "", {
      users: profiles.map((p) => ({ ...p, login: p.id, passwordHash: digest })),
      invitationHash0: tokenHash(newToken()),
      invitationHash1: tokenHash(newToken()),
      invitationHash2: tokenHash(newToken()),
      eventId: randomUUID(),
    });
    const mayaHash = tokenHash(newToken());
    await cmd("login_success", "", {
      userId: "maya",
      hash: mayaHash,
      eventId: randomUUID(),
    });
    const incident = await cmd("incident.create", mayaHash, {
      organizationId: "acme",
      title: "Isolated restart verification",
      description: "Synthetic scheduler durability fixture.",
      type: "Other",
      severity: "High",
      discoveredAt: Date.now(),
      commanderId: "maya",
      systems: "",
      impact: "",
      responderIds: ["alex"],
    });
    const scope = { organizationId: "acme", incidentId: incident.incidentId };
    const message = await cmd("coord.message.send", mayaHash, {
      ...scope,
      clientRequestId: randomUUID(),
      conversationId: `acme:${incident.incidentId}:room`,
      content: "Preserve this message and the original task through restart.",
      references: [],
    });
    const task = await cmd("coord.task.create", mayaHash, {
      ...scope,
      clientRequestId: randomUUID(),
      title: "Restart page fixture",
      description: "Synthetic coordination task.",
      kind: "Coordination",
      priority: "High",
      assignedUserId: "alex",
      backupUserId: "maya",
      dueAt: 0,
      references: [],
      sourceMessageId: message.messageId,
    });
    const page = await cmd("coord.page.create", mayaHash, {
      ...scope,
      clientRequestId: randomUUID(),
      taskId: task.taskId,
    });
    async function reader() {
      const c = await connect();
      await cmd("bind", mayaHash, { identity: c.identity!.toHexString() });
      await new Promise<void>((resolve, reject) =>
        c
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError(reject)
          .subscribe([
            "SELECT * FROM visible_coordination_data",
            "SELECT * FROM visible_incident_data",
          ]),
      );
      return {
        c,
        rows: <T>(kind: string) =>
          [...c.db.visibleCoordinationData.iter()]
            .filter((r) => r.kind === kind)
            .map((r) => JSON.parse(r.body) as T),
      };
    }
    const before = await reader();
    expect(
      before.rows<Page>("page").find((p) => p.id === page.pageId)!.status,
    ).toBe("Awaiting Acknowledgment");
    const deadline = Number(
      before.rows<Page>("page").find((p) => p.id === page.pageId)!
        .acknowledgmentDeadline,
    );
    for (const c of connections) c.disconnect();
    connections.clear();
    await stop();
    await expect
      .poll(() => Date.now(), { timeout: 10000 })
      .toBeGreaterThan(deadline + 300);
    await start();
    // No publish, bootstrap, frontend or test tick after restart. The persisted module/timer alone escalates.
    service = await connect(identity.token);
    const after = await reader();
    await expect
      .poll(
        () =>
          after.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
      )
      .toBe("Escalated");
    expect(
      after.rows<Page>("page").filter((p) => p.parentPageId === page.pageId),
    ).toHaveLength(1);
    expect(
      after.rows<Task>("task").find((t) => t.id === task.taskId)!.status,
    ).toBe("Open");
    expect(
      after.rows<Message>("message").find((m) => m.id === message.messageId)!
        .content,
    ).toContain("Preserve this message");
    const child = after
      .rows<Page>("page")
      .find((p) => p.parentPageId === page.pageId)!;
    await expect
      .poll(() => Number(after.rows<{ now: string }>("policy")[0].now))
      .toBeGreaterThan(Number(child.createdAt) + 1100);
    expect(
      after.rows<Page>("page").filter((p) => p.parentPageId === page.pageId),
    ).toHaveLength(1);
    await cmd("coord.page.acknowledge", mayaHash, {
      ...scope,
      clientRequestId: randomUUID(),
      pageId: child.id,
    });
    await expect
      .poll(
        () => after.rows<Page>("page").find((p) => p.id === child.id)?.status,
      )
      .toBe("Acknowledged");
    expect(
      after.rows<Task>("task").find((t) => t.id === task.taskId)!.status,
    ).toBe("Open");
  } finally {
    for (const c of connections) c.disconnect();
    await stop();
    await rm(state, { recursive: true, force: true });
  }
});
