# AEGIS implementation plan: simulated connectors and agentic investigation

Status: planning only; application changes have not been implemented.

Preserve IR-2041 and the completed five-screen application. New incidents use a dedicated incident-scoped Investigation workspace to collect versioned synthetic plain-text snapshots, inspect deterministic results, run one bounded agent, and review its proposals. Existing backend workflows progressively populate the current Overview, Scope, Operations, Team, and Timeline; no screen waits for model availability.

Use three sequential implementation additions: **A — Incident Intake & Deterministic Processing**, **B — Agentic Investigation & Human Review**, and **C — Continuous Reassessment & Response Integration**. These additions extend completed Phases 1–5; they do not replace them. Implement and validate one addition at a time. Addition A establishes actual inputs and comparisons before Addition B introduces model reasoning; Addition C builds on their persisted provenance and review decisions.

Every unchecked item below is implementation work, not a claim of existing functionality. Item identifiers provide stable references for implementation and review. Validation items define required coverage, not instructions to rerun every test after every edit; use the change-based cadence in Section 10.

Deliver each cohesive batch through its own branch and PR targeting `main`. The planning batch uses `codex/agentic-investigation-plan`, branched from the current `main`. For each later batch, fetch and branch from the latest merged `main` using a descriptive `codex/` name; merge its prerequisite before starting a dependent batch rather than stacking unrelated work. Default implementation batches are Addition A, Addition B, and Addition C; split an addition into smaller independently reviewable PRs when needed, preserving its acceptance gate. Do not begin an implementation addition merely because this plan or its PR exists.

Keep each PR limited to its batch, record the focused checks actually executed and any deferred milestone checks, and create the PR after the batch is concrete and reviewable. Commit/push only the intended files; never include credentials, private fixture state, originals, or test artifacts. Creating a PR does not authorize merging it. Do not mix later-addition work into an earlier batch or repeatedly run the entire suite merely to update a PR.

## 1. Product decisions and fixed scope

- [ ] P-01 Preserve IR-2041 as the established reference case, including its actual lifecycle state, unresolved assessments, evidence originals, graph, coordination, recovery history, and report versions.
- [ ] P-02 Preserve all six responder accounts, credentials, functional roles, temporary membership expiry, incident assignments, and existing permission boundaries.
- [ ] P-03 Keep SpacetimeDB as the authoritative database for both reference and investigation incidents; do not create another database or duplicate the existing incident systems.
- [ ] P-04 Use a dedicated incident Investigation workspace for simulated connector selection, source inspection, processing details, and proposal review; keep Overview as the existing command dashboard.
- [ ] P-05 Present connectors as simulated collection sources that obtain plain-text snapshots; implement collection by reading versioned synthetic fixture bytes on the server.
- [ ] P-06 Include a concise **Simulated connectors · Synthetic data** designation in the Investigation workspace; do not claim that real corporate systems were contacted.
- [ ] P-07 Make acquisition simulated while keeping parsing, hashing, comparisons, progress persistence, authorization, and evidence references functional and derived from actual fixture bytes.
- [ ] P-08 Keep human approval for confirmed findings, scope confirmations, assignment/paging decisions, trust restrictions, sensitive data access, recovery, and incident closure.
- [ ] P-09 Keep existing authorized evidence preview and report download capabilities. They are existing product features, not the new connector intake mechanism.
- [ ] P-10 Do not require uploads, pasted data, external credentials, OAuth, collection agents on corporate hosts, network scans, or external service availability for connector acquisition.
- [ ] P-11 Keep existing organization selection, login, New Incident form and redirect, five primary tabs, incident selector, member administration, and invitation screens unchanged.
- [ ] P-12 Identify IR-2041 as Established Case in its metadata and, if needed, the permitted compact Overview status area; add no selector grouping, processing gate, or collection action for the reference.
- [ ] P-13 Let new incidents start with existing sparse dashboard data and progressively populate through validated collection and reviewed findings; never copy IR-2041 conclusions, inventory counts, coordination, approvals, or reports into them.
- [ ] P-14 Treat selected domains and incident descriptions as reported investigation context, not evidence that every associated system or record is compromised.

## 2. UI contract: preserve five screens; use a dedicated Investigation workspace

**Decision:** the new workflows are substantial, so implement `/org/[orgId]/incidents/[incidentId]/investigation` as a contextual page. Put connector setup, source/version inspection, detailed processing and errors, comparisons, and proposal review there. Keep Overview as the existing incident command center before, during, and after analysis.

Apply the UI change hierarchy in order: reuse existing backend contracts/components; add minimal contextual controls/status; place substantial workflows in Investigation; modify an existing layout only if those approaches cannot satisfy a requirement and the specific integration need is documented. This plan requires no existing-screen layout redesign.

| Surface | Planned integration and justification | Required preservation |
| --- | --- | --- |
| Overview | One contextual Start/Open Investigation action and compact accurate stage/review status, needed to discover the new workspace; use existing sparse/empty content initially | Current dashboard layout, sections, existing controls, data interactions, and continuous availability |
| Investigation — new | Connector setup, sources/versions, deterministic results, model/tool details, failures/retries, proposals and review; substantial workflows belong here | Existing design tokens/components, authentication boundaries, clear Back to incident dashboard link |
| Scope | Validated source inventory and reviewed relationships through current data contracts | Graph, browser, filters, detail panels, forms, and evidence interactions |
| Operations | Supported backend bindings, warnings, recommendations, readiness, approval context, and report data | Existing approvals, recovery, fallback, and reporting UI and behavior |
| Team | Human-reviewed work through existing tasks, references, and notifications | Rooms, DMs, messages, tasks, paging, and availability interactions |
| Timeline | Collection/analysis/review/reassessment through current events and evidence links | Existing layout, filters, detail panel, interactions, and report history |
| Entry/access/navigation | Authorized list data only; no new entry form or navigation architecture | Organization selection, New Incident form/redirect, selector, five tabs, membership and invitation screens |

The route is a static `investigation/page.tsx` sibling of the existing `[section]/page.tsx`, under the existing `[orgId]/incidents/[incidentId]` folders. Do not add `investigation` to the five-item `sections` array. A small new server wrapper can reuse `requireAccess`, `WorkspaceProvider`, required existing data providers, and `WorkspaceShell section="overview"` unchanged, treating Investigation as contextual to Overview; use a clear local page title and Back link. Keep `workspace-route.tsx` and the existing dynamic section route untouched unless a narrowly documented integration issue makes a minimal wiring change necessary. Use the installed Next.js App Router documentation and existing async route-param convention.

- [ ] U-01 Reuse the existing New Incident form and redirect to Overview; provide a contextual Start Investigation link there rather than changing the form or entry navigation.
- [ ] U-02 Default new incident metadata to investigation mode in the backend without adding fields to that form.
- [ ] U-03 Render the established IR-2041 dashboard immediately and preserve its existing functionality; automated connector/run creation remains unavailable for this protected case.
- [ ] U-04 Keep the current Overview layout for new incidents, using existing empty/initializing content plus a prominent contextual Start Investigation action; never replace it with a wizard.
- [ ] U-05 Put connector selection and Start analysis in the dedicated Investigation workspace; expose actions according to current permissions and show an assigned-responder requirement when the viewer cannot initiate work.
- [ ] U-06 Show per-source collection details, real counters, comparisons, model/tool stages, exclusions, retries, and actionable errors in Investigation; keep Overview to a compact summary and contextual link.
- [ ] U-07 Derive all progress from committed backend work; do not use fabricated percentages, timed animations as progress, or browser-owned processing loops.
- [ ] U-08 Preserve all five existing tabs and their functionality at every processing stage; Investigation is a contextual incident route, not a permanent sixth tab.
- [ ] U-09 Keep Overview accessible before collection, during deterministic work, and during agent execution; progressively publish valid registered inventory/evidence and finalized deterministic summaries without waiting for model completion.
- [ ] U-10 Let an authorized responder retry or explicitly exclude a failed source in Investigation; persist partial coverage and the excluded source, never counting exclusion as successful collection.
- [ ] U-11 Keep Overview usable when collection or model processing fails; preserve prior valid data and show concise status/link, with detailed failure and recovery controls in Investigation.
- [ ] U-12 Display Collection Complete, Deterministic Analysis Complete, and Agent Investigation Complete independently; track Findings awaiting human review separately from execution and never label an unavailable/failed agent complete.
- [ ] U-13 Keep all proposal details, citations, differences, and Accept/Reject controls in Investigation; Overview continues to display ordinary authoritative findings and may link to pending review.
- [ ] U-14 Keep the dashboard visible during both initial and subsequent collection/analysis; add no completion-gated dashboard switch or results wizard.
- [ ] U-15 Reconstruct workspace stages, checkpoints, failures, and review state from persisted data across refresh, browser closure, natural session expiry, and later authenticated access.
- [ ] U-16 Distinguish No anomalies detected, No baseline available, Insufficient evidence, Partial collection, Agent unavailable/incomplete/failed, Investigation complete, and Findings awaiting human review in Investigation, with a concise accurate Overview summary.
- [ ] U-17 Keep restricted source fields out of summaries visible to responders lacking the corresponding evidence or record permissions.
- [ ] U-18 Compare desktop/mobile baselines for the five existing screens; permit only the justified Overview contextual entry/status and different authorized data, preserving all existing layouts and interactions.

