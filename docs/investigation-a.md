# Addition A: incident intake and deterministic processing

Addition A adds a contextual Investigation workspace and synthetic snapshot processing. It does not include a model, proposals, proposal review, continuous collection, task generation, recovery recommendations, or new report formats. Addition B now supplies the separate model/review workflow described in [investigation-b.md](investigation-b.md). Addition C remains unimplemented.

## Using the workspace

Run the existing `npm run dev` command. It preserves the current database, publishes additions non-destructively, generates bindings, runs idempotent seeds, and starts one supervised investigation runner alongside Next.js. Create an incident with the existing New Incident form, follow **Start Investigation** from Overview, open **Evidence**, select implemented connectors, and choose **Collect Sources**. Overview stays available throughout; the existing five primary tabs are unchanged.

Four P0 connectors are implemented: Customer Records / CRM, Identity and Access, Network Activity, and Business Services and Dependencies. They read actual versioned UTF-8 JSON fixture bytes from the repository-owned allowlist in `backend/seed/investigation-connectors.json`. Each has baseline, initial, and later fixture versions. Only baseline/initial acquisition is exposed in A; later files are comparison test inputs, not a continuous collection feature. HR/Payroll are planned P1 connectors; the other six catalog entries are planned P2. Disabled entries cannot be submitted through the backend.

Collection is explicitly simulated. Parsing, validation, hashes, original preservation, comparison, domain rules, progress, subscriptions, and authorization are functional. No corporate connection, arbitrary file/path/URL selection, upload requirement, OAuth credential, or external service is involved.

The optional baseline checkbox permits current-snapshot processing without comparisons. Those records are **uncompared**, never unchanged or clean. A baseline is preserved evidence with unverified provenance; matching it does not establish source trust. Missing export entries do not establish deletion. Original timestamps are source-reported observations, separate from ingestion time.

Collection and deterministic analysis have separate persisted milestones. Before launching an agent pass, agent status is **Not configured**; Addition B now supplies a separate independent agent status. Source registration creates source-specific staged inventory and explicit incident associations using existing Scope tables, but no findings or compromise/impact confirmations. Inventory counts describe staged exports, not the entire corporate database or affected population. Detailed paginated comparisons and observations require current evidence and record access. Existing evidence preview routes serve hash-checked originals; no private storage references reach browser projections.

## Durable execution and authority

Private `incident_investigations`, `investigation_sources`, `analysis_runs`, `source_snapshots`, `snapshot_record_versions`, and `analysis_observations` extend the existing database. Caller-scoped `visible_investigation_data` contains only metadata, source status, and safe run summaries. Original bytes use the existing `EVIDENCE_STORAGE_DIR` UUID store with 0700/0600 permissions and 5 MiB limits. Normalized records use bounded batches and immutable original locations; finalization requires the expected complete record set. Current hard limits are four sources, 2,000 records per snapshot, 16 scalar fields per record, and 2,048 characters per string, with connector-specific field allowlists and 32,000-character worker request bounds.

User commands pass through the existing service-gated session boundary. Submission reuses current incident access and evidence upload/view, scope editing, and record permissions. Organization administrators retain the organization-wide incident access already defined by the application; other roles require current incident assignment. The database captures the initiating actor, immutable selected connector versions, baseline choice, membership/assignment revisions (or the existing administrator role scope), and a bounded 24-hour job authorization. It does not retain an ongoing dependency on the initiating session. Natural session expiry and closing every browser do not stop accepted work.

The worker has a separate configured SpacetimeDB identity and only the `investigation_worker` procedure. It cannot invoke the access command reducer, credential/session procedures, findings, approvals, recovery, or arbitrary actor endpoints. Each protected read/write validates the job scope, current account/membership/expiry/assignment/permissions, authorization revisions, and a 60-second lease. Role changes or revocation block publication immediately; the existing one-second scheduler also marks invalid active delegations revoked. Permission regrant does not silently restore the old authorization. A fresh authenticated retry creates a new linked-by-incident attempt, preserving old runs and originals.

