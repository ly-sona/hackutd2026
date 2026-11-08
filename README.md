# AEGIS

Independent Cyber Incident Response Platform for the **Winstead PC challenge at HackUTD 2026**. AEGIS uses its own accounts, permissions and database instead of the fictional affected organization's SSO, email, directory, VPN, DNS or messaging systems.

**Implemented: Phases 0–5 — independent access, live incident documentation, connected scope, real-time coordination, evidence-backed trust warnings, approved simulated recovery, restricted fallback access and immutable incident reports.** All five screens use authorized live SpacetimeDB data. Infrastructure restoration/verification is explicitly simulated; the workflow, approvals, tasks, access enforcement, report artifacts and version history are functional. This hackathon prototype demonstrates trust boundaries; it is not production-hardened or safe to use from a compromised workstation.

See [Phase 5 flows and boundaries](docs/phase5.md) for the three demonstration flows, approval policies, safe subset, standards alignment and report confidentiality.

## Stack and structure

Next.js **16.4.5** App Router, React **19.3.1**, strict TypeScript **5.9**, Tailwind **4**, shadcn/ui **4.23** (Radix), Lucide, React Flow **12**, Zod **4**, SpacetimeDB CLI/SDK **2.14.1**, Vitest **5**, Testing Library and Playwright **1.65**/Chromium. npm workspaces share one root lockfile. Node's standard crypto library provides scrypt password hashing and random opaque session/invitation tokens; no custom signing protocol or third-party identity provider is used.

```text
frontend/
  app/                     App Router pages and trusted API route handler
    login/                 Independent sign-in
    invite/[token]/        Invitation preview, acceptance and enrollment
    organizations/         Membership-based workspace selection
    org/[orgId]/           Protected incident pages, members and invitations
    development/           Phase 0 public synthetic health-check screen
  components/              Live incident documentation, workspace and access administration
    ui/                    Existing shadcn primitives
  lib/server/              Node-only gateway, sessions, passwords, delivery adapter
  lib/demo-incident.ts      Typed synthetic incident content; never authentication state
  src/module_bindings/     Generated and committed; do not edit manually
  tests/                   Unit/component tests and real-backend browser tests
backend/spacetimedb/src/
  index.ts                 Private schema, transactional commands, caller views, expiry
  incident-schema.ts       Private incident, finding, evidence, event and read-state tables
  incident-domain.ts       Fresh authorization, mutations and safe projections
  incident-seed.ts         Stable versioned fixture; never resets user records
  scope-*.ts               Private inventory, relationships, assessments, projection and seed
  coord-*.ts               Private conversations/tasks/pages, authorization, scheduler and seed
  recovery-*.ts            Private trust, approvals, durable recovery, reporting and safe-subset boundary
  permissions.ts           Authoritative role/permission matrix
shared/                    Pure cross-runtime scope, coordination and recovery/report rules
backend/seed/              Versioned evidence manifest with stable scenario references
mock-evidence/             Synthetic source artifacts; originals copied to private storage
scripts/                   Local orchestration, service identity and trusted bootstrap
  bootstrap.ts             Idempotent development seed; no public bootstrap endpoint
docs/
  architecture.md          Trust boundaries and real-time access lifecycle
  design-references/       The five supplied incident screen PNGs
  ui-audit/                Page-by-page fidelity audit and before/after captures
```

The [current UI design specification and restoration notes](docs/ui-audit/restored-live-ui.txt) document the approved five-page compositions, live control locations and shared styling for detail views. New desktop, phone and detail screenshots are saved in `docs/ui-audit/restored-live-v1/`. The [earlier UI audit](docs/ui-audit/audit.txt) and [Phase 3–4 merge notes](docs/ui-audit/merge-2d2e4bc.txt) are retained as history. Phase 5 replaces the Operations preview with persisted approvals and simulated recovery; the historical restoration screenshots predate these new controls. Local Geist/Geist Mono fonts and their license live in `frontend/app/fonts/`; no remote font request is required.

## Install and start

Use **Node 24.22.2 LTS** (`.nvmrc`, `.node-version`), npm 11 and SpacetimeDB 2.14.1. SDK minimums are Node 24.22.1+ or 22.23.4+ in those LTS lines. No Docker, Rust toolchain, corporate account or SMS provider is required.

```bash
# With nvm available:
nvm install
nvm use

curl -sSf https://install.spacetimedb.com | sh -s -- --yes
export PATH="$HOME/.local/bin:$PATH"
spacetime version install 2.14.1
spacetime version use 2.14.1

npm install
npm exec --workspace @aegis/frontend playwright -- install chromium
npm run dev
```

On the original setup machine, activate the isolated installed Node with:

```bash
export PATH="$HOME/.local/share/aegis-node/node_modules/.bin:$HOME/.local/bin:$PATH"
```

