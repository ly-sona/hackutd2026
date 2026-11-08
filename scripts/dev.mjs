import { resolve } from "node:path";
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
      process.kill(-child.pid, "SIGTERM");
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
  const child = launch(cli, args, { detached: true });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
try {
  localAddress();
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
    const port = process.env.AEGIS_FRONTEND_PORT ?? "3000";
    if (!/^\d+$/.test(port))
      throw new Error("AEGIS_FRONTEND_PORT must be a port number.");
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
    if (!(
      process.env.AEGIS_E2E === "1" &&
      process.env.AEGIS_E2E_MANUAL_WORKER === "1"
    )) {
      const worker = launch(
        "npm",
        ["exec", "tsx", "--", "scripts/investigation-runner.ts"],
        {
          detached: true,
          env: {
            ...process.env,
            SPACETIMEDB_SERVER_TOKEN: "",
            AEGIS_GATEWAY_IDENTITY: "",
          },
        },
      );
      children.add(worker);
      worker.once("exit", () => {
        children.delete(worker);
        if (!stopping)
          console.error(
            "Investigation worker stopped. Queued jobs remain persisted; restart the development command to resume.",
          );
      });
    }
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
        { detached: true },
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