## 3. Connector catalog and synthetic collection contract

Implement a shared simulated collector with record/event input families. **P0 is required for A; P1 is the secondary scenario, completed after P0 and by final C; P2 is optional.** Every implemented connector must process meaningful actual fixture rows. Unimplemented catalog entries are Planned/Unavailable, cannot be queued, and never return decorative success.

| Priority | Connector domain | Plain-text snapshot contents | Relevant deterministic checks |
| --- | --- | --- | --- |
| P0 | Customer Records / CRM | Synthetic customer references, contact fields, category, service ownership | Field differences, new/missing entries, account-event correlation |
| P0 | Identity and Access | Account references, role membership, sign-in events, source IDs | Role changes, unusual access, reported-window activity |
| P0 | Network Activity | Synthetic endpoints, session/account references where present, bytes, timestamps | Traffic after reported containment, unusual transfers |
| P0 | Business Services and Dependencies | Service references, owners, dependencies, reported state | Dependency changes, inconsistent service reports, potential impact paths |
| P1 | HR Records | Employee references, department, role/status, approved change references | Unexpected changes, inconsistent IDs, missing entries |
| P1 | Payroll | Payroll references, pay period, amount, fictional destination token, approval reference | Amount/token changes, duplicates, missing approvals |
| P2 — optional | Vendor and purchasing records | Vendor/request references, approval state, fictional payment tokens | Vendor changes and approval inconsistencies |
| P2 — optional | Finance records | Invoice/ledger references, amount/currency, posting state | Duplicate references and unexpected changes |
| P2 — optional | Email audit activity | Synthetic message metadata, mailbox/rule events | Forwarding-rule changes and unusual access |
| P2 — optional | Documents and file shares | Metadata, hashes, permissions, access references | Hash/permission changes and access observations |
| P2 — optional | Endpoint and server activity | Host references, processes, service state, events | Unexpected processes and service interruption |
| P2 — optional | Backups and recovery inventory | Backup references, times, hashes, verification metadata | Staleness, listed-artifact changes, missing verification |

- [ ] K-01 Give each catalog entry a stable ID, priority P0/P1/P2, version, name, description, implementation availability, relevant system mapping, and permissions; implemented entries also declare their supported schema.
- [ ] K-02 Use domain names rather than implying integrations with specific commercial vendors.
- [ ] K-03 For every implemented connector, supply versioned baseline, initial, and later snapshots with actual parsing, comparison, relevant anomaly rules, provenance, and tests; planned entries require no placeholder success fixtures.
- [ ] K-04 Use UTF-8 JSON for record exports and JSON or documented text logs for event exports; these are plain-text snapshots and already fit the evidence store's supported formats.
- [ ] K-05 Omit CSV support from this MVP because connectors control their output and JSON avoids adding another parser and evidence MIME type.
- [ ] K-06 Return actual collection bytes plus source identity, schema version, declared coverage, collection timestamp, and baseline/predecessor references.
- [ ] K-07 Resolve fixture paths only through an allowlisted server manifest; never accept paths, URLs, arbitrary filenames, or model-provided source locations.
- [ ] K-08 Freeze the selected fixture revision when collection is queued; a retry of the same operation must not select a newer revision silently.
- [ ] K-09 Advance a connector's collection revision only through the persisted source cursor and a new authorized collection request.
- [ ] K-10 Keep fixture availability/revision separate from successful ingestion so crashes do not skip a batch or consume a snapshot twice.
- [ ] K-11 Deduplicate exact retries by source, revision, digest, and operation identity while retaining explicit collection attempts and outcomes.
- [ ] K-12 Permit initial domain selection and later connector registration through Investigation; prevent selection/queuing of Planned or Unavailable entries in both UI and backend.
- [ ] K-13 Do not infer that a newly selected connector is reachable, complete, trusted, or compromised; persist its actual simulated collection result.
- [ ] K-14 Store baselines as preserved evidence with explicit provenance-review state. A fixture's baseline label alone must not produce a verified-safe conclusion.
- [ ] K-15 Keep all sample personal, payroll, payment, document, and account values synthetic; use fictional tokens and reserved example addresses.
- [ ] K-16 Fully implement the four P0 connectors for the customer-service ransomware scenario before Addition A passes: Customer Records / CRM, Identity and Access, Network Activity, and Business Services and Dependencies.
- [ ] K-17 Implement the two P1 connectors, HR Records and Payroll, after P0 validation, either late in A or during C; do not block B on them, but require their secondary scenario before the final C gate. Reuse the same engine and P0 Identity connector.
- [ ] K-18 Include legitimate changes, unchanged data, missing exports, and inconclusive observations alongside deliberately suspicious inputs.
- [ ] K-19 Keep the hidden expected-outcome oracle in test fixtures only; collection and analysis must never import it.
- [ ] K-20 Make the development feeder use the same authorized collection queue as Investigation, submitting later implemented-connector revisions rather than inserting findings or selecting outcomes.

## 4. Minimum persistence and execution architecture

Keep original snapshots in the existing private evidence store. Add private ingestion/analysis tables and reuse existing findings, scope entities, assessments, tasks, notifications, incident events, approvals, recovery executions, and report snapshots.

| Proposed private table | Minimum responsibility |
| --- | --- |
| `incident_investigations` | Incident mode, protected reference version, intake state, independent milestone pointers, retired-demo designation |
| `investigation_sources` | Incident-scoped connector registration, catalog version, collection cursor, associated systems, latest finalized snapshot, provenance state |
| `source_snapshots` | Immutable evidence ID/digest, revision, collection/ingestion times, schema/coverage, baseline/predecessor, staging/finalized state |
| `snapshot_record_versions` | Source-scoped stable record/event key, snapshot ID, canonical hash, normalized data or original locator |
| `analysis_runs` | Frozen multi-source manifest, initiating actor, bounded delegated job scope/revocation revision, independent stages, idempotency receipt, lease, checkpoints, counters, versions, trace, errors |
| `analysis_observations` | Immutable deterministic outputs, rule version, exact supporting source locations, affected keys, limitations |
| `analysis_proposals` | Immutable proposed content/revision, source observations, proposed actions, current disposition, decision-event reference, authoritative result IDs |

| Independent milestone | Completion condition | Failure/partial behavior |
| --- | --- | --- |
| Collection Complete | The requested source set is collected, validated, preserved, and registered | Excluded/failed sources remain explicit Partial collection; no false all-sources completion |
| Deterministic Analysis Complete | Available finalized inputs have normalized comparisons and applicable anomaly observations, with coverage/limitations recorded | Publish valid outputs without the model; no baseline or insufficient evidence is explicit, not a clean result |
| Agent Investigation Complete | The bounded model/tool loop terminates successfully with validated proposals or a supported zero-proposal outcome | Unavailable/incomplete/failed is separate; deterministic outputs and dashboard access remain intact |
| Human review — separate state | Each validated proposal has a persisted disposition/result | Pending review does not imply running analysis or confirmed impact |