Open **http://localhost:3000**. Unauthenticated visitors are redirected to login. SpacetimeDB listens on **http://127.0.0.1:3001**; `/v1/ping` checks availability. It is an API/WebSocket endpoint, not a browser admin dashboard.

On Windows, the development scripts invoke npm through its JavaScript entry point rather than spawning the `.cmd` shim directly. Run the scripts through `npm run` so that entry point is available. Startup checks the frontend port before publishing or launching a watcher; if it is occupied, use the existing server or stop it before starting another. Ctrl+C terminates owned process trees on Windows as well as Linux/macOS, while leaving a reused database running.

Background child processes hide extra Windows console windows and remain attached to the original terminal, where their logs are still visible. Unix development processes retain their separate process groups for shutdown.

Startup reuses a healthy local database or starts one, provisions a separate private service identity, publishes the additive module, generates bindings and idempotently seeds the demonstration before starting Next.js and the official backend watcher. Existing data, passwords and CLI owner credentials are preserved. Schema changes never automatically delete data. Ctrl+C stops owned services; reused services remain running.

Each locally started database keeps its signing key pair (`id_ecdsa` and `id_ecdsa.pub`) inside its own ignored data directory. Development, browser tests and restart tests use explicit key paths so their identities remain stable and isolated from the CLI's global signing keys. Preserve these keys together with `cli.toml`, `gateway.json` and the database state when moving or backing up a local database. A partial key pair fails startup rather than replacing an existing key. An `InvalidSignature` error means the stored credentials and server key do not match; do not delete the database or replace its identities to work around it.

`npm install` creates `frontend/.env.local` only if absent and links npm's hoisted TypeScript compiler into the module-local executable location expected by the CLI. `npm ci` uses the same setup hook. On Linux, install browser system dependencies with `npm exec --workspace @aegis/frontend playwright -- install --with-deps chromium` if needed.

## Demo accounts and access flows

Passwords are randomly generated on the first trusted bootstrap and stored **only locally** in ignored `.spacetime/data/demo-accounts.json` with mode 0600. The database stores salted scrypt hashes. No passwords are embedded in source or exposed by a public account-selection endpoint.

```bash
npm run demo:accounts   # Explicitly display private LOCAL demo credentials
```

Do not share that output or commit the file. An optional private `AEGIS_DEMO_PASSWORD` can set the initial demo password; changing it does not reset existing accounts.

| Account name | Synthetic responder | Role / initial access |
| --- | --- | --- |
| `sam.patel` | Sam Patel | System Administrator; active |
| `maya.chen` | Maya Chen | Incident Manager; active |
| `alex.rivera` | Alex Rivera | Security Engineer; active |
| `priya.shah` | Priya Shah | Legal & Compliance Officer; active |
| `jordan.davis` | Jordan Davis | Business Continuity Manager; active |
| `taylor.morgan` | Taylor Morgan | External Security Engineer; pending invitation, temporary membership |

Role names are shared by the UI and newly generated reports. Internal identifiers (`administrator`, `commander`, `analyst`, `legal`, `operations`) remain unchanged; the merged organization-administrator access policy and independent approval rules are preserved.

Taylor’s `analyst` role is separate from membership status and expiration. Temporary access has a seven-day window; an unexpired deadline is preserved when an invitation is accepted, while an expired temporary membership receives a new seven-day window after a valid administrator-issued invitation. It never becomes permanent through renewal. Invitation links themselves still expire after one hour.

All six accounts require their real locally generated passwords. `corporate-admin@techniq.example` is deliberately **not** an AEGIS account and grants no access. Techniq members cannot open the separately seeded restricted Northstar organization. Techniq has three connected synthetic scenarios: **IR-2041 — Ransomware response**, **IR-2042 — Administrative account review**, and **IR-2043 — Unauthorized access investigation**. The incident selector lists your assignments; organization administrators see every incident in their organization.

1. Sign in as Sam; choose Techniq and IR-2041. Overview, Scope, Operations, Team and Timeline retain the supplied dark visual language.
2. Open Team → Invite responder. Choose Taylor or an independently verified phone number, select a predefined role, and generate an invitation.
3. The administrator-only **simulated delivery** panel shows the one-time link. No SMS delivery is claimed. Existing responders sign in before accepting; new phone recipients choose an independent username and password using the valid invitation link.
4. Team → Manage members provides search, role filtering, member details, role confirmation and access revocation. Invitations lists pending/historical records and supports revoke/replacement. Replacement invalidates the previous token.
5. Open another browser session as a responder. Role changes update its available permissions; revocation removes the workspace content and blocks subsequent protected reads/actions. The last active administrator cannot be removed or demoted.

## What is enforced

