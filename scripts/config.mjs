import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export const root = fileURLToPath(new URL("../", import.meta.url));
for (const file of [".env.local", "frontend/.env.local"]) {
  const path = resolve(root, file);
  if (existsSync(path)) process.loadEnvFile(path);
}
export const endpoint =
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "http://127.0.0.1:3001";
export const database =
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "aegis-local";
export const cli =
  process.env.SPACETIME_CLI ??
  (existsSync(resolve(homedir(), ".local/bin/spacetime"))
    ? resolve(homedir(), ".local/bin/spacetime")
    : "spacetime");
export const modulePath = resolve(root, "backend/spacetimedb");
export const bindingsPath = resolve(root, "frontend/src/module_bindings");
export const dataDir = resolve(
  root,
  process.env.SPACETIMEDB_DATA_DIR ?? ".spacetime/data",
);
export const cliConfig = resolve(dataDir, "cli.toml");
export function hasLocalIdentity() {
  return (
    existsSync(cliConfig) &&
    /^\s*spacetimedb_token\s*=/m.test(readFileSync(cliConfig, "utf8"))
  );
}
export function localAddress() {
  const url = new URL(endpoint);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.protocol !== "http:"
  ) {
    throw new Error(
      "Development scripts require a local http endpoint (localhost or 127.0.0.1).",
    );
  }
  return `${url.hostname}:${url.port || "80"}`;
}
export function launch(command, args, options = {}) {
  if (command === cli) args = ["--config-path", cliConfig, ...args];
  return spawn(command, args, { cwd: root, stdio: "inherit", ...options });
}
export function completed(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`Process failed (${signal ?? code}).`)),
    );
  });
}
export async function isDatabaseRunning() {
  try {
    return (
      await fetch(`${endpoint}/v1/ping`, { signal: AbortSignal.timeout(1000) })
    ).ok;
  } catch {
    return false;
  }
}

export async function configureGateway() {
  process.env.EVIDENCE_STORAGE_DIR = resolve(root, process.env.EVIDENCE_STORAGE_DIR ?? resolve(dataDir, "evidence"));
  process.env.AEGIS_DEVELOPMENT_MODE = "true";
  if (process.env.AEGIS_E2E !== "1") {
    if (
      !!process.env.SPACETIMEDB_SERVER_TOKEN !==
      !!process.env.AEGIS_GATEWAY_IDENTITY
    )
      throw new Error(
        "Configure both SPACETIMEDB_SERVER_TOKEN and AEGIS_GATEWAY_IDENTITY, or leave both unset for local provisioning.",
      );
    if (
      process.env.SPACETIMEDB_SERVER_TOKEN &&
      process.env.AEGIS_GATEWAY_IDENTITY
    ) {
      process.env.AEGIS_TEST_MODE = "false";
      await configureInvestigationWorker();
      return;
    }
  }
  localAddress();
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const file = resolve(dataDir, "gateway.json");
  let credentials;
  if (existsSync(file)) credentials = JSON.parse(readFileSync(file, "utf8"));
  else {
    const response = await fetch(`${endpoint}/v1/identity`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error("Could not provision the local server identity.");
    credentials = await response.json();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
  }
  if (
    typeof credentials.token !== "string" ||
    typeof credentials.identity !== "string"
  )
    throw new Error("Invalid local gateway credentials.");
  process.env.SPACETIMEDB_SERVER_TOKEN = credentials.token;
  process.env.AEGIS_GATEWAY_IDENTITY = credentials.identity;
  process.env.AEGIS_TEST_MODE =
    process.env.AEGIS_E2E === "1" ? "true" : "false";
  await configureInvestigationWorker();
}

async function configureInvestigationWorker() {
  if (process.env.AEGIS_E2E !== "1" && process.env.SPACETIMEDB_WORKER_TOKEN && process.env.AEGIS_WORKER_IDENTITY) return;
  localAddress();
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const file = resolve(dataDir, "investigation-worker.json");
  let credentials;
  if (existsSync(file)) credentials = JSON.parse(readFileSync(file, "utf8"));
  else {
    const response = await fetch(`${endpoint}/v1/identity`, { method: "POST", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Could not provision the investigation worker identity.");
    credentials = await response.json();
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
  }
  if (typeof credentials.token !== "string" || typeof credentials.identity !== "string") throw new Error("Invalid investigation worker credentials.");
  process.env.SPACETIMEDB_WORKER_TOKEN = credentials.token;
  process.env.AEGIS_WORKER_IDENTITY = credentials.identity;
}
