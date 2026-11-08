import { analyzeSnapshot, type SnapshotInput } from "./investigation";

// Old snapshots remain evidence; unchanged events are not newly discovered risks.
export function analyzeIncremental(
  baseline: SnapshotInput,
  current: SnapshotInput,
) {
  const result = analyzeSnapshot(baseline, current);
  const changed = new Set(
    result.changes.filter((c) => c.kind !== "unchanged").map((c) => c.key),
  );
  return {
    ...result,
    observations: result.observations.filter((o) => changed.has(o.key)),
  };
}

export interface CollectionManifest {
  revision: number;
  previousRunId?: string;
  previousSnapshots?: Record<string, string>;
}
export function collectionManifest(run: {
  fingerprint: string;
}): CollectionManifest {
  return JSON.parse(run.fingerprint) as CollectionManifest;
}