**Job authorization:** submission authenticates the human and authorizes a fixed scope; the worker subsequently executes only that durable delegation under its separate identity. Persist actor and authorization provenance, not a requirement to keep the submitting session alive. Current account/membership/incident/source permissions and revocation state remain mandatory checks at protected reads and publication; actual membership expiry is loss of authority, while natural session expiry is not. Explicitly revoked/canceled delegations stay revoked after a later permission regrant until a fresh authorized submission/resume creates a new authorization revision. Human acceptance always uses a fresh authenticated request and the existing destination permissions. Do not introduce a generic worker endpoint accepting a caller-selected actor or unrestricted service impersonation.

- [ ] D-01 Use an incident metadata sidecar so reference/investigation designation does not require rewriting existing incident rows.
- [ ] D-02 Represent protected seeded reference status with an immutable reference-version association; do not expose a client-editable reference flag.
- [ ] D-03 Keep latest snapshots per source and freeze a list of snapshot IDs per run; do not use one ambiguous incident-wide snapshot ID for all domains.
- [ ] D-04 Track collection, deterministic analysis, agent execution, and human review separately; none of these states changes incident lifecycle, integrity, confidentiality exposure, availability, or recovery eligibility by itself.
- [ ] D-05 Give each processing stage its own explicit state transitions: not started, queued, running, complete, partial where valid, unavailable/not configured where applicable, failed, paused, or canceled; keep proposal disposition independent.
- [ ] D-06 Persist separate latest-finalized collection, deterministic-analysis, and validated-agent-output pointers for each frozen manifest; publish each independently and retain previous valid data if a later stage fails. Dashboard availability has no results-ready gate.
- [ ] D-07 Use the existing append-only incident events for review decisions and reassessments, preserving reviewer, time, justification, prior state, source revisions, and result IDs.
- [ ] D-08 Keep proposal content immutable; amendments create a linked revision, and disposition changes append decision events.
- [ ] D-09 Use `module-id.ts` for new persisted UUID allocation and validate all relationships within the same organization and incident.
- [ ] D-10 Namespace imported record identities by registered source and logical key; keep identity stable across that source's snapshots.
- [ ] D-11 Keep staged dataset counts separate from shared reference inventory; a selected Customer connector must not inherit IR-2041's 1,240-record count.
- [ ] D-12 Keep observed snapshot membership/history separate from current assessment state; a record missing from a later export does not delete its earlier versions or decisions.
- [ ] D-13 Add a caller-scoped `visible_investigation_data` projection for source/run summaries and permission-filtered review metadata.
- [ ] D-14 Add fresh authorized paginated reads for record differences, proposal details, and source excerpts, with a maximum of 50 rows per request.
- [ ] D-15 Do not subscribe entire record-version tables, source bytes, model prompts, private file references, or unrestricted proposal details to browsers.
- [ ] D-16 Reuse SDK subscriptions and lifecycle handling; do not add custom WebSocket management or client-owned durable work.
- [ ] D-17 Add one bounded TypeScript runner for file acquisition/parsing and model I/O; do not add FastAPI, Python processing, another API server, a graph database, or an agent framework.
- [ ] D-18 Keep queue ownership, bounded job scope/deadline, leases, attempts, checkpoints, stage finalization, and retry state durable in SpacetimeDB; keep external/model I/O outside reducers.
- [ ] D-19 Use the existing internal scheduler only for bounded lease expiry/requeue bookkeeping; preserve its current access-expiry, paging, and recovery responsibilities.
- [ ] D-20 Supervise one local runner through the development lifecycle and prevent duplicate active ownership with database leases; keep queued work intact when it stops.
- [ ] D-21 Give the runner a distinct configured service identity accepted only by narrow collection/analysis procedures and reducers; do not give it the existing access gateway credential.
- [ ] D-22 Authenticate and authorize submission, then persist a bounded job authorization containing initiating actor, organization, incident, permitted actions, immutable source manifest, and authorization/revocation revision. Execution uses that scope and the narrow worker identity, never continued validity of the initiating session.
- [ ] D-23 Recheck current account, organization membership/expiry, incident assignment, required permissions, and explicit job revocation before protected reads/publication. Stop unauthorized publication on revocation or permission loss; browser closure and natural session expiry do not revoke the job. Only a freshly authenticated authorized responder may resubmit/resume revoked work.
- [ ] D-24 Preserve origin checks, HTTP-only sessions, backend denial auditing, and private result envelopes for user commands. Require current authentication again for human review, source expansion, privileged actions, and submission/resume; initiation authority never grants approval authority.
- [ ] D-25 Apply current existing permission intersections at submission and delegated protected operations: evidence upload for collection, scope editing for inventory association, scope-record access for record analysis, and destination-specific permissions for human mutations; the worker cannot choose an actor or expand the persisted job scope.
- [ ] D-26 Preserve Administrator, Legal, and Operations restrictions; incident creation alone must not permit collection, record analysis, or technical confirmation.
- [ ] D-27 Validate every mutation batch completely before writes; unexpected failures roll back and expected rejections commit denial audits without partial accepted outputs.
- [ ] D-28 Use persistent operation UUIDs and payload fingerprints for collection, stage commits, review, and retry; reject successful operation IDs reused with different content.
- [ ] D-29 Split normalized writes below the existing 40,000-character command payload limit; finalize a snapshot only when all expected chunks and hashes are present.
- [ ] D-30 Preserve staged work across uncertain transport outcomes; recover by operation identity rather than deleting originals that may already have committed metadata.

## 5. Addition A — Incident Intake & Deterministic Processing

### A1. Reference protection and seed transition

- [ ] A-01 Capture a pre-migration inventory of IR-2041 IDs, row counts, original digests, report versions, and shared inventory dependencies using trusted tooling.
- [ ] A-02 Add reference metadata without changing its existing title, incident status, certainty, or content.
- [ ] A-03 Reject collection registration, simulated source revision changes, and investigation-run creation against protected IR-2041.
- [ ] A-04 Protect reference-owned shared inventory from mutations performed by new connector ingestion; use source-specific imported datasets and incident-specific associations instead.
- [ ] A-05 Preserve normal existing human workflows on the reference case; reference protection here applies to automated ingestion, fixture replacement, and development reset, not a new global read-only mode.
- [ ] A-06 Separate reference seed definitions from new investigation scenario definitions without invalidating existing versioned seed markers.
- [ ] A-07 For existing installations, retire IR-2042/IR-2043 from default demo lists through metadata while retaining their rows, original files, memberships, and user-created history.
- [ ] A-08 Allocate fresh incident IDs for the replacement investigation scenarios; never overwrite the historical scenarios or reuse their IDs.
- [ ] A-09 For fresh installations, seed IR-2041 and two sparse investigation scenario entries without prebuilt conclusions; keep the HR/payroll entry non-runnable until P1 is implemented, without changing existing entry-screen layouts.
- [ ] A-10 Update authorized list projections/provider mapping to exclude retired demo entries from default lists without changing the organization page or selector components; retain the selected incident's full authorized row and membership so direct historical access still works.
- [ ] A-11 Preserve the exact IR-2043 read/visit-only reset guard and its production-mode rejection; add no destructive investigation reset.
- [ ] A-12 Preserve old scenario definitions only where needed by isolated regression fixtures, reached through the existing trusted test boundary.
- [ ] A-13 Maintain a versioned reference integrity manifest covering stable seed identifiers, protected metadata, shared dependencies, row/content digests, evidence/report hashes and versions, and existing user-created rows; exclude credentials/session contents.
- [ ] A-14 Store any local reference integrity baseline outside public assets and Git with restrictive permissions; retain original evidence/report artifacts in their existing private store rather than building a second artifact archive.
- [ ] A-15 Provide trusted read-only reference integrity verification; on missing or conflicting rows/artifacts, fail safely with identifiers and diagnostics rather than rewriting historical records or original files.
- [ ] A-16 Exclude partial restoration, missing-entry repair, historical rewind, and automatic conflict correction from the MVP; preserve existing seed/reset guards and report integrity problems for separate resolution.

### A2. Collection and parsing

