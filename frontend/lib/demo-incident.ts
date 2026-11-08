// Synthetic incident content only. Security state is never derived from this fixture.
export interface IncidentFixture {
  id: string;
  organization: string;
  title: string;
  severity: "Critical";
  summary: string;
  operations: {
    name: string;
    impact: string;
    systems: number;
    status: string;
  }[];
  evidence: { id: string; title: string; source: string }[];
  timeline: {
    id: string;
    time: string;
    title: string;
    detail: string;
    severity: "critical" | "warning" | "info";
    actor: string;
    label: string;
  }[];
}
export const demoIncident: IncidentFixture = {
  id: "IR-2041",
  organization: "Acme",
  title: "Ransomware response",
  severity: "Critical",
  summary:
    "Customer platform · Opened November 7 at 09:04 CST · Synthetic incident",
  operations: [
    {
      name: "Customer support",
      impact: "Customer database access restricted",
      systems: 2,
      status: "Restricted",
    },
    {
      name: "Vendor purchasing",
      impact: "Independent approval route available",
      systems: 1,
      status: "Fallback available",
    },
  ],
  evidence: [
    {
      id: "EV-018",
      title: "Network traffic log",
      source: "Synthetic network export",
    },
    {
      id: "EV-011",
      title: "Corporate SSO dependency",
      source: "Synthetic purchasing record",
    },
  ],
  timeline: [
    {
      id: "event-1",
      time: "09:08",
      title: "Response planning started",
      detail:
        "The synthetic response plan establishes independent coordination for the incident. Actual access changes are recorded separately under Manage members.",
      severity: "info",
      actor: "Sam Patel",
      label: "Planning example",
    },
    {
      id: "event-2",
      time: "09:18",
      title: "Database isolation reported",
      detail:
        "An isolation report was recorded for the Customer Database. The report has not been technically verified.",
      severity: "warning",
      actor: "Priya Shah",
      label: "Not yet verified",
    },
    {
      id: "event-3",
      time: "09:24",
      title: "New network evidence",
      detail:
        "Synthetic network traffic log EV-018 describes outbound traffic observed at 09:21, after the reported isolation time.",
      severity: "warning",
      actor: "Alex Rivera",
      label: "EV-018",
    },
    {
      id: "event-4",
      time: "09:25",
      title: "First purchase approval",
      detail:
        "In this fictional approval example, Priya Shah has reviewed OP-008. The application has not executed an approval or payment.",
      severity: "info",
      actor: "Priya Shah",
      label: "1 of 2 reviews · Demo",
    },
    {
      id: "event-5",
      time: "09:26",
      title: "Containment reports conflict",
      detail:
        "The sample isolation report and network traffic log disagree. Containment is not yet verified. This warning is a fixed fixture, not a live contradiction-detection result.",
      severity: "critical",
      actor: "Synthetic assessment",
      label: "Verification needed",
    },
  ],
};
export const demoRequests = [
  {
    id: "OP-008",
    title: "Recovery hardware",
    requester: "Alex Rivera",
    status: "Your approval needed",
    impact: "Replacement hardware to restore the customer platform.",
    description: "Replacement hardware to restore the customer platform.",
    amount: "$4,800",
    type: "Vendor purchase",
    participants: ["Priya Shah", "Maya Chen"],
  },
  {
    id: "OP-009",
    title: "Temporary support access",
    requester: "Jordan Davis",
    status: "In review",
    impact: "Customer support continuity",
    description:
      "Assess temporary independent access for customer support while affected services remain restricted.",
    amount: "—",
    type: "Continuity access",
    participants: ["Maya Chen", "Jordan Davis"],
  },
  {
    id: "OP-007",
    title: "Backup storage extension",
    requester: "Alex Rivera",
    status: "Authorized example",
    impact: "Evidence retention capacity",
    description:
      "A synthetic example of a previously authorized storage request. No action was performed by AEGIS.",
    amount: "—",
    type: "Storage request",
    participants: ["Maya Chen", "Alex Rivera"],
  },
];