Leases, source reservations, file UUIDs, batch checkpoints, and finalization live in the database. Restarting a runner resumes expired leases. Repeated reservation/batch/finalization requests are idempotent; an operation UUID reused with changed content is denied. Existing originals are verified, never overwritten, after uncertain outcomes. Explicit cancellation retains history and stops worker publication. Failures retain committed evidence and checkpoints, expose a safe diagnostic, and permit a new authorized initial attempt; later-snapshot collection is not exposed.

The internal scheduler only adds authorization invalidation bookkeeping; existing paging, expiry, and recovery responsibilities remain unchanged. Deterministic processing and file I/O happen under controlled worker actions, not in a browser timer. The shared rules support exact comparisons, unexplained field differences, new sign-in sources, traffic after reported isolation, and reported service interruption. They output review leads and source limitations, not claims of attribution or exfiltration.

## Configuration

Local configuration provisions a separate ignored `investigation-worker.json` with 0600 permissions next to `gateway.json` under `SPACETIMEDB_DATA_DIR`. The supervisor passes the worker token and strips gateway credentials from the worker environment. For independently hosted use, supply both server-only `SPACETIMEDB_WORKER_TOKEN` and module publication setting `AEGIS_WORKER_IDENTITY`, in addition to existing gateway configuration. Never put either token in `NEXT_PUBLIC_*`, source control, or browser storage. Back up the database and private evidence directory together.

Tests set `AEGIS_E2E_MANUAL_WORKER=1` only alongside `AEGIS_E2E=1`. That suppresses automatic runner startup so tests can execute the real narrow worker against the isolated database at deterministic checkpoints, including leases and revocation. Ordinary development always starts the runner. Test-only lease expiry is service-gated, requires `AEGIS_TEST_MODE=true`, and has no HTTP route. No test path selects a successful analysis or bypasses authorization.

## IR-2041 and historical scenarios

IR-2041 receives protected reference sidecar metadata. New collection/run creation is rejected for it; its incident metadata, assessment certainty, originals, graph, tasks, messages, approvals, recovery, and report history are not copied or rewritten. Existing human workflows remain available. Backfilled incidents remain usable and are never automatically analyzed when opened.

The existing historical IR-2042/IR-2043 fixtures remain stored for historical access and regression compatibility, but are retired from the default organization and selector lists without changing those components. New sparse scenario entries use fresh counter-allocated IDs: a runnable customer-service scenario and a non-runnable HR/payroll placeholder until P1 exists. User-created rows, credentials, membership expiry, and all prior seed IDs remain intact. The existing development-only IR-2043 read/visit reset remains deliberately narrow.

Read-only integrity tooling captures a private versioned manifest of existing reference rows, shared dependencies, and original digests:

```sh
# Capture once, before further work; refuses to overwrite an existing baseline.
npm run demo:reference -- --capture

# Verify captured rows/originals; new appended work is retained.
npm run demo:reference
```

Conflicts fail with identifiers for diagnosis. These commands do not repair, rewind, restore, overwrite, or delete rows/files. Legitimate existing human workflows may change mutable reference rows and therefore warrant explicit diagnosis if a baseline differs. Integrity descriptors are service-only and absent from normal HTTP routes and subscriptions.

## Focused validation

Use the plan's change-based cadence rather than the full suite after each edit:

```sh
npm run test --workspace @aegis/frontend -- tests/investigation-rules.test.ts tests/scope-rules.test.ts tests/evidence-store.test.ts
npm run typecheck --workspace @aegis/backend
npm run typecheck --workspace @aegis/frontend
npm run test:e2e --workspace @aegis/frontend -- investigation.spec.ts investigation-restart.spec.ts incidents.spec.ts scope.spec.ts security.spec.ts coordination-restart.spec.ts
npm run build
```

The focused browser group retains the existing fresh 3100/3101 state isolation. Restart tests own only disposable 3201 state, refuse an occupied test port, and never stop the developer database. The investigation restart case publishes the repository's pre-Addition-A main baseline (`149b906`) into a disposable database, seeds existing evidence/work, upgrades with `--delete-data=never`, then interrupts and resumes a partially staged job across a real standalone restart. It separately checks natural session expiry, stale leases, explicit revocation, and original-byte preservation.

Actual check results and any unresolved limitations are reported in the Addition A PR; the commands above describe validation, not claims that an unexecuted command passed.
