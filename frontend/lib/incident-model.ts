export interface Incident {
  id: string;
  organizationId: string;
  incidentId: string;
  title: string;
  description: string;
  type: string;
  severity: string;
  status: string;
  systems: string;
  impact: string;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  commanderId: string;
}
export interface Finding {
  id: string;
  organizationId: string;
  incidentId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
  reportedBy: string;
  assignedTo: string;
  relatedSystem: string;
  verifiedBy: string;
  verifiedAt: string;
}
export interface IncidentEvent {
  originalObservedAt?: string;
  originalRecordedAt?: string;
  timingCorrectionId?: string;
  timingCorrectedAt?: string;
  id: string;
  organizationId: string;
  incidentId: string;
  type: string;
  actorId: string;
  title: string;
  description: string;
  createdAt: string;
  observedAt: string;
  findingId: string;
  evidenceIds: string;
  status: string;
  previousValue: string;
  newValue: string;
  correctsEventId: string;
}
export interface Evidence {
  id: string;
  organizationId: string;
  incidentId: string;
  filename: string;
  contentType: string;
  size: string;
  sha256: string;
  description: string;
  source: string;
  status: string;
  collectedAt: string;
  uploadedAt: string;
  uploadedBy: string;
}
export interface EvidenceLink {
  id: string;
  evidenceId: string;
  findingId: string;
  eventId: string;
  annotation: string;
  excerpt: string;
  futureReference: string;
}
export interface FindingRead {
  id: string;
  findingId: string;
  readAt: string;
}
export const severities = ["Critical", "High", "Medium", "Low"];
export const incidentStates = [
  "Open",
  "Investigating",
  "Contained",
  "Recovering",
  "Resolved",
  "Closed",
];
export const findingStates = [
  "Unverified",
  "Suspected",
  "Confirmed",
  "Resolved",
  "Ruled Out",
];
export const incidentTypes = [
  "Ransomware",
  "Unauthorized Access",
  "Data Breach",
  "Account Compromise",
  "Malware",
  "Other",
];
export function unresolved(f: Finding) {
  return !["Resolved", "Ruled Out"].includes(f.status);
}
export function isUnread(f: Finding, reads: readonly FindingRead[]) {
  const r = reads.find((r) => r.findingId === f.id);
  return !r || BigInt(r.readAt) < BigInt(f.updatedAt);
}
export function sortEvents(events: readonly IncidentEvent[]) {
  return [...events].sort(
    (a, b) =>
      Number(BigInt(b.createdAt) - BigInt(a.createdAt)) ||
      (BigInt(b.id) > BigInt(a.id) ? 1 : -1),
  );
}
export function incidentTime(ms: string | number, full = true) {
  const timestamp = Number(ms);
  if (!timestamp || !Number.isFinite(new Date(timestamp).getTime()))
    return "Not provided";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(timestamp);
  if (!full) return time;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
  return `${date} at ${time}`;
}
export function businessContinuityStatus(events: IncidentEvent[], entityId: string) {
  for (const event of sortEvents(events)) {
    try {
      const value = JSON.parse(event.newValue || "{}");
      if (value.scopeEntityId === entityId &&
        ["Restricted", "Fallback available"].includes(value.businessStatus)) return value.businessStatus as string;
    } catch { /* Historical event values may be plain text. */ }
  }
  return undefined;
}
export const localDateValue = (ms = Date.now()) => {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function highlightExcerpt(text: string, excerpt: string) {
  if (!excerpt) return [text];
  const index = text.indexOf(excerpt);
  return index < 0
    ? [text]
    : [text.slice(0, index), excerpt, text.slice(index + excerpt.length)];
}