- Next.js validates credentials against private SpacetimeDB credential records. Login failures are tracked with a five-failure, 15-minute per-account cooldown. Sessions use random 256-bit opaque values in HTTP-only, SameSite=Strict cookies, Secure under production HTTPS, and expire after eight hours. Only their hashes enter the database.
- Only the configured private service identity can call credential/session procedures and the access command reducer. Browser identity or client-supplied user/role fields never establish an authenticated actor.
- Each protected request rechecks active, unexpired organization membership, incident assignment and the central backend role matrix. Administrators manage access; they do **not** automatically receive `operations:approve`.
- Private organizations, users, credentials, memberships, invitations, sessions, grants and audits cannot be publicly queried. Caller-restricted views supply current authorized browser data. Role changes/revocations update these views transactionally. A one-second scheduled expiry invalidates expired grants/memberships; protected operations check current database time immediately.
- Invitation secrets are random 256-bit values stored as SHA-256 hashes, recipient-bound, single-use and valid for **one hour**. Acceptance, membership grants and audit writes are transactional. Membership revocation preserves account and audit history.
- Same-origin checks protect mutation requests; safe local return paths prevent open redirects. Sensitive responses are uncached, referrers are suppressed, and Next.js incoming request logging is disabled to avoid logging invitation paths.
- Backend security events record actor/target IDs, timestamp, action, outcome and nonsecret metadata. Expected rejected operations commit denial audits and private result envelopes. No failed security operation is represented as successful.

## Synthetic content and limitations

The initial scenarios and original evidence are synthetic. Once seeded, Overview, findings, evidence metadata/links, events and read state come from the private database through authorized subscriptions. New user actions are real writes. Operations contains functional approval records and predefined simulated recovery. Conversations, tasks, manual availability and in-app paging are functional. Availability is not inferred presence. Live infrastructure actions, automatic contradiction detection and autonomous impact confirmation are not implemented.

Delivery uses a typed adapter with **demo mode first**. No verified Photon SMS API contract was provided, so Photon credentials are unused. Selecting external mode falls back explicitly to simulated delivery. For a new phone recipient, possession of the invitation link is the demo enrollment proof; administrator phone-verification attestation is not carrier verification, MFA or proof that SMS was delivered. Passkeys, password recovery, production-wide rate limiting, device trust and production identity assurance are not implemented.

The trusted Next.js service can validate credentials/create sessions and must be protected as part of the trust boundary. Browser SDK tokens stay in memory and authorize no private views until the server binds their identities to a validated session. Offline clients cannot receive revocation events until reconnecting; disconnected workspaces hide restricted content, and server operations always recheck access. Previously viewed information cannot be retroactively erased from a device.

The original development dependency audit reports 13 low/moderate transitive tooling advisories; `npm audit --omit=dev` reports no production dependency vulnerabilities. Review updates before any deployment beyond this controlled demonstration. Test traces and private local state may contain credentials/activation URLs; treat them as private and never upload them unredacted.

## Commands and testing

```bash
npm run dev             # Full local environment; preferred
npm run dev:db          # Standalone DB only; reuses an existing instance
npm run db:publish      # Publish with the configured local service identity
npm run db:generate     # Generate frontend bindings
npm run db:seed         # Idempotent access + Phases 2–4 seeds; DB/module must be running
npm run demo:reset -- --confirm-disposable-demo # ONLY IR-2043 personal read/visit state
npm run dev:frontend    # Frontend only, with local service credentials inherited
npm run env:check       # Installed versions and local configuration

npm run build           # Backend type-check/bundle + production Next.js build
npm run lint
npm run typecheck       # Both workspaces, including generated bindings
npm run test            # Unit/component and shared domain-rule tests
npm run test:e2e        # Seven critical desktop flows against real SpacetimeDB
npm run test:e2e:extended # Opt-in recovery, administrator and invitation regressions
npm run test:e2e:restart # Opt-in real database restart durability
```

The default suite covers access boundaries/live revocation, incident documentation/private evidence, record-specific scope, live messages/DM privacy, independent task review, server paging and desktop navigation. Mobile automation, exact styling/chronology checks, public health diagnostics and duplicate workflow tours have been removed. Newer recovery/administrator/invitation regressions remain opt-in. See [the current testing guide](docs/testing.md) for coverage, tradeoffs and focused commands; the earlier [test audit](docs/test-suite-audit.md) is historical.

Playwright owns ports **3100/3101**, database `aegis-e2e`, `.spacetime/e2e/`, and `.next-e2e/`. Its npm commands acquire an exclusive host-wide `aegis-browser-tests.lock` in the OS temporary directory through server teardown. Do not bypass the wrapper for browser execution. The runner creates fresh synthetic state in an OS temporary directory for each run, points the ignored `.spacetime/e2e` symlink at it, and records all previous state locations in `.spacetime/e2e-runs.jsonl`. It never deletes or resets previous state and rejects occupied test ports. It does not modify the developer environment file. The optional restart test also owns port **3201**.

Expiry fixtures require **both** the trusted service identity and database `AEGIS_TEST_MODE=true`; the local runner enables them only in its isolated E2E mode. There is no HTTP fixture endpoint. Do not enable this flag on a shared demo deployment. Tests use local credential files instead of authentication bypasses.

