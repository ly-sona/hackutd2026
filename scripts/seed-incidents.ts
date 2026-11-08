import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { command } from "../frontend/lib/server/gateway";
import {
  storeEvidence,
  readEvidence,
  validateEvidence,
  evidenceDigest,
} from "../frontend/lib/server/evidence-store";
export async function seedIncidents() {
  const manifest = JSON.parse(
    await readFile(resolve("backend/seed/evidence-manifest.json"), "utf8"),
  ) as {
    version: string;
    evidence: {
      id: string;
      filename: string;
      incidentId: string;
      description: string;
      source: string;
      findingId: string;
      collectedAt: string;
      status: string;
    }[];
  };
  const directory = resolve(process.env.EVIDENCE_STORAGE_DIR!);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const mappingPath = resolve(directory, "seed-manifest.json");
  let mapping: Record<string, string> = {};
  try {
    mapping = JSON.parse(await readFile(mappingPath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const artifacts = [];
  for (const item of manifest.evidence) {
    const bytes = await readFile(resolve("mock-evidence", item.filename));
    const contentType = validateEvidence(item.filename, "", bytes);
    const sha256 = evidenceDigest(bytes);
    let storageReference = mapping[item.id];
    if (storageReference)
      await readEvidence(storageReference, sha256); // Never silently replace original bytes.
    else {
      storageReference = randomUUID();
      await storeEvidence(bytes, storageReference);
      mapping[item.id] = storageReference;
      await writeFile(mappingPath, JSON.stringify(mapping, null, 2), {
        mode: 0o600,
      });
    }
    artifacts.push({
      ...item,
      contentType,
      storageReference,
      sha256,
      size: bytes.length,
    });
  }
  const result = await command<{ seeded: boolean }>("incident.seed", "", {
    artifacts,
  });
  console.log(
    result.seeded
      ? "Seeded Phase 2: 3 incidents, 9 findings, 26 events, 10 private artifacts."
      : "Phase 2 fixture version exists; all user-created data preserved.",
  );
}
