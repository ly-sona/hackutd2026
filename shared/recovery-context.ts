// Dependency closure for approval context. Incident association links never join
// otherwise unrelated inventory into one approval boundary.
export function recoveryContextEntities(
  targets: string[],
  relationships: { sourceId: string; targetId: string; type: string }[],
  records: { id: string; datasetId: string; groupId: string }[] = [],
) {
  const ids = new Set(targets);
  let changed = true;
  while (changed) {
    changed = false;
    const add = (id: string) => {
      if (!ids.has(id)) {
        ids.add(id);
        changed = true;
      }
    };
    for (const r of relationships) {
      if (r.type === "DEPENDS_ON" && ids.has(r.sourceId)) add(r.targetId);
      if (r.type === "CONTAINS" && ids.has(r.sourceId)) add(r.targetId);
      if (r.type === "STORED_IN" && ids.has(r.targetId)) add(r.sourceId);
      if (r.type === "CAN_ACCESS" && ids.has(r.targetId)) add(r.sourceId);
    }
    for (const r of records)
      if (ids.has(r.datasetId) || ids.has(r.groupId)) add(r.id);
  }
  return ids;
}
