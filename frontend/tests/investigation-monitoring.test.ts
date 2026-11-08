import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeIncremental } from "../../shared/investigation-monitoring";
import { parseSnapshot, type ConnectorId } from "../../shared/investigation";
import {
  incidentContext,
  currentApprovalContext,
} from "../../backend/spacetimedb/src/recovery-access";
import type { Reader } from "../../backend/spacetimedb/src/index";
const snapshot = (id: ConnectorId, revision: number) =>
  parseSnapshot(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../mock-evidence/connectors",
          `${id}-${revision}.json`,
        ),
        "utf8",
      ),
    ),
    id,
    revision,
  );

describe("incremental synthetic evidence", () => {
  it("compares actual current/later fixtures and excludes unchanged earlier anomalies", () => {
    const c = analyzeIncremental(
      snapshot("customers", 1),
      snapshot("customers", 2),
    );
    expect(c.changes.find((c) => c.key === "C-1042")?.kind).toBe("modified");
    expect(c.changes.find((c) => c.key === "C-1044")?.kind).toBe("unchanged");
    expect(c.observations.map((o) => o.key)).toEqual(["C-1042"]);
    const n = analyzeIncremental(
      snapshot("network", 1),
      snapshot("network", 2),
    );
    expect(n.observations.map((o) => o.key)).toEqual(["NET-003"]);
  });
  it("retains missing-export uncertainty and all four comparison classes", () => {
    const b = snapshot("customers", 1),
      c = structuredClone(snapshot("customers", 2));
    c.records = c.records.filter((r) => r.key !== "C-1043");
    c.records.push({ ...c.records[0], key: "C-NEW" });
    const result = analyzeIncremental(b, c);
    expect(new Set(result.changes.map((c) => c.kind))).toEqual(
      new Set(["added", "modified", "missing", "unchanged"]),
    );
    expect(
      result.observations.find((o) => o.rule === "missing-export-entry")
        ?.description,
    ).toContain("deletion has not been established");
  });
  it("detects only the new sign-in and newly unavailable service", () => {
    expect(
      analyzeIncremental(
        snapshot("identity", 1),
        snapshot("identity", 2),
      ).observations.map((o) => o.key),
    ).toEqual(["AUTH-003"]);
    const s = analyzeIncremental(
      snapshot("services", 1),
      snapshot("services", 2),
    );
    expect(s.observations.every((o) => o.key === "CUSTOMER-PORTAL")).toBe(true);
    expect(
      s.observations.some((o) => o.rule === "reported-service-interruption"),
    ).toBe(true);
  });
});

describe("relevant recovery approval context", () => {
  function setup() {
    const rows = {
      relationships: [
        {
          id: "dependency",
          sourceId: "operation",
          targetId: "source:customers:system",
          type: "DEPENDS_ON",
        },
      ],
      assessments: [
        { id: "a", entityId: "source:customers:record:1", status: "Suspected" },
      ],
      restrictions: [] as {
        id: string;
        entityId: string;
        evidenceIds: string;
      }[],
      sources: [
        { id: "source:customers", latestSnapshotId: "customer-1" },
        { id: "source:network", latestSnapshotId: "network-1" },
      ],
      evidence: [{ id: "e", sha256: "hash-1", status: "Unverified" }],
    };
    const filter = (rows: unknown[]) => ({
      incidentKey: { filter: () => rows },
    });
    const ctx = {
      db: {
        scopeRelationships: filter(rows.relationships),
        scopeAssessments: filter(rows.assessments),
        trustRestrictions: filter(rows.restrictions),
        scopeRecords: {
          iter: () => [
            {
              id: "source:customers:record:1",
              organizationId: "acme",
              datasetId: "dataset",
              groupId: "group",
            },
          ],
        },
        scopeEvidenceLinks: filter([
          { id: "l", entityId: "source:customers:system", evidenceId: "e" },
        ]),
        investigationSources: filter(rows.sources),
        evidence: {
          id: { find: (id: string) => rows.evidence.find((e) => e.id === id) },
        },
      },
    } as unknown as Reader;
    rows.relationships.push({
      id: "stored",
      sourceId: "dataset",
      targetId: "source:customers:system",
      type: "STORED_IN",
    });
    return { ctx, rows };
  }
  it("ignores unrelated source changes, but binds dependency sources and record assessments", () => {
    const { ctx, rows } = setup(),
      fingerprint = incidentContext(ctx, "acme", "IR-C", ["operation"]);
    rows.sources[1].latestSnapshotId = "network-2";
    expect(
      currentApprovalContext(ctx, "acme", "IR-C", fingerprint, ["operation"]),
    ).toBe(fingerprint);
    rows.sources[0].latestSnapshotId = "customer-2";
    expect(
      currentApprovalContext(ctx, "acme", "IR-C", fingerprint, ["operation"]),
    ).not.toBe(fingerprint);
    rows.sources[0].latestSnapshotId = "customer-1";
    rows.assessments[0].status = "Confirmed";
    expect(
      currentApprovalContext(ctx, "acme", "IR-C", fingerprint, ["operation"]),
    ).not.toBe(fingerprint);
  });
  it("binds relevant evidence and new dependencies without walking incident association links", () => {
    const { ctx, rows } = setup(),
      fingerprint = incidentContext(ctx, "acme", "IR-C", ["operation"]);
    rows.relationships.push({
      id: "incidentlink",
      sourceId: "incident:IR-C",
      targetId: "source:network:system",
      type: "RELATED_TO",
    });
    expect(incidentContext(ctx, "acme", "IR-C", ["operation"])).toBe(
      fingerprint,
    );
    rows.evidence[0].sha256 = "changed";
    expect(incidentContext(ctx, "acme", "IR-C", ["operation"])).not.toBe(
      fingerprint,
    );
    rows.evidence[0].sha256 = "hash-1";
    rows.relationships.push({
      id: "newdependency",
      sourceId: "operation",
      targetId: "source:network:system",
      type: "DEPENDS_ON",
    });
    expect(incidentContext(ctx, "acme", "IR-C", ["operation"])).not.toBe(
      fingerprint,
    );
  });
  it("preserves legacy context semantics and keeps closure context incident-wide", () => {
    const { ctx, rows } = setup(),
      legacy = incidentContext(ctx, "acme", "IR-C"),
      closure = incidentContext(ctx, "acme", "IR-C", []);
    expect(
      currentApprovalContext(ctx, "acme", "IR-C", legacy, ["operation"]),
    ).toBe(legacy);
    rows.sources[1].latestSnapshotId = "network-2";
    expect(
      currentApprovalContext(ctx, "acme", "IR-C", legacy, ["operation"]),
    ).toBe(legacy);
    expect(currentApprovalContext(ctx, "acme", "IR-C", closure, [])).not.toBe(
      closure,
    );
  });
});
