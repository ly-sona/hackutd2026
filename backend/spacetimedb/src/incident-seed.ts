import type { Ctx } from "./index";
import type { Ports } from "./incident-domain";
// Stable scenario identifiers. Source observations are bounded claims, not hidden ground truth.
const at = (time: string) => BigInt(Date.parse(`2026-11-07T${time}:00-06:00`));

// Match only unchanged, known initial fixtures, never responder-created events.
export function isInitialFixtureEvent(event: {
  incidentId: string; type: string; title: string; createdAt: bigint;
  findingId: string; description: string;
}) {
  return scenarios.some(([inc, title, , , , , tm]) =>
    event.incidentId === inc && event.type === "incident" &&
    event.title === `Incident opened: ${title}` && event.createdAt === at(tm),
  ) || findingFixtures.some(([inc, fid, title, , , , , tm]) =>
    event.incidentId === inc && event.type === "finding" &&
    event.findingId === `${inc}:${fid}` && event.title === title && event.createdAt === at(tm),
  ) || (event.type === "evidence" && /^Evidence attached: EV-0(12|18|21|24|25|26|27|28|29|30)$/.test(event.title) &&
    event.createdAt >= at("08:00") && event.createdAt <= at("10:00")) || [
    ["IR-2041", "Responder invited", "09:08"],
    ["IR-2041", "Independent verification requested", "09:27"],
    ["IR-2042", "Owner corroboration requested", "09:03"],
    ["IR-2043", "Investigation opened", "08:43"],
  ].some(([inc, title, tm]) => event.incidentId === inc && event.title === title && event.createdAt === at(tm));
}
const scenarios = [
  [
    "IR-2041",
    "Ransomware response",
    "Ransomware",
    "Critical",
    "Customer platform",
    "Customer platform unavailable. October Customer Records (1,240 synthetic records): exposure under investigation. C-1044 access unconfirmed.",
    "09:04",
  ],
  [
    "IR-2042",
    "Administrative account review",
    "Account Compromise",
    "High",
    "Administrator A-09",
    "Suspicious sign-in; account compromise remains suspected.",
    "08:58",
  ],
  [
    "IR-2043",
    "Unauthorized access investigation",
    "Unauthorized Access",
    "Medium",
    "Customer Database",
    "Denied access attempt; successful unauthorized access has not been established.",
    "08:42",
  ],
];
const findingFixtures = [
  [
    "IR-2041",
    "F-01",
    "Database isolation reported",
    "Action report, successful containment not established.",
    "Response action",
    "High",
    "Suspected",
    "09:18",
    "maya",
    "alex",
    "Customer Database",
  ],
  [
    "IR-2041",
    "F-02",
    "Outbound traffic observed",
    "Traffic after the reported isolation; source and cause need verification.",
    "Observation",
    "Critical",
    "Suspected",
    "09:21",
    "alex",
    "alex",
    "Customer Database",
  ],
  [
    "IR-2041",
    "F-03",
    "Possible customer exfiltration",
    "An unusual transfer occurred. Contents remain unknown; database access does not prove all records were accessed.",
    "Data impact",
    "Critical",
    "Suspected",
    "09:22",
    "alex",
    "priya",
    "October Customer Records",
  ],
  [
    "IR-2041",
    "F-04",
    "Conflicting containment reports",
    "09:18 isolation report and 09:21 traffic observation both require review. Manually seeded investigation flag.",
    "Investigation",
    "High",
    "Unverified",
    "09:26",
    "maya",
    "alex",
    "Customer Database",
  ],
  [
    "IR-2041",
    "F-05",
    "Independent containment verification pending",
    "No independent connectivity check has completed.",
    "Verification",
    "High",
    "Unverified",
    "09:28",
    "alex",
    "alex",
    "Customer Database",
  ],
  [
    "IR-2041",
    "F-06",
    "Customer platform availability impact",
    "Availability interruption reported. Encryption does not establish exfiltration.",
    "Business impact",
    "High",
    "Suspected",
    "09:12",
    "jordan",
    "jordan",
    "Customer platform",
  ],
  [
    "IR-2042",
    "F-07",
    "Suspicious administrator sign-in",
    "Unusual source for account A-09. Owner corroboration pending.",
    "Account activity",
    "High",
    "Suspected",
    "08:57",
    "alex",
    "alex",
    "Administrator A-09",
  ],
  [
    "IR-2042",
    "F-08",
    "Account owner review needed",
    "Independent confirmation requested; compromise remains an assessment.",
    "Verification",
    "Medium",
    "Unverified",
    "09:02",
    "maya",
    "maya",
    "Administrator A-09",
  ],
  [
    "IR-2043",
    "F-09",
    "Denied database access attempt",
    "A denied request does not demonstrate successful unauthorized access.",
    "Observation",
    "Medium",
    "Suspected",
    "08:40",
    "alex",
    "alex",
    "Customer Database",
  ],
];
export function seedScenario(
  ctx: Ctx,
  data: Record<string, unknown>,
  p: Ports,
): unknown {
  const version = "acme-phase2-v1";
  if (ctx.db.scenarioSeeds.id.find(version)) return { seeded: false };
  if (!ctx.db.organizations.id.find("acme"))
    return p.fail("INVALID_INPUT", "Bootstrap Phase 1 first.");
  // Only the service identity can reach this command. Validate the entire file manifest before any writes.
  const artifacts = data.artifacts as {
    id: string;
    storageReference: string;
    sha256: string;
    size: number;
    filename: string;
    contentType: string;
    description: string;
    source: string;
    incidentId: string;
    findingId: string;
    collectedAt: string;
    status: string;
  }[];
  const expected = [
    "EV-012",
    "EV-018",
    "EV-021",
    "EV-024",
    "EV-025",
    "EV-026",
    "EV-027",
    "EV-028",
    "EV-029",
    "EV-030",
  ];
  if (
    !Array.isArray(artifacts) ||
    artifacts.length !== 10 ||
    expected.some((id) => !artifacts.some((e) => e.id === id)) ||
    artifacts.some(
      (e) =>
        !/^[a-f0-9-]{36}$/.test(e.storageReference) ||
        !/^[a-f0-9]{64}$/.test(e.sha256) ||
        !Number.isSafeInteger(e.size) ||
        e.size < 1 ||
        e.size > 5242880 ||
        !scenarios.some((s) => s[0] === e.incidentId) ||
        !findingFixtures.some(
          (f) => `${f[0]}:${f[1]}` === e.findingId && f[0] === e.incidentId,
        ),
    )
  )
    return p.fail("INVALID_INPUT", "Invalid private artifact manifest.");
  const seededUsers = ["maya", "alex", "priya", "jordan", "sam"];
  for (const [inc, title, type, severity, systems, impact, tm] of scenarios) {
    const k = `acme:${inc}`;
    if (!ctx.db.incidents.id.find(k))
      ctx.db.incidents.insert({
        id: k,
        incidentKey: k,
        incidentId: inc,
        organizationId: "acme",
        title,
        type,
        severity,
        systems,
        impact,
        description: impact,
        status: "Investigating",
        discoveredAt: at(tm),
        createdAt: at(tm),
        updatedAt: at(tm),
        createdBy: "maya",
        commanderId: "maya",
      });
    if (!ctx.db.incidentStubs.id.find(k))
      ctx.db.incidentStubs.insert({ id: k, organizationId: "acme", title });
    for (const userId of seededUsers) {
      const id = `${k}:${userId}`;
      // Preserve existing membership state, including revocations.
      if (!ctx.db.incidentMemberships.id.find(id))
        ctx.db.incidentMemberships.insert({
          id,
          organizationId: "acme",
          incidentId: inc,
          userId,
          membershipStatus: "active",
          createdAt: ctx.timestamp,
        });
    }
  }
  for (const [
    inc,
    fid,
    title,
    description,
    category,
    priority,
    status,
    tm,
    reportedBy,
    assignedTo,
    relatedSystem,
  ] of findingFixtures) {
    const id = `${inc}:${fid}`,
      k = `acme:${inc}`;
    if (!ctx.db.findings.id.find(id))
      ctx.db.findings.insert({
        id,
        organizationId: "acme",
        incidentId: inc,
        incidentKey: k,
        title,
        description,
        category,
        priority,
        status,
        observedAt: at(tm),
        createdAt: at(tm),
        updatedAt: at(tm),
        reportedBy,
        assignedTo,
        relatedSystem,
        verifiedBy: "",
        verifiedAt: 0n,
      });
  }
  for (const e of artifacts) {
    const k = `acme:${e.incidentId}`;
    if (!ctx.db.evidence.id.find(e.id))
      ctx.db.evidence.insert({
        id: e.id,
        organizationId: "acme",
        incidentId: e.incidentId,
        incidentKey: k,
        filename: e.filename,
        contentType: e.contentType,
        size: BigInt(e.size),
        storageReference: e.storageReference,
        sha256: e.sha256,
        description: e.description,
        source: e.source,
        status: "Unverified",
        collectedAt: BigInt(Date.parse(e.collectedAt)),
        uploadedAt:
          e.id === "EV-018" ? at("09:24") : BigInt(Date.parse(e.collectedAt)),
        uploadedBy: "alex",
      });
    const linkId = `seed:${e.id}`;
    if (!ctx.db.evidenceLinks.id.find(linkId))
      ctx.db.evidenceLinks.insert({
        id: linkId,
        organizationId: "acme",
        incidentId: e.incidentId,
        incidentKey: k,
        evidenceId: e.id,
        findingId: e.findingId,
        eventId: "",
        annotation: e.description,
        excerpt: e.id === "EV-018" ? "09:21" : "",
        futureReference: "",
        createdBy: "alex",
        createdAt: BigInt(Date.parse(e.collectedAt)),
      });
  }
  // Exactly 26 immutable initial events. The version marker makes subsequent runs a no-op.
  function event(
    inc: string,
    type: string,
    title: string,
    description: string,
    tm: string,
    actor = "maya",
    findingId = "",
    evidenceIds = "[]",
    status = "Documented",
  ) {
    ctx.db.incidentEvents.insert({
      id: 0n,
      organizationId: "acme",
      incidentId: inc,
      incidentKey: `acme:${inc}`,
      type,
      actorId: actor,
      title,
      description,
      createdAt: at(tm),
      observedAt: at(tm),
      findingId,
      evidenceIds,
      status,
      previousValue: "",
      newValue: "",
      correctsEventId: "",
    });
  }
  for (const [inc, title, , , , , tm] of scenarios)
    event(
      inc,
      "incident",
      "Incident opened: " + title,
      "Synthetic initial report, not proof of downstream impact.",
      tm,
    );
  for (const [
    inc,
    fid,
    title,
    description,
    ,
    ,
    status,
    tm,
    actor,
  ] of findingFixtures)
    event(
      inc,
      "finding",
      title,
      description,
      tm,
      actor,
      `${inc}:${fid}`,
      JSON.stringify(
        artifacts
          .filter((e) => e.findingId === `${inc}:${fid}`)
          .map((e) => e.id),
      ),
      status,
    );
  for (const e of artifacts)
    event(
      e.incidentId,
      "evidence",
      "Evidence attached: " + e.id,
      e.description,
      e.id === "EV-018" ? "09:24" : e.collectedAt.slice(11, 16),
      "alex",
      e.findingId,
      JSON.stringify([e.id]),
      "Unverified",
    );
  event(
    "IR-2041",
    "access",
    "Responder invited",
    "Historical synthetic administrative invitation.",
    "09:08",
    "sam",
  );
  event(
    "IR-2041",
    "decision",
    "Independent verification requested",
    "Review traffic origin before claiming successful containment. No action was executed.",
    "09:27",
    "maya",
  );
  event(
    "IR-2042",
    "note",
    "Owner corroboration requested",
    "Suspicious activity is not yet a confirmed compromise.",
    "09:03",
    "priya",
  );
  event(
    "IR-2043",
    "status",
    "Investigation opened",
    "Denied request retained for review.",
    "08:43",
    "maya",
  );
  ctx.db.scenarioSeeds.insert({
    id: version,
    createdAt: ctx.timestamp.microsSinceUnixEpoch / 1000n,
  });
  return { seeded: true, version };
}
