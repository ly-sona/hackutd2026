# Phase 5: trust, recovery and defensible reports

AEGIS retains the five reference screens. Overview adds operation status and report entry; Scope shows an entity's trust basis and links to Operations. Operations uses persisted request, decision and workflow records. Team reuses the existing investigation tasks. Timeline includes trust, approval, recovery, classification, legal-review and report events plus historical artifacts. Replay remains deferred.

## Three demonstration flows

1. Sign in as **Jordan**, open Operations, and start **Restore Customer Support Capability** with a reason. Inspect the Customer Database warning and open original **EV-018** as an evidence-authorized responder. Alex and Maya separately review and approve the new request; the requester cannot self-approve, and administrator access does not substitute for the required analyst and commander roles. The database scheduler runs the predefined simulation and records verification evidence. The default fixture fails integrity verification. Request **Activate Temporary Customer Support Access**, select Jordan, obtain fresh analyst and commander approvals, then open the three-record read-only subset as Jordan. Original Customer Database restrictions, scope assessments, the incident and investigation tasks remain independent. Maya can cancel/revoke; grants expire after one hour.
2. As Maya, Alex or Priya, open **Generate report** from Overview or Timeline. Review completeness and the eight sections, select Executive Summary or Detailed Incident Report, and generate an immutable HTML artifact. Maya/Priya can optionally include restricted legal review; doing so requires legal permission on every subsequent download. Open the saved version and use browser Print / Save as PDF. Unknown fields do not block interim reports.
3. Save a report, add evidence and a human-verified finding using the existing Phase 2 flow, and generate another report. Both versions remain downloadable. The prior artifact's bytes, SHA-256, source cutoff, source identifiers and author remain unchanged.

Local outcome control is a trusted CLI fixture, never an HTTP endpoint or ordinary UI toggle:

```bash
npm run demo:recovery -- --outcome=success
# Start a NEW primary execution and obtain fresh approvals.
npm run demo:recovery -- --outcome=failure
```

Changing the profile affects only future primary executions. It does not rewrite history, original evidence or active executions. A retry creates a new execution and approval request linked to the failed attempt. The primary and fallback templates are fixed version 1 definitions, not uploaded playbooks or a general workflow builder.

## Trust and recovery semantics

Trust restrictions are incident-specific sidecars to existing graph entities. Explicit authorized evidence-backed restrictions can say **Do Not Use**. Deterministic assessment/dependency warnings say **Use With Caution**, never automatically confirm downstream compromise. **Available** means no known current usage restriction, not verified safe. Operational status, normal-route trust, compromise/impact assessments and fallback readiness are separate dimensions.

The original inventory remains 1,240 customer references. Reports and Overview use the existing deduplicated scope calculations: inventory, potential exposure and individually confirmed impact are different counts. Restoring an alternate capability never marks the original records recovered or changes their encryption/exfiltration/alteration/deletion/availability assessments.

`recovery.*` commands use the trusted session boundary. Successful mutations have per-actor stable operation UUIDs, append actual incident events and use Phase 4 tasks. Every decision checks current organization/incident membership, role, self-approval, duplicate decision, expiry and revision. The procedure version and immutable parameters bind beneficiaries, subset, read-only policy and one-hour lifetime. A conservative snapshot of incident assessments, graph relationships and trust restrictions invalidates pending work after material context changes. Execution rechecks current requester and approver eligibility.

The existing one-second internal SpacetimeDB schedule owns execution, not a browser timer or another service. Durable steps progress through Running → Awaiting Approval → Executing → Awaiting Verification → Succeeded / Failed / Fallback Active. Failure preserves restrictions and work history. Human investigation/task verification remains separate from a simulated capability check. Canceling preserves records and revokes active fallback access. Incident closure requires a separate evidence-backed request, analyst and commander approval, and an unchanged incident version; changing status directly to Closed cannot bypass this boundary.

The fallback table contains three independently stored synthetic support records (SAFE-001–003), not a filtered query of the original 1,240-record inventory. A fresh service-gated query validates current membership, an active per-user grant, exact read-only policy, execution state, revocation and expiry. There is no mutation/export endpoint for that subset. Scheduled expiry removes access and updates readiness.

## Report snapshots and confidentiality

