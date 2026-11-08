export { roleLabels } from "../../shared/roles";

export const incidentBase = (organizationId: string, incidentId = "IR-2041") =>
  `/org/${organizationId}/incidents/${incidentId}`;

export const sections = [
  "overview",
  "scope",
  "operations",
  "team",
  "timeline",
] as const;
