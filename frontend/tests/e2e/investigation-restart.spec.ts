import { test, expect } from "@playwright/test";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { command, withGateway, unwrap } from "../../lib/server/gateway";
import { hashPassword, newToken, tokenHash } from "../../lib/server/password";
import { seedIncidents } from "../../../scripts/seed-incidents";
import { localSigningKeyArgs } from "../../../scripts/local-signing-keys.mjs";
import { collectSnapshot } from "../../lib/server/investigation/collector";
import {
  processNextJob,
  workerCall,
  type WorkerJob,
} from "../../lib/server/investigation/runner";
import {
  storeEvidence,
  evidenceDigest,
  readEvidence,
} from "../../lib/server/evidence-store";
import { canonical } from "../../../shared/investigation";

test("migrates an existing main database non-destructively and resumes scoped work across real database/worker restart", async () => {
  test.setTimeout(150_000);
  const root = resolve(process.cwd(), ".."),
    previous = { ...process.env },
    previousCwd = process.cwd();
  const state = await mkdtemp(join(tmpdir(), "aegis-investigation-restart-"));
  const endpoint = "http://127.0.0.1:3201",
    database = "aegis-investigation-restart",
    cli =
      process.env.SPACETIME_CLI ??
      join(process.env.HOME!, ".local/bin/spacetime");
  const config = join(state, "cli.toml");
  let server: ChildProcess | undefined,
    logs = "";
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
        join(state, "db"),
        ...localSigningKeyArgs(join(state, "db")),
        "--non-interactive",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    for (const stream of [server.stdout!, server.stderr!])
      stream.on("data", (b) => {
        logs = (logs + String(b)).slice(-12000);
      });
    await expect
      .poll(
        async () => {
          if (server?.exitCode !== null) throw new Error(logs);
          try {
            return (
              await fetch(`${endpoint}/v1/ping`, {
                signal: AbortSignal.timeout(300),
              })
            ).ok;
          } catch {
            return false;
          }
        },
        { timeout: 20000 },
      )
      .toBe(true);
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const child = server;
    if (process.platform === "win32") {
      await promisify(execFile)(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
      );
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Owned test DB did not stop."));
      }, 15000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
  async function publish(modulePath: string) {
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
        modulePath,
        "--delete-data=never",
        "--yes=skip-login",
        database,
      ],
      { cwd: root, env: process.env, timeout: 45000, maxBuffer: 2_000_000 },
    );
  }
  try {
    let occupied = false;
    try {
      occupied = (
        await fetch(`${endpoint}/v1/ping`, { signal: AbortSignal.timeout(300) })
      ).ok;
    } catch {
      /* No disposable DB on port. */
    }
    expect(
      occupied,
      "Refuse an occupied test port; do not stop another process",
    ).toBe(false);
    await start();
    const gateway = (await (
      await fetch(`${endpoint}/v1/identity`, { method: "POST" })
    ).json()) as { token: string; identity: string };
    const worker = (await (
      await fetch(`${endpoint}/v1/identity`, { method: "POST" })
    ).json()) as { token: string; identity: string };
    Object.assign(process.env, {
      AEGIS_GATEWAY_IDENTITY: gateway.identity,
      AEGIS_WORKER_IDENTITY: worker.identity,
      AEGIS_TEST_MODE: "true",
      AEGIS_DEVELOPMENT_MODE: "true",
      SPACETIMEDB_SERVER_TOKEN: gateway.token,
      SPACETIMEDB_WORKER_TOKEN: worker.token,
      NEXT_PUBLIC_SPACETIMEDB_HOST: endpoint,
      NEXT_PUBLIC_SPACETIMEDB_DB_NAME: database,
      EVIDENCE_STORAGE_DIR: join(state, "evidence"),
    });
    process.chdir(root);
    const legacy = join(state, "legacy");
    await mkdir(legacy);
    await promisify(execFile)(
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${join(state, "main.tar")}`,
        "149b906",
        "backend/spacetimedb",
        "shared",
      ],
      { cwd: root },
    );
    await promisify(execFile)("tar", [
      "-xf",
      join(state, "main.tar"),
      "-C",
      legacy,
    ]);
    await symlink(
      join(root, "node_modules"),
      join(legacy, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await publish(join(legacy, "backend/spacetimedb"));
    const passwordHash = await hashPassword(newToken());
    const profiles = [
      ["maya", "commander"],
      ["alex", "analyst"],
      ["priya", "legal"],
      ["jordan", "operations"],
      ["taylor", "analyst"],
      ["sam", "administrator"],
    ];
    await command("bootstrap", "", {
      users: profiles.map(([id, role]) => ({
        id,
        name: id,
        login: id,
        role,
        passwordHash,
      })),
      invitationHash0: tokenHash(newToken()),
      invitationHash1: tokenHash(newToken()),
      invitationHash2: tokenHash(newToken()),
      eventId: randomUUID(),
    });
    async function login(userId: string) {
      const hash = tokenHash(newToken());
      await command("login_success", "", {
        userId,
        hash,
        eventId: randomUUID(),
      });
      return hash;
    }
    const mayaHash = await login("maya"),
      alexHash = await login("alex"),
      samHash = await login("sam");
    await seedIncidents();
    const descriptor = () =>
      withGateway(async (conn) =>
        unwrap<{ sha256: string; storageReference: string }>(
          await conn.procedures.evidenceDescriptor({
            sessionHash: mayaHash,
            evidenceId: "EV-018",
          }),
        ),
      );
    const original = await descriptor();
    const create = () =>
      command<{ incidentId: string }>("incident.create", mayaHash, {
        organizationId: "acme",
        title: "Durable synthetic investigation",
        description: "Unknown scope; authorized fixture source collection.",
        type: "Other",
        severity: "High",
        discoveredAt: Date.now(),
        commanderId: "maya",
        systems: "",
        impact: "",
        responderIds: ["alex"],
      });
    const oldIncident = await create();
    await publish(join(root, "backend/spacetimedb"));
    await command("investigation.seed", "", {});
    expect(await descriptor()).toEqual(original);
    expect(
      evidenceDigest(
        await readEvidence(original.storageReference, original.sha256),
      ),
    ).toBe(original.sha256);
    const scope = {
      organizationId: "acme",
      incidentId: oldIncident.incidentId,
    };
    const queued = await command<{ runId: string }>(
      "investigation.start",
      mayaHash,
      { ...scope, operationId: randomUUID(), connectorIds: ["customers"] },
    );
    const job = await workerCall<WorkerJob>("claim");
    expect(job.run.id).toBe(queued.runId);
    const sourceId = job.sources[0].id,
      base = { runId: job.run.id, leaseToken: job.run.leaseToken, sourceId };
    const snapshot = await workerCall<{ id: string; storageReference: string }>(
      "reserve",
      { ...base, role: "baseline" },
    );
    const { bytes, data } = await collectSnapshot("customers", 0, root);
    await storeEvidence(bytes, snapshot.storageReference);
    await workerCall("metadata", {
      ...base,
      snapshotId: snapshot.id,
      sha256: evidenceDigest(bytes),
      size: bytes.length,
      recordCount: data.records.length,
      collectedAt: data.collectedAt,
      coverage: data.coverage,
    });
    await workerCall("records", {
      ...base,
      snapshotId: snapshot.id,
      rows: [
        {
          body: data.records[0],
          index: 0,
          sha256: evidenceDigest(Buffer.from(canonical(data.records[0]))),
        },
      ],
    });
    const secondScope = {
      organizationId: "acme",
      incidentId: (await create()).incidentId,
    };
    const second = await command<{ runId: string }>(
      "investigation.start",
      alexHash,
      { ...secondScope, operationId: randomUUID(), connectorIds: ["identity"] },
    );
    await command("test_expire_session", mayaHash, {});
    await stop();
    await start();
    await command("member_revoke", samHash, {
      organizationId: "acme",
      userId: "alex",
    });
    await command("investigation.test.expireLease", "", {
      runId: queued.runId,
    });
    await expect(workerCall("state", base)).rejects.toThrow();
    // A fresh OS worker process resumes using only its narrow credential.
    await promisify(execFile)(
      process.execPath,
      [
        join(root, "node_modules/tsx/dist/cli.mjs"),
        join(root, "scripts/investigation-runner.ts"),
        "--once",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          SPACETIMEDB_SERVER_TOKEN: "",
          AEGIS_GATEWAY_IDENTITY: "",
        },
        timeout: 30000,
      },
    );
    expect(await processNextJob()).toBe(false); // Revoked Alex cannot publish his queued work.
    const fresh = await login("maya");
    const page = await command<{
      rows: { kind: string }[];
      snapshots: { id: string }[];
    }>("investigation.read", fresh, {
      ...scope,
      kind: "differences",
      runId: queued.runId,
      sourceId,
      limit: 50,
    });
    expect(page.snapshots).toHaveLength(2);
    expect(page.snapshots.some((s) => s.id === snapshot.id)).toBe(true);
    expect(page.rows.filter((r) => r.kind === "modified")).toHaveLength(2);
    expect(
      evidenceDigest(
        await readEvidence(snapshot.storageReference, evidenceDigest(bytes)),
      ),
    ).toBe(evidenceDigest(bytes));
    await expect(
      workerCall("reserve", {
        runId: second.runId,
        leaseToken: "none",
        sourceId: `${secondScope.organizationId}:${secondScope.incidentId}:source:identity`,
        role: "current",
      }),
    ).rejects.toThrow();
    // Addition C: interrupt the later snapshot before metadata, then resume the
    // same frozen prior-version comparison in a new worker after a DB restart.
    const later = await command<{ runId: string }>(
      "investigation.refresh",
      fresh,
      { ...scope, runId: queued.runId, operationId: randomUUID() },
    );
    const laterJob = await workerCall<WorkerJob>("claim");
    expect(laterJob.run.id).toBe(later.runId);
    const laterBase = {
      runId: later.runId,
      leaseToken: laterJob.run.leaseToken,
      sourceId,
    };
    const laterSnapshot = await workerCall<{ id: string; revision: number }>(
      "reserve",
      { ...laterBase, role: "current" },
    );
    expect(laterSnapshot.revision).toBe(2);
    await command("test_expire_session", fresh, {});
    await stop();
    await start();
    await command("investigation.test.expireLease", "", { runId: later.runId });
    await promisify(execFile)(
      process.execPath,
      [
        join(root, "node_modules/tsx/dist/cli.mjs"),
        join(root, "scripts/investigation-runner.ts"),
        "--once",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          SPACETIMEDB_SERVER_TOKEN: "",
          AEGIS_GATEWAY_IDENTITY: "",
        },
        timeout: 30000,
      },
    );
    const after = await command<{
      rows: { key: string; kind: string }[];
      snapshots: { id: string }[];
    }>("investigation.read", await login("maya"), {
      ...scope,
      kind: "differences",
      runId: later.runId,
      sourceId,
      limit: 50,
    });
    expect(after.snapshots).toHaveLength(2);
    expect(after.snapshots.some((s) => s.id === laterSnapshot.id)).toBe(true);
    expect(
      after.snapshots.some((s) => page.snapshots.some((p) => p.id === s.id)),
    ).toBe(true);
    expect(after.rows.find((r) => r.key === "C-1042")?.kind).toBe("modified");
    expect(after.rows.find((r) => r.key === "C-1044")?.kind).toBe("unchanged");
  } finally {
    await stop();
    process.chdir(previousCwd);
    for (const k of Object.keys(process.env))
      if (!(k in previous)) delete process.env[k];
    Object.assign(process.env, previous);
    await rm(state, { recursive: true, force: true });
  }
});
