// Pure rules shared by deterministic processing and its tests. No model or I/O.
export const CONNECTOR_VERSION = "acme-connectors-v1";
export const RULE_VERSION = "aegis-deterministic-v1";
export const MAX_SNAPSHOT_RECORDS = 2000;
export const connectors = [
  {
    id: "customers",
    name: "Customer Records / CRM",
    priority: "P0",
    implemented: true,
    kind: "records",
    fields: ["contact_email", "category", "accountId", "approvedChange"],
  },
  {
    id: "identity",
    name: "Identity and Access",
    priority: "P0",
    implemented: true,
    kind: "events",
    fields: ["accountId", "role", "outcome", "source", "approvedChange"],
  },
  {
    id: "network",
    name: "Network Activity",
    priority: "P0",
    implemented: true,
    kind: "events",
    fields: [
      "accountId",
      "source",
      "destination",
      "bytes",
      "isolationReportedAt",
      "approvedChange",
    ],
  },
  {
    id: "services",
    name: "Business Services and Dependencies",
    priority: "P0",
    implemented: true,
    kind: "records",
    fields: ["name", "state", "dependsOn", "approvedChange"],
  },
  {
    id: "hr",
    name: "HR Records",
    priority: "P1",
    implemented: false,
    kind: "records",
    fields: [],
  },
  {
    id: "payroll",
    name: "Payroll",
    priority: "P1",
    implemented: false,
    kind: "records",
    fields: [],
  },
  ...[
    "Vendor and Purchasing",
    "Finance",
    "Email Audit",
    "Documents and File Shares",
    "Endpoint and Server Activity",
    "Backups and Recovery Inventory",
  ].map((name, i) => ({
    id: `planned-${i}`,
    name,
    priority: "P2",
    implemented: false,
    kind: "records",
    fields: [] as string[],
  })),
] as const;
export type ConnectorId = "customers" | "identity" | "network" | "services";
export type Scalar = string | number | boolean | null;
export interface SourceRecord {
  key: string;
  observedAt: string;
  fields: Record<string, Scalar>;
}
export interface SnapshotInput {
  schema: "aegis-snapshot-v1";
  connectorId: ConnectorId;
  revision: number;
  coverage: "full" | "partial";
  collectedAt: string;
  records: SourceRecord[];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function parseSnapshot(
  value: unknown,
  connectorId: string,
  revision: number,
): SnapshotInput {
  const c = connectors.find((c) => c.id === connectorId && c.implemented);
  if (!c || !value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unsupported connector or snapshot.");
  const s = value as SnapshotInput;
  if (
    Object.keys(s).some(
      (key) =>
        ![
          "schema",
          "connectorId",
          "revision",
          "coverage",
          "collectedAt",
          "records",
        ].includes(key),
    ) ||
    s.schema !== "aegis-snapshot-v1" ||
    s.connectorId !== connectorId ||
    s.revision !== revision ||
    !["full", "partial"].includes(s.coverage) ||
    !validTime(s.collectedAt) ||
    !Array.isArray(s.records) ||
    !s.records.length ||
    s.records.length > MAX_SNAPSHOT_RECORDS
  )
    throw new Error(
      "Invalid snapshot schema, revision, coverage, time or record count.",
    );
  const seen = new Set<string>();
  for (const row of s.records) {
    if (
      !row ||
      Object.keys(row).some(
        (key) => !["key", "observedAt", "fields"].includes(key),
      ) ||
      typeof row.key !== "string" ||
      !/^[A-Za-z0-9_.-]{1,80}$/.test(row.key) ||
      seen.has(row.key) ||
      (row.observedAt !== "" && !validTime(row.observedAt)) ||
      !row.fields ||
      typeof row.fields !== "object" ||
      Array.isArray(row.fields)
    )
      throw new Error("Invalid or duplicate record key, fields or timestamp.");
    seen.add(row.key);
    const entries = Object.entries(row.fields);
    if (
      !entries.length ||
      entries.length > 16 ||
      entries.some(
        ([key, v]) =>
          !(c.fields as readonly string[]).includes(key) || !scalar(v),
      )
    )
      throw new Error("Unknown, nested, oversized or invalid source field.");
  }
  return s;
}
function scalar(v: unknown): v is Scalar {
  return (
    v === null ||
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v)) ||
    (typeof v === "string" && v.length <= 2048 && !v.includes("\0"))
  );
}
function validTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 35 &&
    /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
