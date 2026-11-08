# AEGIS coding agent instructions

## Context and scope

AEGIS is a HackUTD 2026 Cyber Incident Response Dashboard for the Winstead PC challenge. It must function independently of compromised corporate infrastructure. Prioritize ease of use under stress, real-time incident coordination, evidence-backed scope tracking and human-approved recovery actions.

Phases 0–4 establish the development foundation, independent access, live incident documentation, evidence-backed scope tracking and real-time communication/coordination. All five screens are database-backed. Phase 5 adds evidence-backed trust warnings, approvals, simulated recovery, limited fallback access and immutable reports. Implement only the phase requested by the user; never preempt later phases. The planned feature phases are:

1. Independent Security & Access
2. Incident Command & Documentation
3. Compromise Scope & Context Graph
4. Real-Time Communication & Coordination
5. Trust Warnings, Recovery & Reporting

## Stack and code

- Use TypeScript, strict types, clear names and React functional components.
- Follow Next.js App Router conventions. Read relevant version-matched Next.js documentation under `node_modules/next/dist/docs/` when working on framework APIs.
- Keep frontend code under `frontend/`; module code under `backend/spacetimedb/`.
- Style with Tailwind CSS. Reuse the existing shadcn/ui primitives in `frontend/components/ui/`.
- Prefer small reusable components and the simplest implementation; avoid unnecessary abstraction and duplicated logic.
- npm is the package manager. Install from root using workspaces and keep one root package-lock.json. Node 24.22.2 and CLI/SDK 2.14.1 are the verified versions.
- Preserve working template configuration. Do not replace the stack without explicit approval.

## Architecture

- SpacetimeDB is the primary application database. Prefer its supported React provider, reducers and subscriptions for real-time application data.
- Keep generated bindings in `frontend/src/module_bindings/`. Never edit them manually; edit module source and run `npm run db:generate`. Commit updated bindings alongside schema changes.
- Never introduce custom WebSocket management when the SDK supports the lifecycle.
- Do not introduce FastAPI, PostgreSQL, Neo4j, separate API servers or unrelated services without a concrete requirement. Do not silently introduce infrastructure.
- Local scripts preserve DB data, use project-local CLI credentials and reuse a running local DB. Avoid duplicate services. Do not add automatic destructive resets.
- The Phase 0 `health_check` table/reducer are public, synthetic diagnostics only, capped at 50 rows. Do not use them as a model for unrestricted incident access.

## Phase 1 trust boundary

- Keep temporary membership status/expiration separate from functional roles. Use `backend/spacetimedb/src/membership-policy.ts` for invitation renewal: preserve a future deadline, renew an expired temporary window for seven days, and never silently turn finite access into indefinite access.

- Next.js validates scrypt credentials and manages opaque HTTP-only, SameSite=Strict sessions. Raw session/invitation secrets are hashed before database storage. Do not put credentials or session tokens in localStorage.
- Only the configured SpacetimeDB service identity may invoke the access command reducer or credential/session procedures. Never add public impersonation, bootstrap, user-ID login, or caller-selected actor endpoints.
- Derive the actor from the session hash. Validate active, unexpired organization membership and the backend permission matrix before every protected operation. Organization administrators have all declared permissions and access to every incident in their organization; other roles require active incident assignment. Keep tenant boundaries, expiry and revocation enforced.
- All security tables are private. Browser views join caller identity → connection grant → session → current memberships. Keep revocation and role changes reactive. One-second scheduled expiry invalidates expired subscriptions; server operations check current database time immediately.
- Expected rejected commands commit a denial audit and a private result envelope. Validate inputs before writes; unexpected exceptions must roll back the transaction. Never turn an unsuccessful database result into a success response.
- Demo SMS delivery is explicitly simulated. Do not invent a Photon API or claim delivery without a verified contract. Phone enrollment proves possession of the one-time demo link, not carrier verification or MFA.
- The trusted bootstrap generates random local passwords in ignored files with restrictive permissions. Preserve existing state and credentials. Never publish demo passwords in source or a public API.
- Test fixtures are reachable only by the trusted service with database `AEGIS_TEST_MODE=true`; keep that false outside isolated tests. There is no HTTP test-fixture endpoint.

## UI

