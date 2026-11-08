import { canonical, type SourceRecord } from "./investigation";

export const AGENT_VERSION = "aegis-investigator-v1";
export const AGENT_LIMITS = {
  requests: 10,
  tools: 18,
  proposals: 3,
  attempts: 3,
  context: 100_000,
} as const;
export interface Citation {
  observationId: string;
  evidenceId: string;
  snapshotId: string;
  key: string;
  location: string;
  fields: string[];
  observedAt: string;
  ruleVersion: string;
  recordHash: string;
}
export interface AgentObservation {
  id: string;
  sourceId: string;
  key: string;
  rule: string;
  ruleVersion: string;
  description: string;
  provenance: string;
}
export interface ProposalInput {
  observationIds: string[];
  citations: Citation[];
  priority: "High" | "Medium" | "Low";
  interpretation:
    | "Investigate source change"
    | "Investigate account activity"
    | "Investigate containment"
    | "Investigate service interruption";
}
export interface GroundedProposal extends ProposalInput {
  title: string;
  claim: string;
  rationale: string;
  uncertainty: string;
  missingInformation: string;
  entityId: string;
  correlated: boolean;
}
export interface AgentSummary {
  id: string;
  collectionRunId: string;
  status: string;
  error: string;
  model: string;
  requests: number;
  toolCount: number;
  pending: number;
  createdAt: string;
  updatedAt: string;
}
export interface ReviewedProposal {
  id: string;
  agentRunId: string;
  content: string;
  status: string;
  reviewerId: string;
  justification: string;
  findingId: string;
  relationshipId: string;
  reviewedAt: string;
}
export function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in value))
  )
    throw new Error("Invalid object fields.");
  return value as Record<string, unknown>;
}
export function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 300 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error("Invalid identifier.");
  return value;
}
export function validateTool(name: string, args: unknown) {
  if (["detect_anomalies", "compare_snapshots"].includes(name)) {
    const d = object(args, ["sourceId"]);
    identifier(d.sourceId);
  } else if (name === "parse_evidence") {
    const d = object(args, ["snapshotId", "key"]);
    identifier(d.snapshotId);
    identifier(d.key);
  } else if (name === "query_context_graph") {
    const d = object(args, ["entityId"]);
    identifier(d.entityId);
  } else if (name === "propose_findings") {
    const d = object(args, ["proposals"]);
    if (
      !Array.isArray(d.proposals) ||
      d.proposals.length > AGENT_LIMITS.proposals
    )
      throw new Error("Invalid proposal count.");
    for (const p of d.proposals) validateProposalShape(p);
  } else throw new Error("Tool is not allowed.");
}
export function validateProposalShape(value: unknown): ProposalInput {
  const d = object(value, [
    "observationIds",
    "citations",
    "priority",
    "interpretation",
  ]);
  if (
    !Array.isArray(d.observationIds) ||
    d.observationIds.length < 1 ||
    d.observationIds.length > 3 ||
    new Set(d.observationIds).size !== d.observationIds.length
  )
    throw new Error("Invalid observations.");
  d.observationIds.forEach(identifier);
  if (
    !["High", "Medium", "Low"].includes(String(d.priority)) ||
    ![
      "Investigate source change",
      "Investigate account activity",
      "Investigate containment",
      "Investigate service interruption",
    ].includes(String(d.interpretation))
  )
    throw new Error("Unsupported interpretation or priority.");
  if (
    !Array.isArray(d.citations) ||
    !d.citations.length ||
    d.citations.length > 6
  )
    throw new Error("Exact citations required.");
  for (const v of d.citations) {
    const r = object(v, [
      "observationId",
      "evidenceId",
      "snapshotId",
      "key",
      "location",
      "fields",
      "observedAt",
      "ruleVersion",
      "recordHash",
    ]);
    for (const key of [
      "observationId",
      "evidenceId",
      "snapshotId",
      "key",
      "location",
      "ruleVersion",
      "recordHash",
    ])
      identifier(r[key]);
    if (
      typeof r.observedAt !== "string" ||
      r.observedAt.length > 35 ||
      !Array.isArray(r.fields) ||
      r.fields.length > 16 ||
      r.fields.some((f) => typeof f !== "string" || f.length > 80)
    )
      throw new Error("Invalid citation fields or timestamp.");
  }
  return d as unknown as ProposalInput;
}
// Claims are compiled from validated facts, never free-form model assertions. The
// model chooses observations, priority and a cautious interpretation, not certainty.
export function groundProposal(
  value: unknown,
  observations: AgentObservation[],
  record: (citation: Citation) => SourceRecord,
  entityId: (sourceId: string) => string,
): GroundedProposal {
  const p = validateProposalShape(value);
  const selected = p.observationIds.map((id) => {
    const o = observations.find((o) => o.id === id);
    if (
      !o ||
      ["comparison-unavailable", "source-declared-change-reference"].includes(
        o.rule,
      )
    )
      throw new Error(
        "Selected observation is unavailable or not an unexplained anomaly.",
      );
    return o;
  });
  const expected = selected.flatMap((o) =>
    (JSON.parse(o.provenance) as Omit<Citation, "observationId">[]).map(
      (r) => ({ ...r, observationId: o.id }),
    ),
  );
  if (
    canonical(
      [...p.citations].sort((a, b) => canonical(a).localeCompare(canonical(b))),
    ) !==
    canonical(expected.sort((a, b) => canonical(a).localeCompare(canonical(b))))
  )
    throw new Error(
      `Citations must exactly resolve every selected observation. Copy this complete citations array unchanged: ${canonical(expected)}`,
    );
  p.citations.forEach(record);
  const primary = selected[0];
  const rule = primary.rule;
  const allowed =
    p.interpretation === "Investigate source change"
      ? ["unexplained-field-change", "missing-export-entry"]
      : p.interpretation === "Investigate account activity"
        ? ["new-signin-source", "new-access-context"]
        : p.interpretation === "Investigate containment"
          ? ["traffic-after-reported-isolation"]
          : ["reported-service-interruption"];
  if (!allowed.includes(rule))
    throw new Error(
      "Interpretation is unsupported by the primary observation.",
    );
  // The first pass must retain an available explicit cross-source correlation,
  // rather than publishing a weaker isolated account/network lead.
  if (selected.length === 1) {
    const latest = (o: AgentObservation) =>
      (JSON.parse(o.provenance) as Omit<Citation, "observationId">[])
        .map((ref) => record({ ...ref, observationId: o.id }))
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    const first = latest(primary);
    const match = observations.find((o) => {
      if (
        o.sourceId === primary.sourceId ||
        !["new-signin-source", "traffic-after-reported-isolation"].includes(
          o.rule,
        )
      )
        return false;
      const other = latest(o);
      return (
        first &&
        other &&
        typeof first.fields.accountId === "string" &&
        typeof first.fields.source === "string" &&
        first.fields.accountId === other.fields.accountId &&
        first.fields.source === other.fields.source &&
        !!first.observedAt &&
        !!other.observedAt &&
        Math.abs(Date.parse(first.observedAt) - Date.parse(other.observedAt)) <=
          30 * 60_000
      );
    });
    if (match)
      throw new Error(
        `Include the matching observation ${match.id} from ${match.sourceId}: inspect its citations and correlate the explicit account/source/time lead in one proposal.`,
      );
  }
  let correlated = false;
  if (selected.length > 1) {
    const current = selected.map((o) => {
      const refs = p.citations.filter((r) => r.observationId === o.id);
      return refs
        .map(record)
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    });
    const first = current[0];
    correlated =
      new Set(selected.map((o) => o.sourceId)).size === selected.length &&
      current.every(
        (r) =>
          typeof r.fields.accountId === "string" &&
          r.fields.accountId === first.fields.accountId &&
          typeof r.fields.source === "string" &&
          r.fields.source === first.fields.source &&
          !!r.observedAt &&
          Math.abs(Date.parse(r.observedAt) - Date.parse(first.observedAt)) <=
            30 * 60_000,
      );
    if (!correlated)
      throw new Error(
        "Cross-source correlation requires the same explicit account, source and a 30-minute observed window.",
      );
  }
  return {
    ...p,
    title: `${p.interpretation}: ${primary.key}`,
    claim: selected.map((o) => `${o.key}: ${o.description}`).join("\n"),
    rationale: correlated
      ? `The selected sources share an explicit account and source within 30 minutes. This is a correlation lead, not proof of attribution or transferred contents.`
      : `The model selected this deterministic observation for human investigation. Source comparisons supply the factual claim; the selected interpretation is a hypothesis.`,
    uncertainty:
      "Source provenance remains unverified. Cause, attribution, confidentiality exposure and production restoration safety are not established.",
    missingInformation:
      "Independently verify source authenticity, authorization/change context, containment and any affected content before confirming impact.",
    entityId: entityId(primary.sourceId),
    correlated,
  };
}

