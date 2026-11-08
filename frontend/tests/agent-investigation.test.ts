// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  analyzeSnapshot,
  canonical,
  type SnapshotInput,
  type SourceRecord,
} from "../../shared/investigation";
import {
  groundProposal,
  validateTool,
  type AgentObservation,
  type Citation,
} from "../../shared/agent-investigation";
import { modelTurn, ModelUnavailable } from "../lib/server/investigation/model";
const fixtures = resolve(process.cwd(), "../mock-evidence/connectors");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function scenario() {
  const records = new Map<string, SourceRecord>();
  const observations: AgentObservation[] = [];
  for (const source of ["network", "identity"]) {
    const snapshots = [0, 1].map(
      (v) =>
        JSON.parse(
          readFileSync(resolve(fixtures, `${source}-${v}.json`), "utf8"),
        ) as SnapshotInput,
    );
    const { observations: outputs } = analyzeSnapshot(
      snapshots[0],
      snapshots[1],
    );
    for (const [i, o] of outputs.entries()) {
      const provenance = snapshots.flatMap((s, v) => {
        const index = s.records.findIndex((r) => r.key === o.key);
        if (index < 0) return [];
        const r = s.records[index],
          snapshotId = `${source}-${v}`;
        records.set(`${snapshotId}:${r.key}`, r);
        return [
          {
            evidenceId: `EV-${source}-${v}`,
            snapshotId,
            key: r.key,
            location: `/records/${index}`,
            fields: o.fields,
            observedAt: r.observedAt,
            ruleVersion: "aegis-deterministic-v1",
            recordHash: hash(canonical(r)),
          },
        ];
      });
      observations.push({
        id: `${source}-o${i}`,
        sourceId: source,
        key: o.key,
        rule: o.rule,
        ruleVersion: "aegis-deterministic-v1",
        description: o.description,
        provenance: JSON.stringify(provenance),
      });
    }
  }
  const p = {
    observationIds: observations.map((o) => o.id),
    citations: observations.flatMap((o) =>
      (JSON.parse(o.provenance) as Omit<Citation, "observationId">[]).map(
        (r) => ({ ...r, observationId: o.id }),
      ),
    ),
    priority: "High",
    interpretation: "Investigate containment",
  };
  const ground = (input: unknown) =>
    groundProposal(
      input,
      observations,
      (c) => records.get(`${c.snapshotId}:${c.key}`)!,
      (s) => `${s}:dataset`,
    );
  return { p, ground, records };
}
describe("evidence-grounded agent contract", () => {
  it("requires a supported matching source to be retained in the proposal", () => {
    const { p, ground } = scenario();
    expect(() =>
      ground({
        ...p,
        observationIds: [p.observationIds[0]],
        citations: p.citations.filter(
          (c) => c.observationId === p.observationIds[0],
        ),
      }),
    ).toThrow("matching observation");
  });
  it("compiles actual correlated account/source/time observations into a cautious dynamic proposal", () => {
    const { p, ground } = scenario();
    const proposal = ground(p);
    expect(proposal.correlated).toBe(true);
    expect(proposal.title).toContain("NET-002");
    expect(proposal.claim).toContain("Traffic observed");
    expect(proposal.uncertainty).toContain("not established");
  });
  for (const field of [
    "observationId",
    "evidenceId",
    "snapshotId",
    "key",
    "location",
    "observedAt",
    "ruleVersion",
    "recordHash",
    "fields",
  ])
    it(`rejects wrong citation ${field}`, () => {
      const { p, ground } = scenario();
      const bad = structuredClone(p);
      (bad.citations[0] as unknown as Record<string, unknown>)[field] =
        field === "fields" ? ["nonexistent"] : "fiction";
      expect(() => ground(bad)).toThrow();
    });
  it("rejects free-form factual claims including confirmed exfiltration and certainty", () => {
    const { p, ground } = scenario();
    expect(() =>
      ground({ ...p, claim: "Confirmed exfiltration of all customers" }),
    ).toThrow();
    expect(() => ground({ ...p, status: "Confirmed" })).toThrow();
  });
  it("rejects correlation when actual fixture field values differ", () => {
    const { p, ground, records } = scenario();
    records.get("identity-1:AUTH-002")!.fields.accountId = "other";
    expect(() => ground(p)).toThrow("correlation");
  });
  it("rejects source injection attempts to add unauthorized tools or arguments", () => {
    for (const name of [
      "execute_shell",
      "approve_recovery",
      "page_responder",
      "change_role",
    ])
      expect(() => validateTool(name, {})).toThrow();
    expect(() =>
      validateTool("parse_evidence", {
        snapshotId: "known",
        key: "x",
        url: "https://attacker.invalid",
      }),
    ).toThrow();
  });
  it("never turns a valid approval reference into an unexplained anomaly", () => {
    const { p, ground } = scenario();
    expect(() =>
      ground({ ...p, interpretation: "Investigate source change" }),
    ).toThrow("unsupported");
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("model endpoint failures", () => {
  const config = {
    baseUrl: "https://model.invalid/v1",
    model: "test",
    apiKey: "never-log-this",
  };
  it("reports endpoint failures without leaking a provider body or key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("private provider error", { status: 401 }),
      ),
    );
    await expect(modelTurn(config, [], [])).rejects.toThrow("HTTP 401");
  });
  it("rejects invalid JSON instead of inventing success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json")),
    );
    await expect(modelTurn(config, [], [])).rejects.toThrow();
  });
  it("reports timeouts as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("abort");
      }),
    );
    await expect(modelTurn(config, [], [])).rejects.toBeInstanceOf(
      ModelUnavailable,
    );
  });
});