- Preserve the five AEGIS references in `docs/design-references/` and existing pages. Do not redesign unnecessarily.
- Maintain the near-black background, white primary text, muted gray secondary text, thin neutral borders, compact consistent spacing and red/yellow/green status semantics.
- Adapt the UI to feature requirements, rather than adapting requirements to arbitrary components.
- Keep interfaces intuitive and accessible for responders operating under stress. Use text as well as color for status.

## Security and synthetic data

- Never trust frontend-only authorization. Backend reducers and subscription access must enforce explicit organization and incident permissions.
- Never expose secrets or use plaintext password storage. Server-only credentials must never use NEXT_PUBLIC_* variables.
- Never treat mock users or anonymous transport identities as authenticated identities without backend validation.
- Do not expose private incident data through unrestricted subscriptions.
- Do not depend on corporate systems for authentication. Clearly distinguish demo security controls from production guarantees.
- Use synthetic users, incidents, conversations, records and evidence where useful; keep them consistent across pages. Never use real personal or corporate incident data.
- Separate simulated incident information from functional platform behavior. Avoid unnecessary production integrations.

## Validation and documentation

- Validation must be proportional to the change. Keep all build/test commands working, but do not run every command after every edit. This project-specific policy overrides blanket defaults to run all checks for each change.
- Before running checks, briefly identify the affected behavior and the smallest checks that verify it. Batch related edits, validate the final diff, and stop once those checks pass. Broaden testing only for a concrete dependency, failure, or unresolved risk.
- Documentation/instruction-only changes: inspect the diff and run `git diff --check`; do not run builds, lint, typechecks, unit tests or browser tests unless executable configuration or behavior also changed.
- Small styling/copy/layout changes: lint the changed source files and inspect the affected view at representative viewport sizes. Run focused browser checks only when interaction, accessibility or responsive behavior changed; do not run the full suite for cosmetic changes.
- Local logic/component changes: run the relevant unit tests, lint changed source files, and typecheck the affected workspace when types or module boundaries are involved. For an integration change, select the affected browser spec or test with `--grep`, using the actual backend. Do not substitute a production build for a focused behavior check.
- Full browser regression is warranted for broad cross-feature changes, cross-cutting authentication/authorization or schema/subscription changes, major integration/merge checkpoints, or an explicit user request. State the reason before launching it. A small launcher fix requires startup/logging/cleanup and representative smoke checks, not automatically all incident/security workflows. Run the restart test when scheduler, persistence or process-lifecycle behavior changes.
- Run a production build when build/runtime configuration, dependencies, server/client boundaries or deployment behavior changed, or at a warranted integration checkpoint. Do not repeat it after unrelated cosmetic follow-ups.
- After a failed check, diagnose it and rerun the affected tests. Do not restart the entire suite by default, repeatedly rerun passing checks without relevant edits, increase timeouts to conceal failures, or add redundant tests that merely assert framework/native behavior or exact demo colors/counts. Report failures and skipped coverage explicitly.

### Reuse the installed tools

- On this Windows machine, activate the existing project toolchain from the repository root with `. .\.spacetime\tools\activate.ps1` before build/database/browser commands. Reuse its Node, npm and `SPACETIME_CLI`; do not rediscover/download another CLI, reinstall dependencies or copy the project just to run checks when the existing environment works.
- If activation is unavailable, inspect the existing `.spacetime/tools/` installation and report the specific missing prerequisite before provisioning replacements. Preserve credentials, database state and existing services.
- Pass test filters directly to the workspace script, for example `npm run test --workspace @aegis/frontend -- tests/scope-rules.test.ts` or `npm run test:e2e --workspace @aegis/frontend -- scope.spec.ts --grep "validates durable relationships"`. Do not forward filters through the root wrapper, which can consume npm flags incorrectly.

### Browser runs must be exclusive

