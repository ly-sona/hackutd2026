// Pure coordination rules shared by the module, UI and unit tests.
export const taskStatuses = [
  "Open",
  "In Progress",
  "Awaiting Verification",
  "Completed",
  "Canceled",
] as const;
export const priorities = ["Critical", "High", "Medium", "Low"] as const;
export const availabilityStatuses = [
  "Available",
  "Busy",
  "Unavailable",
] as const;
export type Reference = {
  kind: "evidence" | "finding" | "scope" | "assessment" | "task";
  id: string;
};
export const transitions: Record<string, readonly string[]> = {
  Open: ["In Progress", "Canceled"],
  "In Progress": ["Open", "Awaiting Verification", "Canceled"],
  "Awaiting Verification": ["In Progress", "Completed", "Canceled"],
  Completed: ["In Progress"],
  Canceled: ["Open"],
};
export function canTransition(previous: string, next: string) {
  return previous === next || !!transitions[previous]?.includes(next);
}
export function orderMessages<T extends { id: string; createdAt: string }>(
  messages: readonly T[],
) {
  return [...messages].sort(
    (a, b) =>
      Number(a.createdAt) - Number(b.createdAt) ||
      (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0),
  );
}
export function attentionCount(
  tasks: readonly { id: string; status: string; relatedFindingId: string }[],
  findings: readonly { id: string; status: string }[],
) {
  const active = tasks.filter(
    (t) => !["Completed", "Canceled"].includes(t.status),
  );
  const linked = new Set(active.map((t) => t.relatedFindingId).filter(Boolean));
  return (
    active.length +
    findings.filter(
      (f) => !["Resolved", "Ruled Out"].includes(f.status) && !linked.has(f.id),
    ).length
  );
}
export function pageAckSeconds(development: boolean, configured?: string) {
  const seconds = Number(configured ?? 300);
  return development &&
    Number.isInteger(seconds) &&
    seconds >= 5 &&
    seconds <= 300
    ? seconds
    : 300;
}