- [ ] A-17 Extend incident creation to atomically register investigation metadata while retaining current membership creation, response-room creation, notification, and opening-event behavior.
- [ ] A-18 Backfill preexisting non-reference incidents conservatively: preserve their current dashboards and records, register metadata only, and never queue collection merely because a page is opened.
- [ ] A-19 Implement the common catalog/allowlisted adapter and all four P0 connectors from Section 3; add P1 only after P0 passes, and leave unimplemented P1/P2 entries explicitly Planned/Unavailable.
- [ ] A-20 Persist selected connector registrations and the initial requested collection manifest through the existing service-gated command boundary.
- [ ] A-21 Acquire the selected synthetic baseline/current bytes server-side and validate text format, schema version, content, and size before registration.
- [ ] A-22 Preserve the existing 5 MiB per-original limit and add explicit per-run source/record/field/depth limits with documented rejection messages.
- [ ] A-23 Store originals with the existing private UUID byte store, restrictive permissions, and SHA-256 verification.
- [ ] A-24 Register each connector artifact as real Phase 2 evidence with synthetic source metadata and Unverified status; do not reuse reference incident evidence IDs.
- [ ] A-25 Implement stable source keys and canonical hashing that ignore object-key ordering while preserving meaningful field values and original bytes.
- [ ] A-26 Reject duplicate primary keys, invalid timestamps, incompatible schema revisions, oversized values, and malformed structured records explicitly.
- [ ] A-27 Keep fixture collection time, ingestion time, and source-reported event time separate; document that source-reported times are untrusted observations.
- [ ] A-28 Preserve exact original JSON field pointers or text line/excerpt locations and source record/event keys, plus observed timestamps where supplied, so normalized observations and later proposals can cite the original bytes.
- [ ] A-29 Validate baseline/predecessor compatibility by source, organization, incident, schema, and coverage before comparing.
- [ ] A-30 Compute added, modified, missing, and unchanged sets from normalized rows; compute changed field names and before/after references for modified records.
- [ ] A-31 Keep baseline differences and previous-snapshot differences as separate comparison results.
- [ ] A-32 Allow parsing without a baseline, recording comparison unavailable rather than inventing integrity results.
- [ ] A-33 Interpret absent records according to declared full/partial export coverage; missing-from-export remains distinct from proven deletion.
- [ ] A-34 Persist real counters and checkpoints after bounded batches, retaining prior completed stages across runner restart.
- [ ] A-35 Finalize collection after validated originals/evidence metadata and the selected snapshot manifest commit; finalize deterministic analysis separately after normalized records, comparisons, anomaly observations, and inventory commit. Neither milestone requires model execution.
- [ ] A-36 Populate existing Scope inventory with explicitly registered systems and source-specific staged datasets/record groups; record associations as existing incident events.
- [ ] A-37 Keep imported inventory association separate from compromise/impact assessment; do not automatically mark imported records suspected or confirmed affected.
- [ ] A-38 Give staged datasets descriptions identifying their collection coverage and observation time so existing Scope details communicate count limits without new UI.
- [ ] A-39 Surface inventory counts as counts of staged records, retaining unknown actual-system scope where the export is partial or unauthenticated.
- [ ] A-40 Build the dedicated Investigation setup/source/progress/failure UI with existing shadcn primitives and design tokens; add only the justified Overview contextual action/status, keeping its current dashboard and all other screens intact.
- [ ] A-41 Implement deterministic anomaly rules for P0 inputs alongside comparisons and publish their exact cited observations independently of the model. Before B exists, label agent execution Not configured, not complete; the dashboard remains functional.

### A3. Acceptance gate

- [ ] A-42 Create a new incident through the unchanged form, land on the existing Overview, follow Start Investigation to the incident route, and return to the dashboard without losing state or changing the five tabs.
- [ ] A-43 Collect Customer Records / CRM, Identity and Access, Network Activity, and Business Services and Dependencies; verify private originals, registered evidence, exact comparisons, provenance, and persisted progress for each P0 source.
- [ ] A-44 Validate all four P0 connectors against baseline/initial/later fixture bytes and meaningful anomaly checks. Test P1 to the same standard if implemented; unimplemented catalog entries must be visibly unavailable and unqueueable. Twelve working connectors are not an A requirement.
- [ ] A-45 Verify exact added/modified/missing/unchanged sets and deterministic observations; alter actual isolated fixture bytes and demonstrate the expected changed outputs, including legitimate changes and reordered JSON keys.
- [ ] A-46 Close all browsers and naturally expire the initiating session during queued/running work; verify persisted job scope permits continuation and restart recovery. Separately revoke access or job authority and verify further unauthorized publication is blocked.
- [ ] A-47 Inject collection/parser failures and verify detailed Investigation errors, valid retry, no partial finalized snapshot/false success, and continued dashboard access to all prior valid data.
- [ ] A-48 Re-run seeds and the migration and compare the reference preservation manifest, original hashes, and user-created rows.
- [ ] A-49 Verify default demo replacement, historical access preservation, existing reset guards, and non-destructive publication against a real database.
- [ ] A-50 Complete A's focused checks and real-backend acceptance cases under Section 10, including job durability/revocation and reference preservation; open its scoped PR before proceeding. A does not require a full existing E2E suite, real-model run, or unimplemented B/C tests.

## 6. Addition B — Agentic Investigation & Human Review

The first successful B demonstration is deliberately narrow: actual fixture bytes → parsing/comparison/anomaly observation → supported cross-source correlation → correctly cited agent proposal → authenticated Accept/Reject → one Unverified/Suspected finding → existing Overview and Timeline, plus one reviewed existing-entity Scope link where applicable. Multi-entity mutations, task creation, follow-up runs, and recovery integration do not block this gate. Deterministic observations, model interpretations, and human-reviewed authoritative findings remain separate stores/states.

Every proposed factual claim must carry the following validated provenance before entering review; original bytes and earlier observations remain immutable.

| Reference | Required validation |
| --- | --- |
| Evidence ID | Existing authorized same-incident original, with valid stored digest |
| Source snapshot ID | Finalized snapshot in the run manifest, linked to that evidence/source |
| Source record/event key | Actual parser-resolved key in that snapshot; for keyless logs use a deterministic parser-assigned key and original location, never an LLM-invented key |
| Field/event/excerpt location | Resolvable JSON pointer or text line/range referencing actual original content |
| Observed timestamp | Preserve the source-reported time and its uncertainty where supplied; explicitly absent otherwise |
| Deterministic observation ID | Existing immutable observation derived from these inputs, supporting the factual claim |
| Rule/tool version | Match the persisted observation/run version so the result is reproducible |

Validate both reference existence and claim scope. A valid transfer log does not support a claim that specific customer contents were exfiltrated. Unsupported claims are rejected for regeneration or left as explicit questions; they cannot enter review as established facts.

### B1. Runtime and tool loop

- [ ] B-01 Configure one independently operated model endpoint and a server-only model identifier; verify endpoint availability and structured-output behavior before enabling the agent.
- [ ] B-02 Keep the endpoint choice in one adapter with documented configuration; do not add multiple providers or automatic external-service fallback for this MVP.
- [ ] B-03 If the model is unavailable, not configured, or fails, continue collection and deterministic stages, expose their real observations, and keep Overview usable; show the precise agent outcome in Investigation without canned proposals or false completion.
- [ ] B-04 Freeze an analysis manifest containing all relevant snapshot IDs, collection coverage, baseline IDs, incident context revision, tool versions, and model/prompt versions.
- [ ] B-05 Implement a single plan → tool request → validated result → next action loop with explicit limits for model requests, tool calls, retries, runtime, and context size.
- [ ] B-06 Let the model select from only `parse_evidence`, `compare_snapshots`, `detect_anomalies`, `query_context_graph`, and `propose_findings`.
- [ ] B-07 Validate every requested tool name and argument against a strict schema and the run's authorized source manifest before execution.
- [ ] B-08 Reuse Addition A parser/comparison outputs; do not ask the model to calculate exact counts, hashes, or record differences.
- [ ] B-09 Expose the deterministic anomaly engine from A as a validated tool and add only rules needed for the implemented scenarios; these checks remain runnable and publishable without the model.
- [ ] B-10 Evaluate known legitimate changes and approval references before describing a difference as anomalous; preserve uncertainty if corroboration is missing.
- [ ] B-11 Correlate accounts, systems, explicit record identifiers, and reported time windows only when the supplied fields support those joins.
- [ ] B-12 Do not infer record-level exfiltration from network volume, account access capability, or timestamps alone.
- [ ] B-13 Bound graph traversal through existing same-incident entities/relationships; return potential paths as leads, never as automatic confirmations.
- [ ] B-14 Persist deterministic observations with immutable IDs and the provenance contract at the start of Section 6: evidence/snapshot/key/location/time where applicable and rule/tool versions, plus limitations; preserve prior observations and original bytes.
- [ ] B-15 Give the model bounded normalized observations and minimal excerpts rather than unrestricted record tables or all original files.
- [ ] B-16 Treat imported strings as data; reject attempts to request unauthorized tools, change roles, access other sources, select outcomes, or execute commands.
- [ ] B-17 Before a proposal enters human review, resolve every cited evidence/snapshot/record/event/field/excerpt/observation/version and validate same-incident lineage and support for each factual claim. Reject nonexistent references, unsupported exfiltration or record-level exposure claims, and invented evidence IDs.
- [ ] B-18 Store proposal claim, rationale, uncertainty, missing information, observations, proposed actions, and model/tool provenance separately from existing findings.
- [ ] B-19 Store a bounded execution trace of tool calls/results and decision summaries for diagnosis; do not require or expose private model reasoning.
- [ ] B-20 Mark Agent Investigation Complete only when its bounded tool-driven run has valid terminal outputs, including a valid zero-proposal outcome; finalize its pointer independently of collection/deterministic pointers. Agent failure never hides the dashboard or erases completed deterministic work.
- [ ] B-21 Distinguish a valid analysis with zero proposals from failure, insufficient evidence, partial sources, and unexecuted tools.
- [ ] B-22 Validate the persisted delegation, current actor access/permissions, immutable manifest, revocation revision, and worker lease before protected reads and commits; reject stale attempts and explicit revocation without consulting the initiating session expiry.