export interface Change {
  key: string;
  kind: "added" | "modified" | "missing" | "unchanged" | "uncompared";
  fields: string[];
  before?: SourceRecord;
  after?: SourceRecord;
}
export function compareSnapshots(
  baseline: SnapshotInput,
  current: SnapshotInput,
): Change[] {
  if (
    baseline.connectorId !== current.connectorId ||
    baseline.schema !== current.schema ||
    Date.parse(baseline.collectedAt) > Date.parse(current.collectedAt)
  )
    throw new Error("Incompatible comparison sources or chronology.");
  const before = new Map(baseline.records.map((r) => [r.key, r]));
  const after = new Map(current.records.map((r) => [r.key, r]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().map((key) => {
    const a = before.get(key),
      b = after.get(key);
    const fields =
      a && b
        ? [
            ...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]),
          ].filter((k) => canonical(a.fields[k]) !== canonical(b.fields[k]))
        : [];
    return {
      key,
      kind: !a
        ? "added"
        : !b
          ? "missing"
          : fields.length || a.observedAt !== b.observedAt
            ? "modified"
            : "unchanged",
      fields,
      before: a,
      after: b,
    };
  });
}
export interface ObservationInput {
  key: string;
  rule: string;
  description: string;
  fields: string[];
  observedAt: string;
}
export function analyzeSnapshot(
  baseline: SnapshotInput | undefined,
  current: SnapshotInput,
): { changes: Change[]; observations: ObservationInput[] } {
  const changes: Change[] = baseline
    ? compareSnapshots(baseline, current)
    : current.records.map((after) => ({
        key: after.key,
        kind: "uncompared",
        fields: [],
        after,
      }));
  const observations: ObservationInput[] = [];
  const emit = (
    r: SourceRecord,
    rule: string,
    description: string,
    fields: string[],
  ) =>
    observations.push({
      key: r.key,
      rule,
      description,
      fields,
      observedAt: r.observedAt,
    });
  if (!baseline)
    emit(
      current.records[0],
      "comparison-unavailable",
      "No baseline available. Content integrity and changes are not established; only applicable current-snapshot checks ran.",
      [],
    );
  for (const d of changes) {
    const r = d.after;
    if (d.kind === "missing")
      observations.push({
        key: d.key,
        rule: "missing-export-entry",
        description: `Absent from ${current.coverage} export; deletion has not been established.`,
        fields: [],
        observedAt: "",
      });
    if (r && d.kind === "modified" && !r.fields.approvedChange)
      emit(
        r,
        "unexplained-field-change",
        `Fields differ from the supplied baseline: ${d.fields.join(", ") || "observed timestamp"}. Cause and integrity impact require review.`,
        d.fields,
      );
    if (r && d.kind === "modified" && r.fields.approvedChange)
      emit(
        r,
        "source-declared-change-reference",
        "Changed source row cites an approval reference; its validity has not been independently verified. Retain the difference for human review.",
        d.fields,
      );
    if (
      r &&
      baseline &&
      current.connectorId === "identity" &&
      r.fields.outcome === "success" &&
      !baseline.records.some((b) => b.fields.source === r.fields.source)
    )
      emit(
        r,
        "new-signin-source",
        "Successful sign-in from a source absent in the supplied baseline. Account compromise is not established.",
        ["accountId", "source", "outcome"],
      );
    if (
      r &&
      current.connectorId === "network" &&
      typeof r.fields.isolationReportedAt === "string" &&
      validTime(r.fields.isolationReportedAt) &&
      r.observedAt &&
      Date.parse(r.observedAt) > Date.parse(r.fields.isolationReportedAt) &&
      Number(r.fields.bytes) > 0
    )
      emit(
        r,
        "traffic-after-reported-isolation",
        "Traffic observed after the reported isolation time. Attribution, transferred contents and containment require verification.",
        ["isolationReportedAt", "bytes"],
      );
    if (
      r &&
      current.connectorId === "services" &&
      r.fields.state === "unavailable"
    )
      emit(
        r,
        "reported-service-interruption",
        "Snapshot reports service unavailable. This is an availability observation, not proof of compromise or record exposure.",
        ["state", "dependsOn"],
      );
  }
  return { changes, observations };
}
export interface InvestigationRun {
  observationCount?: number;
  id: string;
  status: string;
  collectionStatus: string;
  deterministicStatus: string;
  agentStatus: string;
  completedSnapshots: number;
  expectedSnapshots: number;
  analyzedSources: number;
  sourceIds: string;
  createdAt: string;
  updatedAt: string;
  error: string;
  actorId: string;
}
export interface InvestigationSource {
  id: string;
  connectorId: string;
  latestSnapshotId: string;
  status: string;
  collectedSnapshots?: number;
  recordCount?: number;
  snapshotTime?: string;
}