## Configuration

Root `.env.local` is optional; frontend `.env.local` is generated from its template. Shell values take precedence, then root values, then frontend values in development scripts. Keep public values consistent between files. Restart services after changes. `NEXT_PUBLIC_*` values are embedded at build time and require rebuilding when changed.

| Variable | Purpose / default |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical application origin and activation links; `http://localhost:3000` |
| `NEXT_PUBLIC_SPACETIMEDB_HOST` | Database endpoint; `http://127.0.0.1:3001` |
| `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` | Published database; `aegis-local` |
| `SPACETIMEDB_DATA_DIR` | Ignored local state and private credential directory; `.spacetime/data` |
| `SPACETIME_CLI` | Optional explicit CLI executable; official local installation/PATH otherwise |
| `SPACETIMEDB_SERVER_TOKEN` | **Server-only** service token; local runner provisions/loads `gateway.json` |
| `AEGIS_GATEWAY_IDENTITY` | Matching service identity, also published as module configuration |
| `AEGIS_DEMO_PASSWORD` | Optional **private** first-bootstrap password; random per account otherwise |
| `EVIDENCE_STORAGE_DIR` | Server-only absolute private directory; local runner defaults to `<SPACETIMEDB_DATA_DIR>/evidence`. Required for separately hosted evidence uploads/downloads. Never put it under `public/`. |
| `AEGIS_DEVELOPMENT_MODE` | Module publication flag for narrowly scoped read-state reset. Local runner sets `true`; explicitly set `false` for non-development publication. |
| `AEGIS_PAGE_ACK_SECONDS` | Server/module-only development acknowledgment timeout, integer 5–300 seconds; default 300. Ignored outside development/test. Set before publishing/restarting. |
| `SMS_DELIVERY_MODE` | `demo`; `external` currently falls back explicitly to simulation |
| `AEGIS_TEST_MODE` | Database fixture flag; `false` outside isolated browser tests |
| `PHOTON_API_KEY`, `PHOTON_SENDER` | Reserved **server-only**, unused until a provider contract is verified |

Internal controls `AEGIS_E2E`, `AEGIS_FRONTEND_PORT` and `AEGIS_NEXT_DIST_DIR` are set by Playwright. Session/invitation lifetimes are backend policy constants, not user-controlled environment overrides. Opaque database sessions need no session-signing secret.

## Deployment template

[.env.production.example](.env.production.example) documents an independently hosted demo. No deployment was performed. Use HTTPS for both origins; inject actual service credentials through the host's secret store. Provision a SpacetimeDB service identity independently of corporate infrastructure (the official identity endpoint/SDK), keep its token private, and publish its matching identity with the module:

```bash
# With the template's real configuration securely exported:
spacetime publish --module-path backend/spacetimedb --server "$NEXT_PUBLIC_SPACETIMEDB_HOST" --delete-data=never "$NEXT_PUBLIC_SPACETIMEDB_DB_NAME"
npm run build
npm exec --workspace @aegis/frontend next -- start --hostname 0.0.0.0 --port 3000
```

The module declares `AEGIS_GATEWAY_IDENTITY`, `AEGIS_TEST_MODE` and `AEGIS_DEVELOPMENT_MODE`, so the CLI supplies those exported values at publication. Use the trusted `scripts/bootstrap.ts` explicitly if creating a separately hosted synthetic demo, preserve its private password file, and keep test fixtures disabled. Configure TLS/hosting and redact invitation paths from any hosting/proxy logs. The local runner intentionally refuses remote publication; use the explicit CLI deployment command. This template is not a production-security guarantee.

## Troubleshooting

| Problem | Resolution |
| --- | --- |
| Wrong Node or CLI | Activate `.nvmrc` / the isolated Node path above; CLI and SDK must match 2.14.1. |
| Port conflict | Inspect `lsof -nP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN` (3100/3101 for tests). Stop the conflicting frontend/process. A healthy local DB is reused. |
| Sign-in unavailable | Start with `npm run dev`, not a bare frontend command. It provisions the private service identity and seeds accounts. Check `/v1/ping`. |
| Invalid credentials | Use independent account names and `npm run demo:accounts`. Corporate identities are deliberately rejected. Five failed attempts impose a 15-minute cooldown. |
| Lost password file | Password hashes cannot recover passwords. Restore the private seed file or provision a separate disposable development DB; do not overwrite another developer's data. |
| No workspace | Taylor starts pending. Accept the intended invitation after independent login. Other users require active organization **and** incident memberships. |
| Expired/revoked invitation | An administrator can generate a replacement from Invitations. Old links cannot be reused. |
| Wrong origin/endpoint | Align canonical app origin and frontend DB settings, then restart/rebuild. Production mutations accept only the configured application origin. |
| Missing/stale bindings | Run `npm run db:generate` and `npm run typecheck`; never edit generated files. |
| Publish denied | Preserve `.spacetime/<state>/cli.toml` owner credentials and `gateway.json` service credentials. Check compiler output and module environment. No automatic data deletion occurs. |
| Install/TypeScript failures | Use the pinned Node version and root `npm ci`. The postinstall restores the backend compiler link. Keep one lockfile and npm. If sync software duplicated files (for example `routes.d 2.ts`), stop Next.js and remove only generated `.next*`/`node_modules` caches before reinstalling. Prefer a local, non-synced checkout for database/cache files. |
| Cloud-synced files stall reads/builds | On macOS, keep active source/dependency folders downloaded in Finder, or use a local checkout outside iCloud Desktop/Documents. Preserve database state and private credentials; cloud placeholders are not evidence of a failed schema or a reason to reset the DB. |
| Browser missing | Install Playwright Chromium with the command above. |

