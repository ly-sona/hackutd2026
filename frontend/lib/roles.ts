export const roleLabels: Record<string, string> = {
  administrator: "Administrator",
  commander: "Incident Commander",
  analyst: "Security Analyst",
  legal: "Legal/Compliance",
  operations: "Business Operations",
};
export const incidentBase = (organizationId: string, incidentId = "IR-2041") =>
  `/org/${organizationId}/incidents/${incidentId}`;

export const sections = [
  "overview",
  "scope",
  "operations",
  "team",
  "timeline",
] as const;