const string = { type: "string" };
const strict = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const citation = strict(
  Object.fromEntries(
    [
      "observationId",
      "evidenceId",
      "snapshotId",
      "key",
      "location",
      "observedAt",
      "ruleVersion",
      "recordHash",
    ].map((k) => [k, string]),
  ).valueOf() as Record<string, unknown>,
);
(citation.properties as Record<string, unknown>).fields = {
  type: "array",
  items: string,
};
citation.required.push("fields");
const proposal = strict({
  observationIds: { type: "array", items: string },
  citations: { type: "array", items: citation },
  priority: { type: "string", enum: ["High", "Medium", "Low"] },
  interpretation: {
    type: "string",
    enum: [
      "Investigate source change",
      "Investigate account activity",
      "Investigate containment",
      "Investigate service interruption",
    ],
  },
});
export const agentTools = [
  [
    "detect_anomalies",
    "Read actual deterministic observations and exact citations for a registered source.",
    strict({ sourceId: string }),
  ],
  [
    "compare_snapshots",
    "Read computed baseline/current change counts and changed keys; no invented arithmetic.",
    strict({ sourceId: string }),
  ],
  [
    "parse_evidence",
    "Inspect one cited source record from the hash-verified immutable original.",
    strict({ snapshotId: string, key: string }),
  ],
  [
    "query_context_graph",
    "Inspect an existing incident entity and at most 10 adjacent links; paths are leads only.",
    strict({ entityId: string }),
  ],
  [
    "propose_findings",
    "Finish with up to 3 grounded proposals after inspecting observations and their cited records. Copy all citations exactly. Zero proposals only if no applicable unexplained anomaly exists. No free-text factual assertions are accepted.",
    strict({ proposals: { type: "array", items: proposal } }),
  ],
].map(([name, description, parameters]) => ({
  type: "function",
  function: { name, description, parameters, strict: true },
}));