### B2. Review and population of the existing application

- [ ] B-23 Keep the existing Overview continuously available; its compact contextual status/link points to Investigation, while accepted findings appear in existing findings/activity sections through current data providers.
- [ ] B-24 Implement the initial Investigation review flow with proposal claim, exact citations, limitations, intended single finding, optional reviewed existing-entity link, and Accept/Reject with justification; keep these controls out of Overview.
- [ ] B-25 Reuse the existing authorized evidence viewer for originals and present field differences and precise record/event citations in Investigation; do not alter Scope evidence interactions or shared forms.
- [ ] B-26 Require an authorized human justification for a review decision and show all intended authoritative changes before acceptance.
- [ ] B-27 Validate current session, incident assignment, source access, proposal revision, and each destination permission before beginning a review transaction.
- [ ] B-28 For initial B, atomically append the human decision, update proposal disposition, create one accepted finding, and optionally link one explicitly reviewed existing scope entity; retain resulting IDs for exact retry behavior. No multi-entity graph transaction is required.
- [ ] B-29 Reuse the existing incident finding command and scope validators inside the authorized review transaction; extract only the minimum shared validation necessary, preserving backend evidence/verification and denial semantics.
- [ ] B-30 Restrict proposal acceptance to an Unverified or Suspected finding; reject requests to set Confirmed through this operation. Confirmation of any impact remains a separate existing human verification action.
- [ ] B-31 Preserve the existing evidence, technical-verifier, timestamp, and justification requirements when a human separately confirms an assessment.
- [ ] B-32 Where applicable, link the accepted finding to one reviewed existing source/system/record entity using current graph data and validation. Defer multi-entity creation and complex graph mutations until after the first complete evidence-to-finding demonstration.
- [ ] B-33 Keep system/dataset inventory associations populated from validated collection; add incident-specific finding/impact relationships only through the relevant review rules.
- [ ] B-34 Defer task recommendations/conversion to optional later B or C work; automated task creation is not a first-demo prerequisite and paging remains an explicit existing human action.
- [ ] B-35 Keep rejection history and reasons; do not create findings, assessments, tasks, or graph links for rejected proposals.
- [ ] B-36 Optionally record Needs more evidence/deferred review with a human reason after the basic Accept/Reject flow works; follow-up agent runs and task generation are later extensions, not initial B acceptance requirements.
- [ ] B-37 Prevent stale or competing review acceptance from creating duplicate findings, repeated links, or conflicting authoritative mutations.
- [ ] B-38 Keep task completion, finding resolution, scope verification, and page acknowledgment independent, using their existing backend policies.
- [ ] B-39 Keep private conversation content outside agent inputs for this MVP; do not broaden existing conversation-derived finding/task visibility.
- [ ] B-40 Append accepted findings and collection/analysis/review events through the existing Timeline system and categories, with evidence/run/proposal references; preserve its current filter UI and interactions.

### B3. Acceptance gate

- [ ] B-41 Use actual P0 fixture bytes, a real independently configured model, and real SpacetimeDB to detect a non-preseeded anomaly, correlate another source where supported, and produce a validated correctly cited proposal that an authorized responder can accept or reject.
- [ ] B-42 Change underlying connector fixture data in an isolated test scenario and verify corresponding differences in computed observations and supported proposals.
- [ ] B-43 Accept a validated proposal as Unverified/Suspected through current authorization; verify the real finding in unchanged Overview and Timeline and the reviewed existing-entity relationship in Scope where applicable, without requiring tasks, follow-up runs, multi-entity mutations, or recovery integration.
- [ ] B-44 Verify an unreviewed proposal does not change confirmed scope, trust restrictions, recovery execution, access grants, or incident status.
- [ ] B-45 Verify rejected and duplicate/stale acceptance operations leave authoritative state correct and append-only history intact.
- [ ] B-46 Test malicious source instructions, invalid model JSON, unsupported claims, nonexistent evidence/record references, disallowed tools, and model timeout/unavailability; verify real deterministic results and the dashboard remain usable while the agent is accurately failed/unavailable.
- [ ] B-47 Verify the dedicated Investigation review route, permission-filtered details, Overview/back navigation, and unchanged five-screen layouts with only the approved contextual Overview action/status.
- [ ] B-48 Complete B's focused tool/provenance/review tests, real-backend integration, and one real-model evidence-to-finding demonstration under Section 10; open its scoped PR before proceeding. Carry forward unchanged A checks and omit unrelated coordination/recovery/restart suites unless B changed their shared dependencies.

## 7. Addition C — Continuous Reassessment & Response Integration

### C1. Later snapshots and selective reanalysis

- [ ] C-01 Add Collect latest to Investigation, using the same selected connector registrations, adapter, job authorization, and ingestion path; Overview retains only its contextual link and compact status.
- [ ] C-02 Add a trusted development feeder that queues later synthetic revisions through the same collection command; keep source choice separate from analysis/recovery outcomes.
- [ ] C-03 Persist source cursors, queued manifests, and collection attempt IDs; replaying a feeder operation must not advance twice.
- [ ] C-04 Queue incremental analysis only after the new snapshot is finalized; keep earlier run inputs and source versions immutable.
- [ ] C-05 Serialize publication of results per incident or enforce manifest/revision checks so an older run cannot replace a newer result set.
- [ ] C-06 Parse new records, compare modified records, and retain explicit absence observations for missing records.
- [ ] C-07 Reuse unchanged deterministic results only when snapshot lineage, parser/rule versions, baseline, and relevant context remain compatible.
- [ ] C-08 Revisit previously unchanged records when new account/network events introduce relevant correlations; record dependencies between observations and their source keys/windows.
- [ ] C-09 Reanalyze affected observations when a baseline is replaced or its provenance review changes; retain the earlier comparison and its original basis.
- [ ] C-10 Preserve all previous proposals and decisions; link superseding proposals rather than rewriting earlier claims.
- [ ] C-11 Record Needs re-review through a separate investigation observation/review marker when new evidence contradicts a human decision; do not add unsupported values to existing finding/assessment enums.
- [ ] C-12 Preserve the last human-confirmed assessment until authorized reassessment; describe contradictory evidence in existing events and the Investigation review queue without overwriting earlier decisions.
- [ ] C-13 Notify current eligible investigators through existing permission-filtered notifications using their supported Overview target; the contextual Overview action leads to Investigation. Do not invent a new notification target contract or change the header UI solely for agent controls.
- [ ] C-14 Publish each later collection/deterministic/agent milestone independently with manifest/revision checks; retain the current dashboard throughout and keep detailed progress/failures in Investigation.
- [ ] C-15 Provide same-content, changed-content, partial-export, and no-new-revision outcomes without duplicate findings or misleading no-impact conclusions.

### C2. Existing Scope, Operations, Team, and reports

