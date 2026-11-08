import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { command } from "../frontend/lib/server/gateway";
import {
  readEvidence,
  evidenceDigest,
} from "../frontend/lib/server/evidence-store";

interface Descriptor {
  version: string;
  rows: { table: string; id: string; body: string }[];
  artifacts: { id: string; storageReference: string; sha256: string }[];
}
const descriptor = await command<Descriptor>("investigation.reference", "", {});
if (
  !descriptor.rows.some(
    (r) => r.table === "incidents" && r.id === "acme:IR-2041",
  ) ||
  !descriptor.artifacts.some((a) => a.id === "EV-018")
)
  throw new Error(
    "Reference case or original EV-018 is missing; refusing integrity verification.",
  );
for (const a of descriptor.artifacts)
  await readEvidence(a.storageReference, a.sha256);
const directory = resolve(
  process.env.SPACETIMEDB_DATA_DIR ?? ".spacetime/data",
);
const file = resolve(directory, "ir2041-integrity.json");
const rows = Object.fromEntries(
  descriptor.rows.map((r) => [
    `${r.table}:${r.id}`,
    evidenceDigest(Buffer.from(r.body)),
  ]),
);
if (process.argv.includes("--capture")) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    JSON.stringify(
      { version: descriptor.version, rows, artifacts: descriptor.artifacts },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Captured reference integrity baseline: ${descriptor.rows.length} rows and ${descriptor.artifacts.length} verified originals. Existing baselines are never overwritten.`,
  );
} else {
  const baseline = JSON.parse(await readFile(file, "utf8")) as {
    version: string;
    rows: Record<string, string>;
    artifacts: Descriptor["artifacts"];
  };
  if (baseline.version !== descriptor.version)
    throw new Error("Reference integrity manifest version mismatch.");
  const conflicts = Object.entries(baseline.rows)
    .filter(([id, hash]) => rows[id] !== hash)
    .map(([id]) => id);
  for (const original of baseline.artifacts)
    await readEvidence(original.storageReference, original.sha256);
  if (conflicts.length)
    throw new Error(
      `Reference integrity conflicts: ${conflicts.slice(0, 10).join(", ")}. No data or original artifacts were modified.`,
    );
  console.log(
    `Reference integrity verified: ${Object.keys(baseline.rows).length} preserved rows and original bytes. New appended work is retained.`,
  );
}
