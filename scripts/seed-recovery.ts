import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { command } from "../frontend/lib/server/gateway";
import {
  storeEvidence,
  readEvidence,
  evidenceDigest,
} from "../frontend/lib/server/evidence-store";
export async function seedRecovery() {
  const records = [
    {
      id: "SAFE-001",
      label: "Synthetic Support Customer A",
      serviceTier: "Standard",
      instruction:
        "Use independent support forms; do not query the original Customer Database.",
    },
    {
      id: "SAFE-002",
      label: "Synthetic Support Customer B",
      serviceTier: "Priority",
      instruction:
        "Read-only synthetic service routing; no original customer PII.",
    },
    {
      id: "SAFE-003",
      label: "Synthetic Support Customer C",
      serviceTier: "Standard",
      instruction: "Escalate account changes to the incident team.",
    },
  ];
  const file = resolve(
    process.env.EVIDENCE_STORAGE_DIR!,
    "recovery-fixtures.json",
  );
  let mapping: Record<string, string> = {};
  try {
    mapping = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const fixtures = [];
  for (const outcome of ["success", "failure", "fallback"]) {
    const artifact = {
      schema: "aegis-synthetic-verification-v1",
      outcome,
      simulation: true,
      integrity: outcome !== "failure",
      availability: true,
      description:
        outcome === "failure"
          ? "Independent recovery-source checksum differs from its expected synthetic baseline. Original system restrictions remain."
          : "Predefined synthetic integrity and availability conditions pass.",
      ...(outcome === "fallback"
        ? {
            safeSubset: records.map((r) => r.id),
            accessLevel: "Read Only",
            durationSeconds: 3600,
          }
        : {}),
    };
    const bytes = Buffer.from(JSON.stringify(artifact, null, 2) + "\n"),
      sha256 = evidenceDigest(bytes),
      id = `acme:IR-2041:${outcome}`;
    let reference = mapping[id];
    if (reference) await readEvidence(reference, sha256);
    else {
      reference = randomUUID();
      await storeEvidence(bytes, reference);
      mapping[id] = reference;
      await writeFile(file, JSON.stringify(mapping, null, 2), { mode: 0o600 });
    }
    fixtures.push({
      id,
      outcome,
      filename: `synthetic-verification-${outcome}.json`,
      evidenceId: `EV-REC-${outcome.toUpperCase()}`,
      storageReference: reference,
      sha256,
      size: bytes.length,
      integrity: artifact.integrity,
      availability: artifact.availability,
    });
  }
  console.log(await command("recovery.seed", "", { fixtures, records }));
}