- [ ] C-16 Adapt Scope backend reads/counts to source-specific staged inventory and current source context while preserving shared inventory and existing deduplication rules.
- [ ] C-17 Keep observed snapshot counts, known inventory, potential exposure, and individually confirmed impact separate in backend calculations and existing detail descriptions.
- [ ] C-18 Retain the current graph's node limit, pagination, selected-record behavior, evidence provenance, and same-incident access checks.
- [ ] C-19 Populate relevant business-operation rows and explicit dependency relationships for collected domains through backend registration/review; keep unknown operating state explicit.
- [ ] C-20 Recompute existing deterministic caution/readiness projections from accepted assessments and documented dependencies without confirming downstream compromise.
- [ ] C-21 Preserve explicit Do Not Use restrictions as human evidence-backed decisions; untrusted-source and pending-review information must not silently grant or clear usage permission.
- [ ] C-22 Replace recovery's hardcoded entity-suffix assumptions with explicit applicable-operation/template/source bindings in backend policy.
- [ ] C-23 Preserve the existing support-recovery/fallback controls and template IDs; map only the supported customer-support scenario into them for this MVP.
- [ ] C-24 Keep recovery unavailable for HR/payroll/other domains without an existing applicable approved procedure; connector implementation does not require another recovery playbook.
- [ ] C-25 Keep existing Operations frontend selection predicates satisfied through the supported operation's canonical identity and current data contract; do not redesign or generalize its UI.
- [ ] C-26 Initialize incident-specific synthetic verification artifacts and simulation state through trusted fixture setup; never expose outcome selection through normal HTTP, Investigation, Overview, or agent tools.
- [ ] C-27 Keep the independent three-record fallback subset separate from collected snapshots and grant reads only through existing per-user, expiring access policy.
- [ ] C-28 Replace whole-incident context hashing for new requests with a versioned dependency manifest/fingerprint scoped to the requested operation, relevant sources/record selectors, linked assessments/evidence, dependencies, reassessment flags, and policy versions. Reevaluate only changes intersecting that scope; unrelated connector/incident data must not invalidate approvals. Preserve historical approval records and explicitly handle pending legacy contexts without rewriting decisions.
- [ ] C-29 Recheck requester/approver membership, distinct roles, evidence, context, and expiry immediately before execution; never let the agent approve or run a procedure.
- [ ] C-30 Offer human-reviewed task/recovery recommendations in Investigation after the basic B flow; use existing task forms and Operations procedures for authorized execution, preserving independent verification, explicit paging, and scheduled escalation.
- [ ] C-31 Preserve append-only incident events for source registration, collection, run completion/failure, proposal decisions, and reassessment.
- [ ] C-32 Extend immutable report snapshots with permitted source provenance, collection coverage, separate deterministic/model milestone outcomes, accepted outputs, and explicitly unresolved review items; model unavailability does not block an otherwise authorized interim report.
- [ ] C-33 Add report source-permission requirements for any included proposal/record data; preserve exclusion of private conversation-derived content and restricted legal rules.
- [ ] C-34 Keep existing report dialogs and history controls unchanged; update only captured report data and printable artifact content.
- [ ] C-35 Generate a new report version after later evidence; never regenerate old versions from current state or overwrite original report bytes.
- [ ] C-36 Retain explicit Missing, Unverified, and Not Yet Established values when connectors or reviewers have not established an answer.
- [ ] C-37 Keep report generation, recovery outcomes, investigation task completion, and incident closure separate human-controlled workflows.

### C3. Acceptance gate

- [ ] C-38 Collect a later P0 snapshot through Investigation while the dashboard is open; verify actual changed-record observations, preserved earlier versions, and relevant reviewed incident/Scope updates through live data.
- [ ] C-39 Verify new log events can trigger review of an unchanged record and that unchanged repeated snapshots do not duplicate proposals or authoritative findings.
- [ ] C-40 Verify prior human decisions and original evidence remain readable after contradictory new evidence creates a re-review item.
- [ ] C-41 Generate a report, accept later evidence-backed changes, generate another report, and verify the first artifact's bytes/hash/version remain unchanged.
- [ ] C-42 Test both sides of approval relevance: related evidence/dependency/policy changes require reevaluation before execution, while unrelated source changes preserve valid approval context. Retain all earlier approval decisions.
- [ ] C-43 Exercise supported recovery/fallback using the existing Operations screen and verify original compromise/record assessments remain independent.
- [ ] C-44 Restart the runner and real database during collection/reassessment after browser closure and natural session expiry; verify checkpoint recovery and no duplicate publication. Separately revoke membership/job scope during downtime and verify publication remains denied on restart.
- [ ] C-45 Complete the six-connector P0/P1 scope and run the secondary HR/payroll scenario with full fixtures/tests before final C acceptance; repeat IR-2041 integrity and five-screen visual/functionality checks. P2 remains optional.
- [ ] C-46 Complete C's relevant acceptance tests and documentation, then run the single final full regression defined in Section 10 on the completed integration and open the final scoped PR. Reuse passing checks already executed against the same final inputs instead of repeating them for each checklist item.

## 8. Planned file boundaries

Paths below describe intended implementation locations. No file should be changed merely because it appears in this table; preserve minimal scope and existing working configuration.

| Location | Intended work |
| --- | --- |
| `backend/spacetimedb/src/investigation-schema.ts` — new | Private ingestion/analysis tables |
| `backend/spacetimedb/src/investigation-domain.ts` — new | Collection/run commands, finalization, transactional review, projection/read policy |
| `backend/spacetimedb/src/investigation-seed.ts` — new | Additive metadata migration, sparse scenarios, protected reference designation |
| `backend/spacetimedb/src/index.ts` | Table registration, narrow command/procedure routing, caller-scoped view, bounded lease bookkeeping |
| `backend/spacetimedb/src/incident-domain.ts` | Atomic new-incident metadata and reused finding validation |
| Existing incident/scope/coordination/recovery seed files | Split reference/legacy/new-scenario ownership and preserve idempotent seeds |
| `backend/seed/investigation-connectors.json` — new | Versioned catalog, schemas, allowed synthetic source revisions, domain mappings |
| `mock-evidence/connectors/` — new | Synthetic baseline, initial, and later plain-text connector artifacts |
| `shared/investigation.ts` — new | Pure runtime-neutral schemas/types, comparison rules, run/review transitions |
| `frontend/lib/server/investigation/` — new | Allowlisted collector, original-byte handling, parsing, bounded model/tool adapter, runner logic |
| `frontend/app/api/investigation/route.ts` — new | Narrow authenticated workspace command/read facade; no worker credentials or fixture-outcome routes |
| `frontend/app/org/[orgId]/incidents/[incidentId]/investigation/page.tsx` — new | Dedicated static incident route alongside `[section]/page.tsx`; async params, server access check, no sixth tab |
| `frontend/components/investigation-route.tsx` — new | Minimal authenticated wrapper reusing existing access boundary, selected providers, and unchanged shell; contextual Back link |
| `frontend/components/investigation-workspace.tsx` — new | Connector setup, source inspection, three milestone details/errors, deterministic results, proposal review, Collect latest |
| `frontend/components/investigation-data.tsx` — new | Authorized SDK projection/read provider and investigation command hooks, composed locally on the new route |
| `frontend/components/investigation-status.tsx` — new | Small contextual Overview link/status with local data wiring; no wizard or review dialog |
| `frontend/components/incident-data.tsx` and existing domain providers | Minimal data mapping for retired incident lists/source-aware projections, only where current contracts require it |
| `frontend/components/live-incident.tsx` | One contextual Start/Open Investigation action and compact status; keep all existing dashboard structure and behavior |
| `frontend/components/workspace-route.tsx` and existing providers | Preserve by default; use the new route wrapper/local investigation provider rather than global rewiring |
| Existing scope/recovery domain/access/report files | Backend population, source-bound scope counts, procedure applicability, approval context, report provenance |
| `scripts/investigation-runner.ts` — new | One supervised TypeScript runner entry point |
| `scripts/investigation-feed.ts` — new | Trusted synthetic collection/revision demo feeder |
| `scripts/reference-case.ts` — new, only if needed | Trusted read-only reference integrity manifest verification and safe conflict diagnostics; no restoration/rewind |
| Existing dev/config/bootstrap/e2e scripts and root package configuration | Minimal runner/config/seed lifecycle wiring, retaining one root lockfile |
| `frontend/src/module_bindings/` | Regenerated bindings from `npm run db:generate`; no manual changes |
| Existing tests and new investigation tests | Real-backend integration, deterministic analysis, authorization, durability, UI regression |
| `README.md`, `docs/architecture.md`, `docs/phase5.md`, `AGENTS.md` | Implemented setup, acquisition simulation, authority, source revision, reporting, and UI constraints |