Next phase: **5** Trust Warnings, Recovery & Reporting. See [architecture](docs/architecture.md) and [AGENTS.md](AGENTS.md) before extending the system.

## Phase 2 incident documentation

Use the header incident selector or the organization list. Incident Manager/Administrator can create incidents; the creator, optional commander and selected active responders receive incident assignments. Other roles retain their existing responsibilities: Incident Manager manages incident lifecycle/description/severity; Incident Manager and Security Engineer update and verify findings/upload evidence; Legal and Operations can submit observations/findings and notes; evidence viewing follows existing permissions. Organization administrators have every declared permission across all incidents in their active organization, including investigation, scope, coordination and operational permissions. Tenant boundaries, session/membership expiry and independent verification still apply.

- **Overview:** live severity/status, commander, discovery/report time, unresolved and personal new counts, findings, business impact, evidence and recent events. Add Finding records observed time, category, priority, investigation status, system, optional assignee and evidence. Open a finding to mark only that finding read. Reading never resolves it. Confirmed/Resolved findings require same-incident evidence and a verifier justification; the backend records verifier/time. Evidence links are additive; an update never silently removes prior supporting links.
- **Timeline:** newest first, UTC storage with America/Chicago display and deterministic ID tie-breaking. Filter Findings/Evidence/Status Changes/Decisions/Access Changes; select an event for source/actor, observed versus recorded times, prior/new values and evidence. Document observations, reported actions, decisions and corrections. Corrections append an event referencing the original and a justification; no normal update/delete-history endpoint exists. Recording an action does not execute it.
- **Since your last visit:** the backend captures the prior last-viewed timestamp before updating it. A per-document visit UUID holds the cutoff stable through App Router navigation and Strict Mode remounts. Reload/opening a new document starts another visit. First visit shows current summary. Finding reads are independent from visits and investigation status. This MVP does not infer browser inactivity as a new visit.
- **Notifications:** the header notification center and its creation, read API and browser projections have been removed. Urgent in-app paging remains available through the persistent page banners. Retired private notification tables are retained only to preserve existing database records. No SMS or calls are sent.

### Private evidence

Accept UTF-8 TXT/LOG, valid JSON, PDF, PNG and JPEG, **1 byte–5 MiB**. Choose a file or create a text note. Specify description/source, optional collection time, annotation and literal excerpt; a finding upload links it to that finding. The incident-level upload links to its incident, and finding edits can attach existing evidence. The viewer shows actual original text/image bytes, source, upload/collection times, SHA-256 and annotations; literal excerpts are highlighted without HTML interpretation. PDFs download without embedded preview.

Next.js bounds the incoming multipart stream, validates extension/content type and practical signatures, assigns randomized storage names and writes immutable private originals with restrictive permissions. SpacetimeDB stores metadata/hash and relationships only. Downloads require a fresh active session, incident assignment and evidence permission before and after file I/O; storage references never enter browser views. Original bytes are hash-checked before serving, with `no-store`, `nosniff` and attachment downloads. These checks are not malware scanning, forensic chain of custody or proof of authenticity. File and database writes cannot form one transaction: known rejected commands clean up the new file; a transport failure or process crash can leave an unreferenced private file. Uncertain commit outcomes preserve originals to avoid deleting a file referenced by a committed record. There is no automated deletion or retention policy. Back up private files together with database state and the private seed mapping.

### Reproducible synthetic scenario

`npm run dev` and `npm run db:seed` run the same trusted, versioned `acme-phase2-v1` seed. It creates 3 incidents, 9 findings, 26 historical events, 10 real private artifacts, using fixed **November 7, 2026 / America/Chicago** timestamps. Stable IDs and `scenario_seeds` make repeat runs no-ops for database records; original-file mappings verify hashes and never overwrite files. Phase 1 users, credentials, roles, revocations and user-created data are preserved. Deliberately missing/corrupt originals fail rather than being silently replaced.

