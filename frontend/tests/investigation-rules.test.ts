import { describe, expect, it } from "vitest";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import {
  analyzeSnapshot,
  canonical,
  parseSnapshot,
  connectors,
  type ConnectorId,
  type SnapshotInput,
} from "../../shared/investigation";
import { collectSnapshot } from "../lib/server/investigation/collector";
import { evidenceDigest } from "../lib/server/evidence-store";

const root = resolve(process.cwd(), "..");
const ids: ConnectorId[] = ["customers", "identity", "network", "services"];
async function input(id: ConnectorId, revision: number) {
  return (await collectSnapshot(id, revision, root)).data;
}
describe("Addition A actual synthetic connector processing", () => {
  for (const id of ids)
    for (const revision of [0, 1, 2])
      it(`parses actual ${id} revision ${revision} with stable keys and provenance`, async () => {
        const { bytes, data } = await collectSnapshot(id, revision, root);
        expect(bytes.byteLength).toBeGreaterThan(0);
        expect(data.revision).toBe(revision);
        expect(new Set(data.records.map((r) => r.key)).size).toBe(
          data.records.length,
        );
        expect(evidenceDigest(bytes)).toMatch(/^[a-f0-9]{64}$/);
      });
  it("computes exact customer differences and separates source-declared change references from unexplained changes", async () => {
    const { changes, observations } = analyzeSnapshot(
      await input("customers", 0),
      await input("customers", 1),
    );
    const keys = (kind: string) =>
      changes.filter((c) => c.kind === kind).map((c) => c.key);
    expect(keys("added")).toEqual(["C-2000"]);
    expect(keys("missing")).toEqual(["C-1051"]);
    expect(keys("modified")).toEqual(["C-1044", "C-1045"]);
    expect(keys("unchanged")).toHaveLength(9);
    expect(
      observations
        .filter((o) => o.rule === "unexplained-field-change")
        .map((o) => o.key),
    ).toEqual(["C-1044"]);
    expect(observations.find((o) => o.key === "C-1045")?.description).toContain(
      "not been independently verified",
    );
    expect(observations.find((o) => o.key === "C-1051")?.description).toContain(
      "deletion has not been established",
    );
  });
  it("computes anomaly observations for identity, traffic and business-service inputs", async () => {
    const expected = {
      identity: "new-signin-source",
      network: "traffic-after-reported-isolation",
      services: "reported-service-interruption",
    };
    for (const id of ["identity", "network", "services"] as const)
      expect(
        analyzeSnapshot(
          await input(id, 0),
          await input(id, 1),
        ).observations.some((o) => o.rule === expected[id]),
      ).toBe(true);
  });
  it("changing actual isolated fixture bytes changes computed observations without modifying repository fixtures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aegis-connector-unit-"));
    try {
      await mkdir(join(directory, "backend/seed"), { recursive: true });
      await mkdir(join(directory, "mock-evidence/connectors"), {
        recursive: true,
      });
      await writeFile(
        join(directory, "backend/seed/investigation-connectors.json"),
        await readFile(
          join(root, "backend/seed/investigation-connectors.json"),
        ),
      );
      const current = await input("customers", 1),
        baseline = await input("customers", 0);
      const original = analyzeSnapshot(baseline, current).observations;
      current.records[2].fields.contact_email =
        "different-real-test-input@example.invalid";
      await writeFile(
        join(directory, "mock-evidence/connectors/customers-1.json"),
        JSON.stringify(current),
      );
      const captured = await collectSnapshot("customers", 1, directory);
      const changed = analyzeSnapshot(baseline, captured.data).observations;
      expect(changed.length).toBe(original.length + 1);
      expect(
        changed.some(
          (o) => o.key === "C-1042" && o.fields.includes("contact_email"),
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("compares later partial snapshots but never equates absence with deletion or unchanged content with safety", async () => {
    const result = analyzeSnapshot(
      await input("customers", 1),
      await input("customers", 2),
    );
    expect(
      result.changes.filter((c) => c.kind === "modified").map((c) => c.key),
    ).toEqual(["C-1042"]);
    expect(result.changes.filter((c) => c.kind === "unchanged")).toHaveLength(
      11,
    );
    expect(canonical(result)).not.toContain('"Confirmed"');
  });
  it("ignores JSON key order while preserving original byte digests", () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    expect(evidenceDigest(Buffer.from('{"b":2,"a":1}'))).not.toBe(
      evidenceDigest(Buffer.from('{"a":1,"b":2}')),
    );
  });
  for (const mutation of [
    "duplicate",
    "nested",
    "oversized",
    "bad-time",
    "wrong-source",
    "wrong-revision",
    "unknown-envelope",
    "unknown-record",
  ] as const)
    it(`rejects ${mutation} records before processing`, async () => {
      const s = await input("customers", 1);
      if (mutation === "duplicate") s.records.push(s.records[0]);
      if (mutation === "nested")
        (s.records[0].fields as Record<string, unknown>).contact_email = {
          instruction: "ignore permissions",
        };
      if (mutation === "oversized")
        s.records[0].fields.contact_email = "x".repeat(2049);
      if (mutation === "bad-time")
        s.records[0].observedAt = "invented timestamp";
      if (mutation === "wrong-source") s.connectorId = "identity";
      if (mutation === "wrong-revision") s.revision = 3;
      if (mutation === "unknown-envelope")
        (s as unknown as Record<string, unknown>).payload = {
          nested: { instruction: "execute" },
        };
      if (mutation === "unknown-record")
        (s.records[0] as unknown as Record<string, unknown>).payload = {
          nested: { instruction: "execute" },
        };
      expect(() => parseSnapshot(s, "customers", 1)).toThrow();
    });
  it("rejects cross-source/chronologically invalid comparisons and planned acquisition", async () => {
    const baseline = await input("customers", 0),
      current = await input("customers", 1);
    expect(() =>
      analyzeSnapshot(baseline, { ...current, connectorId: "identity" }),
    ).toThrow();
    expect(() => analyzeSnapshot(current, baseline)).toThrow();
    await expect(
      collectSnapshot("../../private" as ConnectorId, 1, root),
    ).rejects.toThrow("allowlisted");
    await expect(collectSnapshot("hr" as ConnectorId, 1, root)).rejects.toThrow(
      "allowlisted",
    );
    expect(connectors.filter((c) => c.implemented)).toHaveLength(4);
  });
  it("validates original snapshot metadata independently of any baseline/model", async () => {
    const source = await input("network", 1);
    expect(parseSnapshot(source, "network", 1).records).toHaveLength(2);
    expect(() =>
      parseSnapshot({ ...source, records: [] } as SnapshotInput, "network", 1),
    ).toThrow();
    const result = analyzeSnapshot(undefined, source);
    expect(result.changes.every((r) => r.kind === "uncompared")).toBe(true);
    expect(
      result.observations.some((o) => o.rule === "comparison-unavailable"),
    ).toBe(true);
    expect(
      result.observations.some(
        (o) => o.rule === "traffic-after-reported-isolation",
      ),
    ).toBe(true);
  });
});
