# Addition C: continuous reassessment and response integration

Addition C extends the existing A/B worker and Investigation workspace with one subsequent allowlisted P0 snapshot. It preserves IR-2041, the five primary screens, previous human decisions, immutable originals and report versions. No new database tables, dependencies, model tools, primary tabs or production integrations are introduced.

## Demonstration

1. Create an incident and collect the four P0 sources in Investigation. Complete the existing initial investigation and review useful findings/assessments.
2. Choose **Collect next snapshot**. The existing narrow worker collects revision 2 from the repository allowlist and compares each source with its preserved revision 1 snapshot. Overview remains available; model completion is not a dashboard prerequisite.
3. Inspect added, modified, missing and unchanged entries in Evidence. Findings shows only newly applicable deterministic observations for this comparison. Earlier observations and review decisions remain accessible through **Snapshot history**.
4. Review new access/network evidence. A previously reviewed record can receive an Investigating access-context candidate even when its bytes are unchanged. A shared account is a potential access path, not proof of an actual record read or exposure.
5. Choose **Run Investigation** for the latest collection. The same bounded real model/tools can investigate the new evidence and produce precisely cited proposals. Model failure remains distinct from completed deterministic processing. Existing **Assess potential impact** supports deterministic candidates independently of model completion.
6. Accept a supported finding or assessment through existing authorization. Previous substantive human assessments remain protected and conflicting changes require manual Scope review. Nothing automatically becomes Confirmed, verified safe, recovered or closed.
7. From an accepted proposal, explicitly choose **Create follow-up task for me**. This uses the existing Team task workflow, attaches actual evidence/finding references and is idempotent for that responder/proposal. It never pages automatically. Recovery recommendations point to independent verification and existing Operations approvals; imported services do not acquire new executable recovery templates.
8. Generate a new report through the existing Operations reporting workflow. It includes versioned collection/reassessment status and source comparison lineage, current reviewed findings/assessments, tasks and response history. Earlier report snapshots and HTML originals remain immutable.

The fixture catalog supplies baseline 0, initial 1 and later 2. Once revision 2 completes, the UI marks further demo revisions unavailable and the backend rejects a third collection. HR/Payroll and P2 connectors remain Planned/Unavailable. Acquisition is responder-triggered simulation, not a production timer, live network monitor or arbitrary ingestion endpoint.

## Persistence, security and incremental rules

The existing private `analysis_runs.fingerprint` stores a backend-created immutable collection manifest: revision, previous completed run and exact prior snapshot IDs. Existing source IDs stay stable. A later run stores only its new current originals; comparison and agent manifests reference preserved prior originals as baselines without copying or rewriting them. No schema migration or generated-binding edits are required.

Every refresh requires fresh authentication and the existing collection permissions. The source set is inherited from the last completed run; callers cannot supply a revision, source path, actor, arbitrary URL or alternate baseline. Stable operation UUIDs return the original job; conflicting reuse, stale parents and overlapping collections are rejected. A failed/canceled attempt can be retried with fresh authorization against the previous completed run.

Collection reuses existing session-independent scoped delegation, leases, checkpoints and revocation checks. Original hashes are verified before processing preserved snapshots. Browser closure/natural session expiry does not cancel authorized work; explicit revocation prevents further protected publication. Human review requires current authentication separately.

Deterministic comparisons classify actual added/modified/missing/unchanged keys. Unchanged earlier anomaly events are not republished as newly discovered risks. New sign-in/network events and changed service state remain independent from content integrity. Missing export entries never establish deletion. Reviewed unchanged records sharing an account with a new suspicious sign-in produce bounded, exactly cited access-context leads (maximum twelve); no observed read or confidentiality impact is inferred.

New runs preserve earlier assessments and append a reassessment event with prior assessment references. Existing pending proposals whose sources are superseded cannot be accepted or newly published; their history is retained. New proposals still require human review, including manual Scope review where prior decisions conflict. Accepted review retries and task retries return their existing results.

Current source-declared service dependencies populate existing unverified DEPENDS_ON relationships and existing business-operation metadata. Source inventory retains historically seen records; per-snapshot export coverage remains separate. Inventory totals include retained historical records, never imply affected/safe counts, and missing entries do not delete inventory. Availability acceptance updates an inactive operation only through the human review transaction, preserving independent verification and recovery approvals.