IR-2041 retains the 09:04 opening, 09:08 historical invite, 09:18 isolation report, 09:21 traffic observation, 09:24 EV-018 upload and 09:26 manually seeded containment flag. EV-012 supports an action report, not successful containment; EV-018 supports traffic, not origin/cause; EV-021 supports an unusual transfer, not customer contents; EV-024 supports suspicious account activity, not confirmed compromise. A-09 → Customer Database → October Customer Records → C-1044 are lightweight continuity references; no individual customer dataset or graph engine is generated.

`npm run demo:reset -- --confirm-disposable-demo` explicitly resets **only per-user read and visit windows for disposable IR-2043**, and only when the published module has `AEGIS_DEVELOPMENT_MODE=true`. It never deletes findings, uploaded originals, events, incidents, memberships or accounts. To restore the story to a clean state, use a separately named local database/state directory; there is intentionally no destructive shared Techniq reset or HTTP reset endpoint. `frontend/tests/fixtures/ground-truth.private.ts` is a test-only fictional oracle, excluded from application imports and normal APIs/subscriptions. It is not a secret from people who have source repository access.

Data model: incidents retain current lifecycle/metadata; findings retain investigation state, observation/report/verification provenance; append-only events retain every change; evidence and evidence links separate original metadata from annotations; finding reads and incident visits/visit windows are private per-user state. All are protected by the existing session → organization → incident → role boundary.

Documentation follows capture and review principles from [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final): observations, actors, timestamps, affected systems, assessments, supporting evidence, response decisions and recovery status. This MVP makes no NIST compliance claim.

The minimal default integration suite retains incident/finding writes, evidence-backed verification, original-byte retrieval, private access and append-only corrections. Pure incident/evidence rules remain unit-tested. Detailed visit/notification, seed/reset and presentation permutations are no longer automated integration scenarios; see [testing coverage](docs/testing.md).

## Phase 3 compromise scope and Context Graph

The Scope page preserves the dotted React Flow canvas, directional labeled relationships and selected-entity panel. On small screens, details open in a dialog. Pan, zoom and Fit View are built in. Select a node or use Find scope entity; Expand/Collapse related reveals a bounded neighborhood, and Reset focus restores the incident focus. The graph shows at most 50 nodes and never renders all customer records. Filters support entity type, investigation state, impact dimension, sensitivity and evidence availability. Dashed links indicate uncertainty; solid inventory links establish structure, not compromise.

Inventory supports Account, System, Dataset, Record Group and Business Operation entities, with shared asset subtypes (user/administrator accounts, server, database, application, identity/storage/business service). Incident, Finding and Evidence nodes project existing Phase 2 records: they are not duplicate stores. In particular **EV-018 opens the same privately stored, hash-checked Phase 2 artifact**. Relationships support CAN_ACCESS, STORED_IN, CONTAINS, DEPENDS_ON, SUPPORTS, RELATED_TO and POTENTIALLY_AFFECTS. The backend validates both endpoints, type compatibility, current incident association, organization, evidence provenance and duplicates.

**Investigation workflow:** select an entity → review each impact dimension → Add impact assessment or Update assessment → enter description/justification and existing evidence → save. Compromise states are Unassessed, Investigating, Suspected Compromise, Confirmed Compromise and Ruled Out. Encryption, Exfiltration, Alteration, Deletion and Availability each have independent Unassessed/Suspected/Confirmed/Ruled Out assessments. Confirmation requires supporting evidence and an authorized verifier; actor/time and prior assessment are preserved in an append-only Phase 2 scope event. Challenged evidence is documented through a new assessment and justification; old events and originals remain intact.

Link Evidence adds an annotation/excerpt to the existing original. Upload through the existing Phase 2 Attach Evidence action, then link the resulting artifact. Add Finding creates a real Phase 2 finding and a persisted relationship to the selected scope entity. Scope events in Timeline offer Open scope entity links. No graph action executes infrastructure changes, recovery or approvals.

**Record browsing and counts:** Customer Database → Customer Records → October Customers → C-1044 is persisted data. Browse the group, search a stable synthetic record ID and select it to return to the graph. Reads are authorized, paginated (25 by default, maximum 50), and can filter impact/status. Record metadata contains synthetic references/category/sensitivity, not real personal data. Only an anchor and selected records appear as graph nodes; the full record table is never subscribed to the browser.

The seed contains **1,240 inventory records, zero initially individually confirmed affected records**, and preliminary assessments. Overlapping review/region groups are deduplicated using actual memberships. Dataset/group confirmation does not promote every member record to individually confirmed. Potential records exclude individually confirmed records across any impact; this aggregate does not imply all dimensions are confirmed. Not individually assessed is a separate coverage measure and may overlap potential exposure. For example, one verified Encryption assessment can increase individually confirmed count to one while Exfiltration remains Suspected. Datasets whose contents are not enumerated show unknown inventory counts rather than invented compromised totals.

Deterministic traversal follows documented access, containment, storage and dependency relationships, skips ruled-out links and terminates cycles. It provides potential investigation leads and explanations only. It never writes downstream assessments or converts access capability into proof of access/exfiltration. Scope summary counts are backend-derived; record details require an additional permission.