- Never overlap browser-test runs, including focused runs, across chats or temporary checkouts. They share ports 3100/3101/3201 and may share database/build state. A different report/output directory does not isolate a run.
- Before starting, atomically acquire a host-wide lock at `%TEMP%\aegis-browser-tests.lock` using exclusive file creation; record the runner PID and process start time. Hold it through server teardown and release it in cleanup. If another run owns it, wait or coordinate; do not launch a competing run. Remove a stale lock only after verifying its recorded owner is no longer running.
- Check the dedicated ports and existing test processes before launch. Never kill or borrow another chat's active server. Clean up only verified abandoned disposable test processes or processes owned by the current run; preserve the developer app on 3000/3001.
- Do not publish, reseed, regenerate bindings or edit source while another chat's browser run uses this checkout. Coordinate or wait until it finishes. Do useful independent read-only work while waiting, and avoid frequent polling or repeated unchanged status messages.
- Report the selected checks, results and elapsed time, including setup when measured. Distinguish a complete successful suite from tests that passed across separate reruns. Do not delay delivery for unrequested screenshot collections, exhaustive visual audits or unrelated cleanup.

- Verify integrations against the actual backend; do not replace integration checks with mock success. Browser smoke tests use dedicated ports 3100/3101 and a separate DB. `scripts/e2e.mjs` gives each run fresh temporary synthetic state through `.spacetime/e2e`, retains prior states in a private run manifest, and refuses an occupied database test port. Never reset or reuse the developer database to make tests pass.
- Read the installed SDK implementation/types and current CLI help when unsure. `useTable` currently returns `[rows, isReady]`, not an isLoading flag.
- Do not claim unexecuted checks passed. State unresolved issues accurately.
- Update README when setup, scripts, environment variables or dependencies change. Update this file when architecture constraints change. Keep docs aligned with actual code and never label planned features complete.

## Change management

Prefer minimal viable changes. Do not refactor unrelated code. Reuse existing components and utilities, preserve existing work and Git history, and avoid duplicated logic. Do not commit secrets, local DB state, build output or test artifacts. Do not make unrelated commits or push without a user request.

## Phase 2 documentation and evidence

- Preserve append-only `incident_events`: corrections reference the original with actor/time/justification. Never edit/delete history during normal operations. Current incident/finding rows may change only alongside new events.
- Reuse the existing service-gated command boundary and backend permission matrix. Validate all input and same-organization/incident entity links before writes; preserve transactional denial semantics. Never expose raw private tables or file storage references in browser projections.
- Keep finding investigation state independent of per-user reads, visits and notification read state. Confirmation/resolution requires linked evidence, human verifier/time and justification; do not infer certainty from a file hash or access path.
- Store evidence originals outside public assets using `EVIDENCE_STORAGE_DIR`, random UUID names, 5 MiB size limits and restrictive file permissions. Preserve original bytes; append annotations separately. Recheck authorization before serving, verify SHA-256, render text as escaped text and use authorized blob previews. No filesystem paths in public metadata.
- `backend/seed/evidence-manifest.json`, `mock-evidence/`, and the versioned backend fixture define one consistent synthetic story. Routine seed runs preserve existing/user-created rows and original files. Never import the test-only ground-truth oracle into application or seed code.
- The only demo reset clears disposable IR-2043 read/visit state with explicit opt-in and module `AEGIS_DEVELOPMENT_MODE=true`. Never broaden it to erase shared Acme data or Phase 1 users. Publish development mode false outside local/test.
- Keep the five reference layouts; Operations uses persisted approval/recovery requests. Phase 3 implements constrained graph traversal and synthetic record inventory; Phase 4 adds real Team communication/tasks/paging. Phase 5 now implements predefined approvals, simulated recovery and immutable reporting; do not broaden this into live infrastructure actions.

## Phase 3 scope conventions