**Existing-screen change register:** the only planned existing-screen change is the contextual Overview action/status in `live-incident.tsx`, necessary to reach Investigation and summarize its state. Preserve the organization form/redirect and `workspace-route.tsx`; the new static route/wrapper avoids changing dynamic section validation or shared navigation. Backend projections/provider mappings may populate current contracts. Do not change `scope-workspace.tsx`, `scope-record-browser.tsx`, `scope-details.tsx`, `recovery-workspace.tsx`, `team-workspace.tsx`, `incident-header.tsx`, `workspace-shell.tsx`, or shared forms merely to expose investigation controls. If implementation finds a strictly necessary exception, document its exact integration need, why backend reuse/minimal controls/the dedicated route cannot satisfy it, affected behavior, and regression coverage before expanding scope; no blanket layout changes are authorized by this plan.

## 9. Demonstration sequence and expected observable behavior

- [ ] M-01 Open IR-2041 directly and show the established five-screen reference with its real existing uncertainty, evidence, coordination, and response history.
- [ ] M-02 Create the new customer-service incident through the existing form and land on its existing sparse Overview; follow the contextual Start Investigation action to the dedicated workspace.
- [ ] M-03 Select the four implemented P0 connectors in Investigation and start collection without uploads; Planned/Unavailable P1/P2 domains cannot be selected before implementation.
- [ ] M-04 Inspect separate Collection Complete, Deterministic Analysis Complete, and Agent Investigation Complete milestones in Investigation, backed by actual fixture bytes and persisted work.
- [ ] M-05 Return to Overview before agent completion and demonstrate progressive registered data and deterministic summaries; show that model-unavailable behavior leaves the dashboard usable and agent status accurate.
- [ ] M-06 Review a correctly cited proposal in Investigation, accept an Unverified/Suspected finding, and open the resulting existing Overview/Timeline finding and applicable reviewed Scope relationship.
- [ ] M-07 Separately perform authorized technical verification when evidence supports it; show that acceptance alone did not confirm compromise.
- [ ] M-08 Collect latest in Investigation or trigger the trusted feeder; show actual source differences, new relevant observations/re-review notifications, and preserved earlier human decisions.
- [ ] M-09 Use existing Team and Operations controls for reviewed work and human-approved simulated recovery where the predefined support procedure applies.
- [ ] M-10 Generate successive incident report versions using existing controls and verify the earlier artifact is unchanged.
- [ ] M-11 After P1 is implemented, demonstrate HR/payroll with the same engine and P0 Identity source; show unimplemented P2 entries as Planned/Unavailable rather than fake-success connectors.
- [ ] M-12 Return to IR-2041 and verify its reference data and original artifacts were unaffected by both investigations.

## 10. Validation, documentation, and implementation stop conditions

### Change-based validation cadence

**Default: run the smallest set of meaningful checks that verifies the changed behavior.** Batch related edits before validation. Do not run build, lint, typecheck, all unit tests, all browser tests, and restart tests after every edit or small fix. Keep all tests available; omitting an unrelated suite from a focused invocation is not permission to delete tests, add `.skip`, weaken assertions, or claim an unexecuted check passed.

| Change/batch | Required focused checks | Normally omit for that change |
| --- | --- | --- |
| Markdown/documentation only | Review wording, checklist IDs/cross-references, file scope, and whitespace | Application build, lint/typecheck, unit/E2E, model calls, database startup/restarts |
| Pure parsing, comparison, hashes, anomaly rules, or state transitions | Directly relevant unit files and boundary cases; changed-file lint and affected workspace typecheck when code/types changed | Browser suite, live model, unrelated coordination/recovery, restart tests |
| Investigation components or route wiring | Relevant component tests if they verify real behavior, changed-file lint, frontend typecheck; one targeted route/integration smoke after the route is wired | All five-screen E2Es on every style/copy change, database restart, live model |
| Schema, reducers, worker permissions, private projections, or seed migration | Backend typecheck/build as needed; regenerate bindings when exported schema/reducer/procedure contracts change; focused real-backend tests including affected denial/revocation/provenance/reference-preservation cases | Unrelated E2E files; separate duplicate module builds if the real-backend run already built the exact same module |
| Worker leases, checkpoints, scheduler integration, or durable authorization | Relevant state/authorization tests plus the affected real restart/durability case | Full restart coverage after UI, wording, fixture-only, or explanation-only changes |
| Model/tool schema, prompt policy, or proposal review | Focused orchestration/provenance/review tests, relevant real-backend acceptance; actual-model smoke at B's gate and after material model/tool/prompt contract changes | A live-model call for each deterministic parser/fixture/UI change, all existing E2Es |
| Scope counting, recovery context, fallback, or reports | Corresponding pure-rule files plus relevant real-backend scope/recovery/report cases; authorization/isolation negatives for changed access paths | Unrelated messaging/paging/browser files unless shared code changed |
| Root dependencies/configuration, shared authentication/access, SDK/provider lifecycle, global routing, or broadly shared schema/scheduler code | Broaden coverage to all affected consumers; use a full regression early only when the impact cannot be bounded reliably | Blindly trusting changed-file selection to cover consumers that reach the backend indirectly |

**A gate:** run the P0 collection/comparison/anomaly tests and the new investigation intake/route/backend acceptance group, plus affected existing incident/scope/security cases. Prove A-46 durability and revocation once against its current worker design. No live model or B/C workflows are required. Run a production build if A changes application/module integration or build configuration; do not rebuild for each intervening edit.

**B gate:** run the bounded-agent/provenance/review group, affected finding/scope/isolation cases, and one actual-model evidence-to-finding smoke. Reuse unchanged A durability/reference checks; rerun them if B changes their implementation, fixtures, authorization, or configuration. Use recorded tool-output fixtures for repeatable orchestration unit tests while keeping the real model/backend acceptance mandatory once at this gate.

**C gate/final delivery:** run C's incremental/relevance/report checks and affected durability case, then one full `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run test:e2e` on the final integration. Regenerate bindings first only if exported module contracts changed. The full E2E invocation already includes existing coordination/restart coverage; do not separately repeat the same restart case on identical inputs. If a command already passed against the same final code/config/fixture inputs, count that result instead of rerunning it for this paragraph. After a failure, rerun the failing group and affected dependents; repeat broad coverage only when the fix has broad impact or the final integrated result remains unverified.

This preserves one full end-to-end regression before final delivery, rather than one after every edit or every addition. An earlier full run is justified by a broad shared change, a failure indicating cross-feature regressions, or an explicit user request. Do not schedule extra full runs merely because an unchanged PR description, checklist, or documentation was edited.

### Focused commands using the current scripts

Run these from the repository root, selecting the files actually affected. The first examples use existing files; the investigation-specific test names below are planned file boundaries, not claims those tests already exist. No new dependency, test runner, or package script is required for selection.

```sh
# Pure scope rule changes: only the relevant unit file.
npm run test --workspace @aegis/frontend -- tests/scope-rules.test.ts

# Recovery/report rule changes: select the relevant unit files together.
npm run test --workspace @aegis/frontend -- tests/recovery-rules.test.ts tests/evidence-store.test.ts

# Typecheck only the affected workspace when its code/types change.
npm run typecheck --workspace @aegis/backend
npm run typecheck --workspace @aegis/frontend

# Lint an actual changed frontend file, rather than all frontend files.
npm exec --workspace @aegis/frontend -- eslint components/live-incident.tsx

# One isolated E2E startup for the selected existing feature files.
npm run test:e2e --workspace @aegis/frontend -- incidents.spec.ts scope.spec.ts

# Planned investigation files, once implemented: select this logical batch.
npm run test --workspace @aegis/frontend -- tests/investigation-rules.test.ts
npm run test:e2e --workspace @aegis/frontend -- investigation.spec.ts
```