Eligible current responders receive existing private incident notifications for new observations. Notifications contain bounded incident-level counts and a review prompt, not private record content. Source/detail permissions remain enforced by existing fresh commands and caller-scoped views.

## Recovery context and reports

New recovery fingerprints bind the requested operation's dependency closure, contained data/records, incoming access relationships, related assessments/restrictions/evidence and relevant source snapshot IDs. Incident association links do not connect unrelated sources into every approval boundary. Relevant evidence, source, assessment or dependency changes require renewed review; unrelated source changes do not invalidate all recovery work. Immutable policy/template versions and current approver/requester eligibility remain governed by Phase 5.

Existing persisted fingerprints retain their original conservative comparison semantics; no historical approvals, executions or reference records are rewritten. Closure remains an incident-wide evidence-backed approval. There is no automatic recovery eligibility, approval, restoration, permission change, paging or closure.

The existing authorized report generator adds collection history with actual revision/stage/observation values and comparison snapshot IDs/counts. Pending interpretations remain explicitly non-authoritative. New reports use existing monotonic versions, private immutable snapshots, escaped HTML and SHA-256 storage. Legal/report-source restrictions remain unchanged.

## Focused validation record

- **33 unique focused unit tests passed across targeted invocations**: six incremental/context tests, eight impact tests and nineteen grounding/model tests. The initial 32-test selection passed in 869 ms; the affected grounding file passed 19/19 in 488 ms after adding exact-citation correction feedback. Validation remains strict and retry budgets were not increased.
- **Real-model desktop gate passed**, 28.5 seconds (36.7 seconds with isolated startup): actual altered later fixture bytes and a new network event key; collection after initiating-session expiry; comparisons across all four change classes; new access context on a previously reviewed unchanged record; eligible notification; real tool-driven correlated proposal; human finding and record-assessment acceptance; existing Overview, Timeline, Scope and Team updates; idempotent task creation; immutable report v1 and new report v2; source history; preservation of every pre-existing reference/shared row, exact IR-2041 incident rows and artifact manifest.
- **Authorization/idempotency case passed**, 1.3 seconds in its focused invocation: unauthorized/cross-organization/reference ingestion denial, stale parent denial, repeated job identity, conflicting UUID reuse and unavailable third revision.
- **Extended existing restart case passed**, 32.5 seconds in the initial selection: non-destructive upgrade, original preservation, session-independent processing, revoked publication denial, then later-snapshot reservation interrupted by a real database/worker restart and resumed against the exact previous snapshot.
- Both workspace typechecks, changed-file lint and isolated production build passed. No developer database reset or dependency installation was used.

Results are across selective reruns, not one all-green full-suite execution. Initial fixture-count/status expectations, the notification-table assertion, and an overly broad whole-organization equality assertion were corrected to verify their actual contracts. A real model's invalid citations were rejected; the existing bounded correction response now supplies the exact authorized tuple without accepting unsupported references or increasing budgets. No checks were skipped or weakened to bypass a failure. One attempted rerun refused occupied test ports; the other chat's processes were left untouched and work resumed after they finished.

Deliberately not run: full unit/E2E suites, mobile/tablet/cross-browser, load/performance, broad accessibility audits, unrelated coordination/recovery regressions or an exhaustive durability campaign. The single existing restart test was extended because the new run lineage must survive restart. Browser runs retain isolated 3100/3101 state and disposable 3201 restart state with exclusive host locking.

## Completion gate

- [x] Later actual fixture bytes change computed observations and supported incident understanding.
- [x] Earlier source versions, human decisions, evidence and reports remain intact.
- [x] An unchanged reviewed record receives a new access-context lead when supported.
- [x] A real model creates a non-preseeded, exactly grounded proposal for human review.
- [x] Reviewed findings/assessments update the existing incident and Context Graph models.
- [x] Notifications, explicit follow-up tasks, recovery recommendations and report v2 use existing workflows.
- [x] Relevant recovery context is bound without blanket invalidation from unrelated sources.
- [x] IR-2041 and all five primary screen components remain preserved.