- Scope inventory is shared within an organization; explicit incident associations and incident-specific assessments control visibility and certainty. Never make compromise a permanent global asset flag.
- Graph Evidence/Finding/Incident nodes must reference existing Phase 2 rows. Reuse the existing evidence viewer, private file store and append-only event table. A scope change must write a real event in the same reducer transaction; preserve prior assessments/justifications.
- Validate both relationship endpoints, organization/incident association, type compatibility, evidence provenance and duplicate keys before mutation. No cross-incident evidence reuse is currently supported; do not infer authorization from an ID.
- Keep separate impact dimensions. Confirmation requires evidence, backend scope:verify and recorded verifier/time. Group or dataset certainty never automatically confirms individual records.
- Count inventory, potential exposure and individually confirmed impact separately. Use actual membership sets and `shared/scope.ts` to avoid double-counting overlapping groups. An aggregate confirmed record may still have unverified impacts in other dimensions.
- Deterministic potential-path traversal supplies leads only. Never automatically mutate downstream statuses or equate CAN_ACCESS with observed use. Preserve uncertain relationships and explain the path.
- Keep private records out of full browser subscriptions. Use fresh service-gated paginated queries (maximum 50); load only an anchor/selected record into the graph. scope:records is separate from scope:view; administrators have both permissions, while Operations does not inherit record access.
- `shared/` contains only pure cross-runtime rules/types, never credentials, filesystem code, React or database side effects. Keep frontend UI in frontend/ and schema/reducers in backend/spacetimedb/.
- Extend `acme-phase3-v1` fixtures idempotently; preserve user work, all Phase 2 originals and access controls. Keep hidden ground truth test-only. Do not broaden the existing narrow read-state reset into destructive inventory deletion.
- Phase 3 itself adds no automated comparison. Addition A below now supplies deterministic comparison of staged synthetic snapshots. No ML detection, sanitization, live network scans, graph database, approvals, recovery or reporting automation is part of Phase 3; Phase 4 communication is documented below.


## Phase 4 coordination conventions

- Keep messages/tasks/pages private and use the existing service-gated `coord.*` command boundary plus caller-scoped `visible_coordination_data`. Organization administrators can coordinate incidents and review every conversation/task in their organization. DM participation still requires current organization/incident access; administrator oversight does not add the administrator as a DM participant or permit impersonation. Keep self-verification and recipient-only page acknowledgment safeguards.
- Generate new coordination IDs server-side with the installed SDK's sortable UUID API and check uniqueness against persisted rows; do not assume a random ID is absent after repeated development runs.
- Messages are append-only safe text. Corrections reference originals. Preserve backend timestamps/IDs, personal read positions and stable client operation UUIDs; changed content cannot reuse a successful request ID. Validate all references before writes and never copy evidence or graph entities.
- A task/finding converted from a private message retains its conversation access boundary. Propagate this to references, projections, notifications, events and annotations. Never leak private sources by posting a derived reference into a broader conversation or graph. Existing Phase 2 finding rows remain authoritative; source provenance is separate. Broader Scope associations of conversation-derived findings are deliberately rejected.
- Acknowledgment confirms page receipt only. It never completes a task, resolves a finding or confirms an assessment. Investigation task completion requires a different authorized reviewer, evidence and technical verification permission. Coordination work requires independent review of its work note. Preserve append-only work/event history.
- The existing internal one-second SpacetimeDB scheduler owns page deadlines/escalation, never a browser timer or extra worker service. Default timeout is 300 seconds, one backup/commander escalation, current membership/reference checks and availability preference. Deterministic child IDs prevent duplicate escalation. Cancel pending pages on task cancellation/completion/reassignment; never erase history. Test durable behavior across a real DB restart.
- Availability is a manual organization-scoped declaration, not inferred presence and never an access grant. Busy/Unavailable paging requires explicit warning/confirmation. No SMS/phone delivery or end-to-end encryption is implemented.
- Keep `AEGIS_PAGE_ACK_SECONDS` server/module-only and bounded to 5–300 in development/test; force 300 otherwise. The service-only `coord.test.page_due` fixture requires `AEGIS_TEST_MODE=true` and must remain absent from HTTP routes. Normal clients never supply deadlines.
- Extend `acme-phase4-v1` idempotently. Preserve users, membership expiry, original EV-018, Customer Database, all user work and the narrow IR-2043 read-state reset. Browser tests use 3100/3101; the separate restart test owns disposable port 3201 and only its own temporary state.


## Phase 5 trust, recovery and reporting conventions