**Authorization:** Incident Manager and Security Engineer can edit/verify scope and inspect records. Legal can review records/evidence but cannot edit scope. Administrator has full scope editing, verification and individual-record access within their organization. Business Continuity Manager receives assigned incident summary counts, not technical scope or record contents. All reads/writes recheck session, organization, incident and role. Per-incident assessments are independent even when two incidents share one inventory asset; revocation clears subscribed graph data and blocks subsequent record/evidence reads.

**Seed:** `npm run dev` / `npm run db:seed` extend the existing bootstrap with `acme-phase3-v1`. Stable IDs add 8 systems, 5 accounts, 3 datasets, 5 record groups, 2 business operations, 1,240 minimal customer records, explicit overlapping memberships, relationships and preliminary assessments. Reruns preserve existing/user-created records, original evidence, memberships and history. IR-2042 demonstrates an independent assessment on the same account. The existing opt-in IR-2043 reset remains deliberately limited to personal read/visit state; it does not erase Phase 3 inventory. Use a separately named disposable local database for a clean scenario. The existing test-only ground-truth oracle remains outside application imports, APIs and subscriptions.

New private tables: `scope_entities`, `scope_associations`, `scope_relationships`, `scope_assessments`, `scope_records`, `scope_record_memberships` and `scope_evidence_links`. `scope.*` actions extend the existing service-gated command reducer; `scope_read` provides fresh authorized record/inventory queries, and `visible_scope_data` provides caller-restricted live graph projections. `shared/scope.ts` contains pure counting/traversal rules used by the backend and unit tests. No additional service, dependency or graph database was introduced.

The minimal Scope integration scenario verifies paginated record lookup, evidence-backed single-record impact, independent dimensions, count changes and role restrictions. Unit tests retain overlapping-group counting and deterministic traversal checks. Detailed graph-control and seed tours are no longer integration scenarios. Optional general baseline/record comparison, anomaly detection and automated cleaning remain unimplemented. Phases 4 and 5 follow below.


## Phase 4 communication and coordination

**Team:** Incident creation atomically creates a response room. Its membership follows current, unexpired incident access; there is no separate chat entitlement that can bypass membership. Incident Manager, Security Engineer, Legal and Operations responders participate. Organization administrators participate in incident chat and tasks and can review all organizational conversations. Other participants’ DMs are read-only for administrator oversight; admins start their own DMs to communicate as themselves. Taylor participates only after activation while temporary access remains valid. The left column searches conversations/responders, starts incident-scoped one-to-one DMs, shows roles/declared availability, and preserves access-management links.

Messages are safe plain multiline text, append-only, ordered by server time/ID and persisted in SpacetimeDB. A correction is a new message referencing the sender's original. A stable client operation UUID prevents duplicate writes/events on retries; reusing it with changed content is rejected. Conversation read positions are personal and never update task/finding state. Late eligible incident members can read room history; private DM history is limited to its two currently authorized participants. Revoking either participant disables further sends; the remaining authorized participant retains history.

**References and conversion:** The reference selector points to existing evidence, findings, scope entities/individual records/assessments and tasks. EV-018 opens the original Phase 2 viewer and authenticated bytes; Customer Database opens the original Phase 3 entity. No evidence or graph copies are created. Operations users can open minimal business-operation reference details without receiving technical graph, individual record or evidence access. Every reference is checked for organization, incident and viewer permissions. Use Create task or Add finding beside a message to prefill editable work and preserve its source ID. Tasks/findings derived from a private DM, their events remain restricted to that conversation; they cannot be forwarded as references into a broader conversation. Conversation-derived findings remain real Phase 2 rows. They are not attachable to a broader Scope association without a future explicit privacy-preserving review workflow.

**Tasks:** Shared tasks are available from Team, Overview, finding details, original evidence, scope entities and assessments. Track assignee, backup, priority, optional due date, references and append-only work notes. Incident Manager/Security Engineer can assign others, change due dates/reassign and explicitly page. Other responders create/update their own work. States are Open → In Progress → Awaiting Verification → Completed, with explicit cancellation/reopening. Completion requires a different authorized reviewer; Investigation tasks additionally require technical verification authority and supporting evidence. Coordination tasks cover reviewed business handoffs without granting technical evidence access. A completed task never resolves its finding or confirms a scope assessment. Overview shows assigned tasks, overdue state and urgent pages; combined work counts deduplicate tasks and linked unresolved critical findings.

**Paging:** Open a High/Critical task → Page responder, or explicitly select paging during task creation. High priority alone sends nothing. The recipient is the current task assignee; the dialog shows availability, backup/commander fallback and the server-selected acknowledgment period. Busy/Unavailable requires explicit confirmation and never overrides membership. A page persists as Awaiting Acknowledgment, Acknowledged, Escalated or Canceled. Only the addressed responder can acknowledge receipt. Urgent banners persist across pages until handled. There is no SMS, phone call, Photon delivery or browser notification permission requirement.

