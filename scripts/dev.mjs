import { resolve } from "node:path";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import {
  root,
  cli,
  endpoint,
  database,
  modulePath,
  dataDir,
  localAddress,
  launch,
  completed,
  isDatabaseRunning,
  configureGateway,
} from "./config.mjs";

const children = new Set();
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      /* Already exited. */
    }
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stop();
  });
function start(args) {
  // Unix needs a process group for cleanup; Windows uses taskkill /T instead.
  const child = launch(cli, args, { detached: process.platform !== "win32" });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
try {
  localAddress();
  const port = process.env.AEGIS_FRONTEND_PORT ?? "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("AEGIS_FRONTEND_PORT must be a valid port number.");
  // Fail before publishing or starting another watcher when a frontend exists.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) =>
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is already in use. If AEGIS is running, open http://127.0.0.1:${port}; otherwise stop that server before running npm run dev again.`,
            )
          : error,
      ),
    );
    probe.listen(Number(port), "127.0.0.1", () => probe.close(resolve));
  });
  if (!(await isDatabaseRunning())) {
    const server = start([
      "start",
      "--listen-addr",
      localAddress(),
      "--data-dir",
      dataDir,
      "--non-interactive",
    ]);
    let serverFailure;
    const serverDone = completed(server).catch((error) => {
      serverFailure = error;
    });
    for (let attempt = 0; !(await isDatabaseRunning()); attempt++) {
      if (serverFailure) throw serverFailure;
      if (server.exitCode !== null || attempt >= 240 || stopping)
        throw new Error(
          "SpacetimeDB did not become ready. Check ports and CLI output.",
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    serverDone.then(() => {
      if (!stopping) {
        console.error("SpacetimeDB stopped.");
        process.exitCode = 1;
        stop();
      }
    });
  } else {
    console.log(`Reusing SpacetimeDB at ${endpoint}.`);
  }
  if (!stopping) {
    await configureGateway();
    // Additive schema publication and idempotent development bootstrap happen before Next.js.
    await completed(
      launch(process.execPath, [resolve(root, "scripts/db.mjs"), "publish"]),
    );
    await completed(
      launch(process.execPath, [resolve(root, "scripts/db.mjs"), "generate"]),
    );
    await completed(
      launch("npm", ["exec", "tsx", "--", "scripts/bootstrap.ts"]),
    );
    if (process.env.AEGIS_E2E === "1") {
      const next = launch(
        "npm",
        [
          "exec",
          "--workspace",
          "@aegis/frontend",
          "next",
          "--",
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          port,
        ],
        { detached: process.platform !== "win32" },
      );
      children.add(next);
      next.once("exit", () => children.delete(next));
      await completed(next);
    } else {
      // Official watcher handles binding generation, Next.js, and subsequent backend edits.
      const dev = start([
        "dev",
        database,
        "--no-config",
        "--server",
        endpoint,
        "--project-path",
        resolve(root, "frontend"),
        "--module-path",
        modulePath,
        "--module-bindings-path",
        "src/module_bindings",
        "--client-lang",
        "typescript",
        "--delete-data=never",
        "--yes",
        "--run",
        `npm exec next -- dev --hostname 127.0.0.1 --port ${port}`,
      ]);
      await completed(dev);
    }
  }
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  stop();
}