- Use `backend/spacetimedb/src/module-id.ts` for new persisted UUIDs; retain existing identifiers. Reuse graph entity IDs, Phase 2 original evidence, Phase 4 tasks/notifications and append-only incident events. Trust restrictions, operational state, recovery readiness and compromise/impact certainty are independent. Dependency traversal provides caution, never automatic downstream confirmation. Available does not mean verified safe; 1,240 inventory records are not 1,240 confirmed affected records.
- All recovery/report tables are private. Use `recovery.*`, fresh session/organization/incident permission checks and `visible_recovery_data`; never expose fixture outcomes, private file references, entire safe-record tables or raw report snapshots through browser subscriptions. Administrator access does not substitute for the required analyst/commander approval roles or bypass self-approval safeguards.
- Keep predefined immutable template versions. Distinct current analyst + commander approvals bind requester, parameters, evidence, trust context and expiry. No self/duplicate/stale/revoked approval. Recheck eligibility at execution, not only in UI. The existing internal database scheduler owns durable progression and access expiry; no browser timers or worker service. Retry creates a new linked execution with fresh approvals. Cancel preserves history and revokes grants.
- Infrastructure action/verification fixtures are explicitly synthetic. Outcomes can be selected only by the development/test trusted CLI, never normal HTTP/UI. Do not change source compromise/record assessments or close incidents automatically after simulated success. Task and finding verification remain independent. Closure is a separate evidence-backed approval request; do not bypass it through incident.update.
- Safe fallback data is an independently stored three-record synthetic subset, never a query against compromised inventory. Backend reads require current membership, explicit per-user grant, active execution, read-only policy, expiry and revocation checks. Never add write or unrestricted export routes.
- Reports capture a consistent database snapshot and monotonic version. Keep large immutable bodies in private report_snapshots, separate from subscribed incident_reports metadata; never rejoin bodies into live history views. Then persist immutable escaped printable HTML in the existing private original-byte store with SHA-256. Keep stable retry operation IDs; never overwrite originals or regenerate old versions from current data. Recheck all stored source permissions before/after file I/O. Missing fields permit interim reports and remain explicitly Missing/Unverified/Not Yet Established; no invented completeness percentage.
- Executive is a format, not a broader audience grant. Both formats require all report source permissions. Exclude private conversation-derived findings/tasks/events from incident-wide artifacts. Legal content adds legal:view, explicit human review and explicit privilege designation; never infer privilege or legal deadlines. NIST/VERIS/ATT&CK/CISA references describe selected alignment, not certification or automated compliance.
- Extend `acme-phase5-v1` idempotently, preserve prior originals/users/work, and keep the read-state reset narrow. Update `docs/phase5.md` when workflow, policies, snapshot confidentiality or simulation boundaries change. Preserve regression tests and verify new integration flows against actual SpacetimeDB, including restart durability.

## Addition A investigation conventions

- Addition A implements four P0 simulated connectors (Customers, Identity, Network, Business Services), private original snapshots, deterministic differences/observations, and a contextual `/investigation` workspace. HR/Payroll and other domains remain Planned/Unavailable. Addition A itself adds no model inference or proposal review; Addition B below now supplies those capabilities. Continuous collection, task/recovery recommendations and new reporting integration remain deferred to C.
- Preserve the five existing screen layouts and forms. Overview may add only the contextual Investigation link/status. New controls and source details belong in the dedicated route; do not add a sixth primary tab.
- Submission still derives the human from the existing session-hash command boundary. Persist a bounded job authorization with initiating actor, incident/source manifest, baseline choice, and membership/assignment revisions. Ordinary browser closure or natural session expiry does not cancel that job. Current account/membership expiry, incident access (including the existing organization-administrator policy), permissions, explicit cancellation and revision checks govern all protected worker reads/publication; regrant must not resurrect an old delegation.
- Only the separately configured `AEGIS_WORKER_IDENTITY` can use `investigation_worker`. Its server-only `SPACETIMEDB_WORKER_TOKEN` cannot invoke the access command, credential/session, finding, approval or recovery boundaries. Never add a generic caller-selected-actor endpoint. Lease/checkpoint ownership is backend-enforced; the existing internal scheduler only invalidates lost authority and retains its previous responsibilities.
- Read only allowlisted versioned UTF-8 JSON fixtures. Preserve original bytes/hash/private UUID paths; batch immutable normalized records with exact source locations. Missing export entries do not prove deletion, a baseline label does not verify provenance, and unchanged content does not establish safety. Registration populates source-specific staged inventory without confirmed impacts or authoritative findings.
- IR-2041 is protected from ingestion and automated investigation state changes. Integrity tooling is read-only and fails on conflicts; never repair/rewind originals or history. Retire legacy demo entries in list data without deleting them, preserve user work and all existing reset guards, and allocate fresh sparse scenario IDs idempotently.
- Keep `investigation.test.expireLease` trusted-service-only and gated by `AEGIS_TEST_MODE=true`, absent from normal HTTP routes. Isolated tests may suppress the automatic worker only with `AEGIS_E2E=1` plus `AEGIS_E2E_MANUAL_WORKER=1` and then drive the real narrow worker against the actual DB.
- Use focused unit and affected real-backend/E2E files at the A gate. Run durability coverage when worker/authorization/checkpoints change, not after unrelated edits. Preserve fresh 3100/3101 E2E state and disposable 3201 restart ownership. Update `docs/investigation-a.md` for actual workflow/limits; report executed checks accurately and leave unexecuted B/C coverage deferred.

