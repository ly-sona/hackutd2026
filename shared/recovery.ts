// Pure workflow/approval rules. Infrastructure actions remain deterministic simulations.
export const restrictionStates = [
  "Do Not Use",
  "Use With Caution",
  "Available",
] as const;
export const operatingStates = [
  "Operational",
  "At Risk",
  "Restricted",
  "Disrupted",
  "Recovering",
] as const;
export const recoveryStates = [
  "Running",
  "Awaiting Approval",
  "Executing",
  "Awaiting Verification",
  "Succeeded",
  "Failed",
  "Canceled",
  "Fallback Active",
] as const;
export const approvalPolicies = {
  technical_recovery: {
    name: "Restore isolated capability",
    sensitivity: "High",
    roles: ["analyst", "commander"],
  },
  sensitive_access: {
    name: "Access sensitive customer records",
    sensitivity: "High",
    roles: ["analyst", "commander"],
  },
  non_sensitive_access: {
    name: "Access non-sensitive records",
    sensitivity: "Medium",
    roles: ["analyst", "commander"],
    anyRole: true,
  },
  sensitive_export: {
    name: "Export sensitive customer data",
    sensitivity: "Critical",
    roles: ["commander", "legal"],
  },
  recovered_data: {
    name: "Mark compromised data recovered",
    sensitivity: "High",
    roles: ["analyst", "commander"],
  },
  close_incident: {
    name: "Close major incident",
    sensitivity: "Critical",
    roles: ["commander", "analyst"],
  },
  operational_decision: {
    name: "Emergency operational decision",
    sensitivity: "High",
    roles: ["commander", "operations"],
  },
} as const;
export type ApprovalPolicy = keyof typeof approvalPolicies;
export function policySatisfied(
  policy: ApprovalPolicy,
  requester: string,
  decisions: readonly {
    userId: string;
    role: string;
    decision: string;
    eligible: boolean;
  }[],
) {
  const spec = approvalPolicies[policy];
  const approved = decisions.filter(
    (d) => d.eligible && d.decision === "Approve" && d.userId !== requester,
  );
  if (new Set(approved.map((d) => d.userId)).size !== approved.length)
    return false;
  if ("anyRole" in spec)
    return approved.some((d) =>
      (spec.roles as readonly string[]).includes(d.role),
    );
  return spec.roles.every((role) => approved.some((d) => d.role === role));
}
export function trustCategory(
  explicit: string | undefined,
  hasDependencyRisk: boolean,
) {
  if (explicit === "Do Not Use") return "Do Not Use";
  return explicit === "Use With Caution" || hasDependencyRisk
    ? "Use With Caution"
    : "Available";
}
export const recoveryTransitions: Record<string, readonly string[]> = {
  Running: ["Awaiting Approval", "Failed", "Canceled"],
  "Awaiting Approval": ["Executing", "Failed", "Canceled"],
  Executing: ["Awaiting Verification", "Failed", "Canceled"],
  "Awaiting Verification": [
    "Succeeded",
    "Fallback Active",
    "Failed",
    "Canceled",
  ],
  "Fallback Active": ["Canceled"],
  Succeeded: [],
  Failed: [],
  Canceled: [],
};
export const canRecoverTransition = (from: string, to: string) =>
  !!recoveryTransitions[from]?.includes(to);
export const reportTypes = [
  "Executive Summary",
  "Detailed Incident Report",
] as const;
export const attackVectors = [
  "Unknown",
  "Phishing",
  "Exploitation",
  "Stolen credentials",
  "Malware",
  "Insider misuse",
  "Other",
] as const;
export const actorCategories = [
  "Unknown",
  "External",
  "Internal",
  "Partner",
  "Multiple",
] as const;
export const actionCategories = [
  "Unknown",
  "Malware",
  "Hacking",
  "Social",
  "Misuse",
  "Error",
  "Physical",
  "Environmental",
] as const;
export const techniqueCatalog = {
  T1078: "Valid Accounts",
  T1486: "Data Encrypted for Impact",
  T1041: "Exfiltration Over C2 Channel",
  T1190: "Exploit Public-Facing Application",
  "T1059.001": "PowerShell",
} as const;
export const reportSourcePermissions = [
  "reports:export",
  "scope:view",
  "scope:records",
  "evidence:view",
  "messages:view",
] as const;
export interface CompletenessCheck {
  label: string;
  status:
    | "Documented"
    | "Missing"
    | "Unverified"
    | "Not Yet Established"
    | "Not Applicable";
  detail: string;
  section: string;
}
export interface ReportSection {
  id: string;
  title: string;
  fields: { label: string; value: string }[];
  tables: { title: string; columns: string[]; rows: string[][] }[];
}
export interface ReportSnapshot {
  reportId: string;
  type: string;
  version: number;
  generatedAt: string;
  sourceCutoff: string;
  generatedBy: string;
  organizationId: string;
  organizationName: string;
  incidentId: string;
  incidentTitle: string;
  audience: string;
  confidentiality: string;
  sections: ReportSection[];
  completeness: CompletenessCheck[];
  sourceIds: Record<string, string[]>;
  standards: { name: string; url: string; use: string }[];
}
export const reportingStandards = [
  {
    name: "NIST SP 800-61 Rev. 3",
    url: "https://csrc.nist.gov/pubs/sp/800/61/r3/final",
    use: "Incident response and recovery organization; not certification.",
  },
  {
    name: "VERIS",
    url: "https://verisframework.org/",
    use: "Selected actor, action, asset and attribute classification concepts; not full schema compatibility.",
  },
  {
    name: "MITRE ATT&CK",
    url: "https://attack.mitre.org/",
    use: "Optional human-selected technique identifiers; no inferred attribution.",
  },
  {
    name: "NIST SP 800-86",
    url: "https://csrc.nist.gov/pubs/sp/800/86/final",
    use: "Evidence sources, collection metadata and integrity; no complete forensic custody claim.",
  },
  {
    name: "CISA incident reporting",
    url: "https://www.cisa.gov/sites/default/files/2023-01/Federal_Incident_Notification_Guidelines.pdf",
    use: "Discovery, operational impact and response fields; no regulatory submission or legal determination.",
  },
];