The existing private one-second SpacetimeDB scheduled reducer owns deadlines. Default policy is **five minutes**, then **one eligible backup or Incident Manager** (prefer Available); a deterministic child page and terminal parent prevent repeated escalation. Recheck organization/incident/reference access at delivery. Revoked targets escalate; absent eligible fallbacks cancel with an explicit reason for the requester. Backup pages require explicit handling and do not escalate further. Acknowledgment before the deadline stops escalation. Canceled/completed/reassigned tasks cancel pending pages while preserving history. Stored pages and the scheduled interval survive database restart; closing every browser does not stop escalation. Service downtime delays delivery until the database resumes; this local MVP is not a highly available pager service.

**Seed and tests:** `acme-phase4-v1` adds 3 incident rooms, 3 DMs, 37 synthetic messages, 11 tasks, 4 terminal historical page records, manual availability. Repeated `npm run db:seed` preserves user work and original evidence; the existing disposable IR-2043 read-state reset remains unchanged. New actions use `coord.*` through the existing service-gated command boundary and `/api/coordination`; `visible_coordination_data` is a caller-filtered SDK subscription. References are validated structured JSON within message/task rows; no replacement incident/event tables or external service were added.

Run `npm run test:e2e` for the seven critical scenarios, including real-backend message delivery/retry, private-source conversion, task verification and server paging. Detailed availability permutations are outside this minimal suite; the notification center is retired. Run `npm run test:e2e:restart` separately for the disposable restart test: it temporarily owns **3201**, verifies durable pages and recovery progression across a real standalone restart, and cleans up only its own temporary state. The trusted `coord.test.page_due` fixture can move a pending original deadline into the past only in the isolated test module and is excluded from HTTP routes. No normal client can choose or accelerate a page deadline. For a local visual demo only, set `AEGIS_PAGE_ACK_SECONDS=15` in root `.env.local`, restart `npm run dev`, and use Page responder. Remove the override to restore five minutes.

Deployment requires independent HTTPS/WSS hosting, private service credentials and backed-up database/evidence state. Chat is access-controlled and transport-protected by TLS when deployed; **end-to-end encryption is not implemented**. Phase 5 approvals, simulated recovery, trust warnings and immutable report generation are described below.


## Phase 5 recovery and reporting

Operations uses colored status tags. Development/test seeding labels untouched predefined requests as pending, recorded and rejected synthetic examples; no human approval, access grant or infrastructure action is fabricated. Responder decisions and user-created requests are preserved. A one-time demo timing correction brings the three colored timeline examples near the seed run's current time while retaining original timestamps and correction provenance. Successful report-generation events appear green.

Run the existing `npm run dev` workflow; no additional dependency, service, environment variable or credential is required. The bootstrap preserves existing data and adds `acme-phase5-v1`, predefined versioned recovery templates, synthetic verification originals, independent safe support records and incident reporting metadata.

- **Recovery demo:** Jordan requests customer-support recovery in Operations. Alex and Maya independently approve. The default deterministic verification fails; a separate fallback request and fresh approvals can grant Jordan read-only access to SAFE-001–003 for one hour. Original database restrictions and record-impact assessments remain unchanged. `npm run demo:recovery -- --outcome=success` selects the successful fixture for the next primary execution; use `--outcome=failure` to restore the default. This CLI is development-only and service-gated; no HTTP fixture endpoint exists.
- **Reports:** Authorized responders can generate Executive or Detailed HTML reports directly in Timeline. Restricted legal review is included automatically; generation and every open/download require legal access. Classification and human-authored legal assessments remain editable before generation. Open/Download versions from Incident report history; use browser Print / Save as PDF. Unknown scope/root cause stays explicit. New evidence requires a new version; previous bytes and hashes remain unchanged. Business Continuity Managers cannot export full incident reports; System Administrators retain their full source permissions, and private conversations/derived private records are excluded.
- **Closure:** A separate evidence-backed closure request requires independent analyst and commander approval. Recovery never closes the incident or automatically completes investigation work. With only one seeded analyst and commander, request closure as another evidence-authorized responder such as Priya.

Report originals share the ignored private `EVIDENCE_STORAGE_DIR` byte store (0700 directory / 0600 UUID files). Keep this directory and SpacetimeDB state together when backing up a local demo; deleting either loses original artifacts or their authorization metadata. Pending report preparation means file storage/commit did not finish: use Resume version in report history to finish the same reserved snapshot; never label a pending artifact complete. Hash mismatch is an integrity failure, not a reason to overwrite an original. See [Phase 5 details](docs/phase5.md) for limitations and standards references.

Cloud-synced checkouts can evict ignored credentials, database or dependency files and stall reads. Keep files downloaded or use a checkout/state directory outside cloud sync. Preserve existing database state, private originals and credentials when relocating; do not reset them to work around a placeholder.