## Addition B investigation conventions

- Continue on the Addition A branch when requested. Addition B is one bounded TypeScript model/tool investigation and an explicit human review flow; do not implement C, automatic tasks, recovery recommendations, continuous collection, permission changes, paging, safe-restoration declarations or closure. Preserve IR-2041 and the five screens.
- Configure only server-side `AEGIS_MODEL_API_KEY`, optional `AEGIS_MODEL_BASE_URL` and `AEGIS_MODEL_ID`. The default is OpenAI `gpt-6-luna` via Chat Completions with `reasoning_effort: none` for function-tool compatibility. One adapter and no provider fallback; never log keys, send them to the browser, or embed them in model context.
- Reuse the existing worker identity/procedure. Private `agent_runs` freeze source/evidence/observation/context manifests, actor authorization revisions, deadline, leases and checkpoints separately from A. Current authority checks use A's session-independent delegation rules. Initiation does not approve output; review uses a fresh session and destination permissions.
- Allow only parse_evidence, compare_snapshots, detect_anomalies, query_context_graph and propose_findings. Bound model calls, tool counts, context, time, retries and restart attempts. Treat source and incident strings as untrusted data; never provide arbitrary network, filesystem, SQL, shell or identity tools. Preserve completed deterministic results on model failures.
- Compile factual proposal claims from validated observations and exact evidence/snapshot/key/location/field/time/hash/rule lineage. The model selects a cautious interpretation, priority and supporting observations, rather than submitting unrestricted factual prose. Retain supported explicit account/source/time correlation; reject fictional citations, unsupported correlations, certainty claims and uninspected originals.
- Keep immutable proposal content in private `analysis_proposals`, outside live finding subscriptions. Expose safe job summaries; source/proposal details require fresh evidence and record permissions and bounded pages. No conversation content or private message-derived entities enter agent inputs.
- Accept/Reject requires a human reason. Preflight original hashes server-side before acceptance and recheck authority in the backend transaction. Reuse incident.finding.create and Scope validators atomically; allow only Unverified/Suspected and one explicitly reviewed existing-entity link. Preserve rejection history, exact retry results and conflicts; the agent never creates authoritative findings directly.
- Validate with focused grounding/model-error tests and the desktop real-model flow against isolated SpacetimeDB. Use fake model protocol output only for negative/review checks, clearly separate from the real-model gate. Do not rerun mobile or unrelated full suites when backend/desktop checks suffice.

## Investigation UX and impact review conventions

- Keep Findings (default), Evidence and Activity local to Investigation. Preserve the five primary screen components and navigation; show source coverage rather than affected/safe record counts, and keep exact identifiers/tool receipts expandable.
- Deterministic impact candidates reuse private analysis_proposals, existing Phase 3 dimensions and existing Scope entities. Resolve exact immutable citations and original hashes before review. No new assessment table or model write authority. Human acceptance must call the existing scope.assessment validator with fresh permissions, evidence and a required justification; never Confirmed or verified safe.
- Preserve current human decisions: compare the captured assessment with current authoritative state, reject stale acceptance, and route existing substantive assessments to manual Scope review. Rejection and idempotent review retain audit history. Missing export entries remain Deletion Unassessed; correlated traffic supports only system-level Suspected exposure, never dataset/record exfiltration. No encryption proposal without usable indicators. See docs/investigation-impact.md.
