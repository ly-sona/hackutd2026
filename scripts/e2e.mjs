// Fresh, isolated test fixtures on every run. Previous states are retained, never reset.
import {
  mkdtemp,
  mkdir,
  lstat,
  readlink,
  rename,
  symlink,
  appendFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
if (process.env.AEGIS_E2E !== "1")
  throw new Error("This runner requires the isolated Playwright environment.");
const root = fileURLToPath(new URL("../", import.meta.url));
const endpoint = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST;
if (endpoint !== "http://127.0.0.1:3101")
  throw new Error("The isolated runner requires test database port 3101.");
let occupied = false;
try {
  occupied = (
    await fetch(endpoint + "/v1/ping", { signal: AbortSignal.timeout(500) })
  ).ok;
} catch {
  /* No database is running. */
}
if (occupied)
  throw new Error(
    "Test port 3101 is occupied. Stop its existing test run before starting another. No state was changed.",
  );
const directory = join(root, ".spacetime"),
  pointer = join(directory, "e2e");
await mkdir(directory, { recursive: true, mode: 0o700 });
let previous, entry;
try {
  entry = await lstat(pointer);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (entry?.isSymbolicLink())
  previous = resolve(dirname(pointer), await readlink(pointer));
else if (entry?.isDirectory())
  previous = pointer + "-preserved-" + randomUUID();
else if (entry)
  throw new Error(
    "The test state path is not a directory. No state was changed.",
  );
const state = await mkdtemp(join(tmpdir(), "aegis-e2e-"));
await appendFile(
  join(directory, "e2e-runs.jsonl"),
  JSON.stringify({ startedAt: new Date().toISOString(), state, previous }) +
    "\n",
  { mode: 0o600 },
);
if (entry)
  await rename(
    pointer,
    entry.isDirectory() ? previous : pointer + "-preserved-" + randomUUID(),
  );
const temporary = pointer + "-link-" + randomUUID();
await symlink(state, temporary, process.platform === "win32" ? "junction" : "dir");
await rename(temporary, pointer);
console.log(
  "Isolated test state: " +
    state +
    ". Previous state retained" +
    (previous ? ": " + previous : "."),
);
const child = spawn(process.execPath, [join(root, "scripts/dev.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, SPACETIMEDB_DATA_DIR: ".spacetime/e2e" },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