A service-gated read produces a preview/completeness review. Generation reserves the next incident version and captures a consistent structured snapshot in one database transaction. Large immutable bodies live in a separate private snapshot table; live report-history subscriptions read only metadata. Additive bootstrap migration moves earlier bodies byte-for-byte and preserves every version and artifact. Node renders escaped, script-free, white-background printable HTML; the existing private original-byte store writes a random UUID file with restrictive permissions. Commit records the artifact hash/size and appends one generation event. A durable operation UUID makes retries resume the same reservation and deterministic bytes. Failed storage/commit does not claim successful generation. Pending preparations expose Resume version to finish the same reserved snapshot after interruption and are not downloadable as completed artifacts.

Saved artifacts never rebuild from current rows. Download checks the current session, incident and all captured source permissions before and after file I/O, verifies SHA-256 and uses no-store, a restrictive CSP and authorized routes. There are no public file URLs or filesystem paths in browser projections. Both formats require reports:export, scope:view, scope:records, evidence:view and messages:view; Executive Summary is a concise format, not a broader audience permission. Organization administrators can export artifacts using their full source permissions; Operations cannot export full incident artifacts. Private conversations and their derived findings, tasks and events are excluded from incident-wide reports even for participating generators. Legal material adds legal:view and is never automatically designated privileged.

The detailed report has eight sections: identification; discovery/detection; classification; scope/impact; response/recovery; evidence; audit/findings/closure; legal/regulatory considerations. Both formats preserve the incident's reported affected systems and business-impact narrative independently of graph inventory. Missing narratives are explicitly marked, and an empty graph states that scope is not yet established; zero graph counts do not establish absence of impact. Completeness states are Documented, Missing, Unverified, Not Yet Established and Not Applicable. There is no arbitrary percentage. Classification supports explicit Unknown values and optional recognized human-selected ATT&CK mappings linked to shared findings/evidence. Optional technique mappings currently accept findings without conversation provenance; the selector uses real source metadata, never identifier naming, and the backend enforces that boundary. Root cause and lessons learned remain unknown until entered by an authorized responder.

Standards inform selected fields and organization only:

- [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final): response and recovery structure.
- [VERIS](https://verisframework.org/): selected actor, action, asset and impact concepts; not full-schema compatibility.
- [MITRE ATT&CK](https://attack.mitre.org/): a small curated technique vocabulary; no inferred attribution.
- [NIST SP 800-86](https://csrc.nist.gov/pubs/sp/800/86/final): evidence metadata and preservation concepts, not forensic certification.
- [CISA reporting field guidance](https://www.cisa.gov/sites/default/files/2023-01/Federal_Incident_Notification_Guidelines.pdf): discovery, impact and response fields; no submission or legal deadline engine.

## Boundaries and local storage

All added tables are private. `visible_recovery_data` projects authorized operational data, with technical evidence references and restricted legal/report metadata filtered by source permission. Safe subset rows, fixture outcomes, private artifact descriptors and report snapshot bodies are never full browser subscriptions. The generated SDK bindings stay separate from handwritten code.

`acme-phase5-v1` is additive and idempotent. The `acme-phase5-sso-trust-v1` extension adds only a missing precaution on the existing ID-SSO entity, using original EV-018 as an incident trigger; it never asserts SSO compromise or overwrites an existing user restriction. It preserves accounts, expiration, Phase 2 originals, EV-018, the original Customer Database entity and user work. Its verification originals and mapping are ignored private files under `EVIDENCE_STORAGE_DIR`; no new environment variable or dependency is required. The existing read-state-only demo reset remains narrow.

Real infrastructure restoration, production database recovery, payment execution, SMS, automated sanitization, ML, automatic legal determinations, regulatory submission, full forensic custody certification and historical replay remain outside this MVP. Local standalone availability/storage are not production resilience guarantees.


Private tables: `trust_restrictions`, `business_operations`, `recovery_templates`, `recovery_executions`, `recovery_steps`, `approval_requests`, `approval_decisions`, `fallback_access`, `safe_support_records`, `recovery_fixtures`, `recovery_simulation_state`, `recovery_execution_internals`, `recovery_operations`, `incident_reporting_metadata`, `legal_reviews`, `incident_reports`, `report_snapshots`. The caller-scoped view is `visible_recovery_data`; the service-only procedure is `recovery_read`. Normal HTTP actions are start, decide, cancel, trust, classification, legal, close, fallback.records, report.preview, report.generate and report.resume. Seed, fixture selection, report reservation/commit/descriptors and test expiry remain trusted internal operations. Shared backend ID allocation uses sortable SDK UUIDs plus persisted uniqueness checks; it preserves all old identifiers.
