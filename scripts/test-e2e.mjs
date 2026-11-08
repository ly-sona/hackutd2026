// All suites share test ports and build state, including runs from other checkouts.
import { open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const [suite = "critical", ...args] = process.argv.slice(2);
if (!["critical", "extended", "restart", "investigation"].includes(suite)) throw new Error("Unknown integration suite.");
const lockPath = join(tmpdir(), "aegis-browser-tests.lock");
const discovery = args.includes("--list") || args.includes("--help");
let lock;
try {
  if (!discovery) {
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if (error.code === "EEXIST") throw new Error(`Another browser run owns ${lockPath}. Check its recorded owner before removing a stale lock.`);
      throw error;
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, processStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), suite }));
    for (const port of suite === "restart" ? [3100, 3101, 3201] : [3100, 3101]) {
      await new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once("error", () => reject(new Error(`Test port ${port} is occupied. Existing services were left untouched.`)));
        probe.listen(port, "127.0.0.1", () => probe.close(resolve));
      });
    }
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url)), "test", ...args], {
    cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
    env: { ...process.env, AEGIS_E2E_SUITE: suite }, stdio: "inherit", windowsHide: true,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (lock) { await lock.close(); await unlink(lockPath); }
}