Prefer whole relevant E2E files or self-contained describe groups: existing security, incident, and scope suites use serial/shared setup, so an arbitrary single-test filter may omit required prerequisites. Use `--grep` only for a demonstrably independent case/group, not as a shortcut around setup or failing assertions. Keep new investigation suites independently set up so collection, review, incremental, and durability groups can be selected without running unrelated flows. Do not trust `--only-changed` alone for reducer/security changes: indirect backend consumers may have unchanged test files.

Every selected Playwright invocation must still use the current configuration and fresh isolated state on 3100/3101; the restart test retains its disposable 3201 ownership. Save startup time by selecting all relevant files in one invocation, not by reusing the developer database, enabling `reuseExistingServer`, increasing shared-state test parallelism, or weakening isolation. The current E2E startup publishes/seeds/builds its environment even for a subset; prefer unit checks during the inner edit loop and batch integration runs at meaningful checkpoints.

Record what passed, the code/config/fixture inputs it covered, and what was intentionally deferred. Do not rerun passing checks until relevant code, test inputs, contracts, configuration, or an unresolved failure gives a reason. Do not turn documentation-only validation into an application test run. Coverage checklist items below are satisfied at the appropriate gate, not all at every gate.

### Required functional and security checks

- [ ] V-01 Unit-test deterministic parsing/canonicalization/comparison against explicit expected sets, including legitimate changes, reordered keys, duplicate IDs, malformed values, and partial coverage.
- [ ] V-02 Unit-test run/review transitions, manifest fingerprints, invalidated dependencies, and stable operation UUID/payload matching.
- [ ] V-03 Test real baseline/initial/later bytes, provenance, comparisons, and domain-relevant anomaly checks for all four P0 connectors at A and both P1 connectors by final C; test disabled catalog behavior for unimplemented domains. Apply the same fixture standards to any optional P2 implementation.
- [ ] V-04 Integrate collection, staging, finalization, live projections, review mutations, and destination workflows against actual SpacetimeDB; reject citations with valid IDs but wrong snapshot/key/location/time/observation/version lineage as well as nonexistent references.
- [ ] V-05 Test current authentication/role restrictions for submission and human review separately from worker delegation: naturally expired sessions do not cancel authorized jobs, while account/membership expiry or revocation, incident removal, permission loss, or explicit job cancellation block protected worker publication.
- [ ] V-06 Verify restricted records/proposals never leak through Investigation routes, Overview status, notifications, Timeline, reports, or subscriptions; test direct route/read access across organizations and incidents.
- [ ] V-07 Verify the worker identity cannot invoke access-management, credential/session, approval, recovery, or arbitrary incident commands.
- [ ] V-08 Test browser closure, natural session expiry, bounded delegation scope, explicit revocation, lease expiry, concurrent/stale claims, runner/database restart, and uncertain transport; a later permission regrant must not silently resurrect a revoked delegation.
- [ ] V-09 Test source-text prompt injection and malicious model outputs without granting extra tools, source access, permissions, or execution authority.
- [ ] V-10 Use deterministic fake model responses only for orchestration/error unit tests; perform a separate actual-model integration smoke test before calling agent behavior complete.
- [ ] V-11 Test all distinct evidence/processing outcomes and model-unavailable behavior: deterministic results/dashboard stay accessible, unavailable or failed agents never become complete, and no-baseline/insufficient-evidence/partial collection never becomes no-impact proof.
- [ ] V-12 Test repeated collection, retry, review, and feeder operations for duplicate evidence, proposals, findings, graph links, events, and notifications.
- [ ] V-13 Test incremental correlation where new events affect old unchanged records, preserving prior decisions and provenance.
- [ ] V-14 Test relevant source/assessment/dependency/policy changes trigger approval-context reevaluation, unrelated changes do not invalidate approvals, and independent fallback reads remain authorized, read-only, revocable, and expiring.
- [ ] V-15 Test report consistency, permission rechecks, immutable source cutoff, preserved bytes/hashes, and new-version behavior after evidence changes.
- [ ] V-16 Test protected metadata/stable IDs, non-destructive migration/seed reruns, artifact integrity verification with fail-safe conflict diagnostics, preservation of user work, and unchanged reset guards; do not require restoration tooling.
- [ ] V-17 Retain regression tests for all five phases; select affected consumers during A/B development and execute the full regression once at final C delivery or earlier when a broad shared change warrants it. Adapt legacy setup in isolated fixtures rather than weakening assertions.
- [ ] V-18 Test Investigation routing/access/back links and changed UI behavior with focused browser cases at the relevant gates; compare all five existing screens at final integration, repeating earlier only if their shared layout/data/access behavior changed. Allow only documented minimal Overview entry/status changes.
- [ ] V-19 Keep browser tests on 3100/3101 with fresh isolated state through `scripts/e2e.mjs`; never reset or reuse the developer database to obtain passing tests.
- [ ] V-20 Preserve disposable restart coverage and 3201 ownership; run affected restart cases when worker/scheduler/lease/durable-authorization code changes and at their acceptance gates, not after every unrelated edit. Count an identical passing restart case in the final suite once.
- [ ] V-21 Verify non-destructive schema publication and the metadata backfill against an existing-data test database before using the developer database.
- [ ] V-22 Follow the change-based cadence above: focused checks during development, relevant integration at A/B gates, one final full build/lint/typecheck/unit/E2E regression at C delivery, and binding generation only for changed exported module contracts. Record actual runs, justified omissions, reusable passing results, and unresolved failures; never run the entire command list automatically after each change.

### Documentation and operational handoff

- [ ] V-23 Document the single runner lifecycle, model configuration, private storage, local identity files, and failure/resume behavior in README.
- [ ] V-24 Keep model URLs/keys, worker credentials, and source fixture descriptors server-only; never introduce `NEXT_PUBLIC_*` secrets or committed local credentials.
- [ ] V-25 Update environment validation and ignored-file rules only for configuration actually introduced by the implemented addition.
- [ ] V-26 Document that collection is simulated and analysis operates on real staged synthetic bytes; list supported domain schemas and limits.
- [ ] V-27 Document private tables, narrow worker identity, bounded session-independent job delegation, live permission/revocation checks, separate processing milestones, proposal provenance, human review, and caller-scoped SDK projections.
- [ ] V-28 Update `docs/phase5.md` for procedure applicability, dependency-scoped approval reevaluation including unrelated-change preservation, report confidentiality/milestones, and unchanged simulation boundaries.
- [ ] V-29 Update AGENTS only as the functionality is implemented: document the comparison/agent extension and narrow session-independent job delegation while preserving the existing session-derived human command boundary, worker limits, and all other security constraints.
- [ ] V-30 Record the chosen model/runtime and measured evidence-to-finding results; label P0/P1/P2 implementation availability, milestone failures, incomplete checks, and absent capabilities accurately.
- [ ] V-31 Keep the planning batch and each implementation batch on its own `codex/` branch from latest merged `main`, with a scoped PR and accurate validation summary. Merge prerequisites before dependent batches, never merge without authorization, and implement only the requested addition rather than preempting later work.

### Boundaries that keep this implementation viable

- [ ] V-32 Exclude real external connectors, OAuth, corporate database access, production network collection, and arbitrary source URLs.
- [ ] V-33 Exclude entry-page/tab/navigation redesign and substantial changes to the existing five screens; explicitly allow the incident-scoped Investigation route and the justified minimal Overview action/status, without a permanent sixth primary tab.
- [ ] V-34 Exclude a second finding/task/graph/recovery/report system, multi-agent orchestration, arbitrary uploaded-document extraction, and a general workflow builder.
- [ ] V-35 Exclude automatic sanitization, source record modification, verified-safe declarations, live restoration, automatic approvals, automatic paging, and automatic incident closure.
- [ ] V-36 Fail the relevant gate on ungrounded citations, lost reference integrity, unauthorized publication, exceeded UI boundaries, or missing required fixtures. A passes without a model; B requires a demonstrated real-model run plus correct model-unavailable fallback; C requires relevant reassessment and immutable history. Retain working stages and report precise gaps.

The completed implementation lets responders collect and investigate versioned synthetic evidence in a dedicated workspace while the existing five screens remain the incident command center. Deterministic outputs remain useful without a model, human-reviewed findings update authoritative records, later snapshots drive relevant reassessment, and IR-2041 remains protected throughout.
