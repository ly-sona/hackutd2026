import { describe, it, expect } from "vitest";
import {
  calculateScope,
  potentialLeads,
  type CountEntity,
} from "../../shared/scope";
const entities: CountEntity[] = [
  {
    id: "account",
    kind: "Account",
    name: "A-09",
    datasetId: "",
    groupId: "",
    recordCount: 0,
    countKnown: false,
  },
  {
    id: "system",
    kind: "System",
    name: "Database",
    datasetId: "",
    groupId: "",
    recordCount: 0,
    countKnown: false,
  },
  {
    id: "dataset",
    kind: "Dataset",
    name: "Customer Records",
    datasetId: "dataset",
    groupId: "",
    recordCount: 1240,
    countKnown: true,
  },
  {
    id: "group",
    kind: "Record Group",
    name: "October Customers",
    datasetId: "dataset",
    groupId: "",
    recordCount: 1240,
    countKnown: true,
  },
  {
    id: "overlap",
    kind: "Record Group",
    name: "Overlapping review",
    datasetId: "dataset",
    groupId: "",
    recordCount: 100,
    countKnown: true,
  },
];
const records = Array.from({ length: 1240 }, (_, n) => ({
  id: `C-${1001 + n}`,
  datasetId: "dataset",
}));
const memberships = [
  ...records.map((r) => ({ groupId: "group", recordId: r.id })),
  ...records.slice(0, 100).map((r) => ({ groupId: "overlap", recordId: r.id })),
];
const relationships = [
  {
    id: "access",
    sourceId: "account",
    targetId: "system",
    type: "CAN_ACCESS",
    status: "Unverified",
  },
  {
    id: "data",
    sourceId: "system",
    targetId: "dataset",
    type: "CONTAINS",
    status: "Confirmed",
  },
  {
    id: "cohort",
    sourceId: "dataset",
    targetId: "group",
    type: "CONTAINS",
    status: "Confirmed",
  },
  {
    id: "cycle",
    sourceId: "group",
    targetId: "account",
    type: "RELATED_TO",
    status: "Unverified",
  },
];
describe("credible scope calculation and deterministic leads", () => {
  it("keeps inventory size separate from individually confirmed damage", () => {
    const result = calculateScope(
      entities,
      records,
      memberships,
      [{ entityId: "group", dimension: "Exfiltration", status: "Suspected" }],
      [],
    );
    expect(result.totalRecords).toBe(1240);
    expect(result.potentialRecords).toBe(1240);
    expect(result.individuallyConfirmedRecords).toBe(0);
    expect(result.notIndividuallyAssessed).toBe(1240);
  });
  it("deduplicates overlapping groups, dataset scope and individually assessed records", () => {
    const result = calculateScope(
      entities,
      records,
      memberships,
      [
        { entityId: "dataset", dimension: "Exfiltration", status: "Suspected" },
        { entityId: "group", dimension: "Exfiltration", status: "Suspected" },
        { entityId: "overlap", dimension: "Exfiltration", status: "Suspected" },
        { entityId: "C-1044", dimension: "Encryption", status: "Confirmed" },
        { entityId: "C-1044", dimension: "Exfiltration", status: "Suspected" },
        { entityId: "C-1044", dimension: "Deletion", status: "Confirmed" },
      ],
      [],
    );
    expect(result.potentialRecords).toBe(1239);
    expect(result.individuallyConfirmedRecords).toBe(1);
    expect(result.notIndividuallyAssessed).toBe(1239);
  });
  it("does not promote a confirmed group assessment into 1,240 individually verified records", () => {
    const result = calculateScope(
      entities,
      records,
      memberships,
      [{ entityId: "group", dimension: "Encryption", status: "Confirmed" }],
      [],
    );
    expect(result.individuallyConfirmedRecords).toBe(0);
    expect(result.potentialRecords).toBe(1240);
  });
  it("does not treat unassessed or ruled-out individual assessments as confirmed", () => {
    const result = calculateScope(
      entities,
      records,
      memberships,
      [
        { entityId: "C-1044", dimension: "Exfiltration", status: "Ruled Out" },
        { entityId: "C-1045", dimension: "Encryption", status: "Unassessed" },
      ],
      [],
    );
    expect(result.individuallyConfirmedRecords).toBe(0);
    expect(result.notIndividuallyAssessed).toBe(1239);
  });
  it("traverses existing access and containment relationships without changing their certainty", () => {
    const assessments = [
      {
        entityId: "account",
        dimension: "Compromise",
        status: "Confirmed Compromise",
      },
    ];
    const before = JSON.stringify({ assessments, relationships });
    const leads = potentialLeads(entities, relationships, assessments);
    expect(leads.find((l) => l.entityId === "group")?.path).toEqual([
      "access",
      "data",
      "cohort",
    ]);
    expect(leads.find((l) => l.entityId === "group")?.explanation).toContain(
      "not proof",
    );
    expect(JSON.stringify({ assessments, relationships })).toBe(before);
    expect(leads.every((l) => !l.entityId.startsWith("C-"))).toBe(true);
  });
  it("stops ruled-out paths and terminates cycles deterministically", () => {
    const leads = potentialLeads(
      entities,
      relationships.map((r) =>
        r.id === "access" ? { ...r, status: "Ruled Out" } : r,
      ),
      [
        {
          entityId: "account",
          dimension: "Compromise",
          status: "Suspected Compromise",
        },
      ],
    );
    expect(leads).toEqual([]);
    const cycle = [
      ...relationships,
      {
        id: "back",
        sourceId: "group",
        targetId: "system",
        type: "POTENTIALLY_AFFECTS",
        status: "Unverified",
      },
    ];
    expect(
      potentialLeads(entities, cycle, [
        {
          entityId: "account",
          dimension: "Compromise",
          status: "Suspected Compromise",
        },
      ]),
    ).toHaveLength(3);
  });
});
