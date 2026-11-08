# AEGIS

Independent Cyber Incident Response Platform for the **Winstead PC challenge at HackUTD 2026**. AEGIS uses its own accounts, permissions and database instead of the fictional affected organization's SSO, email, directory, VPN, DNS or messaging systems.

**Implemented: Phases 0–2 — foundation, independent access, and Incident Command & Documentation.** Overview and Timeline use authorized live SpacetimeDB data. Incident creation, findings, evidence, immutable history, personal read/visit state and in-app notifications are functional. Scope, Operations and Team retain labeled synthetic previews; graph analysis, chat, approvals, recovery and automatic reporting remain planned. This hackathon prototype demonstrates trust boundaries; it is not production-hardened or safe to use from a compromised workstation.

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
  incident-domain.ts       Fresh authorization, mutations, notifications and safe projections
  incident-seed.ts         Stable versioned fixture; never resets user records
  permissions.ts           Authoritative role/permission matrix
backend/seed/              Versioned evidence manifest with stable scenario references
mock-evidence/             Synthetic source artifacts; originals copied to private storage
scripts/                   Local orchestration, service identity and trusted bootstrap
  bootstrap.ts             Idempotent development seed; no public bootstrap endpoint
docs/
  architecture.md          Trust boundaries and real-time access lifecycle
  design-references/       The five supplied incident screen PNGs
```

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

Startup reuses a healthy local database or starts one, provisions a separate private service identity, publishes the additive module, generates bindings and idempotently seeds the demonstration before starting Next.js and the official backend watcher. Existing data, passwords and CLI owner credentials are preserved. Schema changes never automatically delete data. Ctrl+C stops owned services; reused services remain running.

`npm install` creates `frontend/.env.local` only if absent and links npm's hoisted TypeScript compiler into the module-local executable location expected by the CLI. `npm ci` uses the same setup hook. On Linux, install browser system dependencies with `npm exec --workspace @aegis/frontend playwright -- install --with-deps chromium` if needed.

## Demo accounts and access flows

Passwords are randomly generated on the first trusted bootstrap and stored **only locally** in ignored `.spacetime/data/demo-accounts.json` with mode 0600. The database stores salted scrypt hashes. No passwords are embedded in source or exposed by a public account-selection endpoint.

```bash
npm run demo:accounts   # Explicitly display private LOCAL demo credentials
```

Do not share that output or commit the file. An optional private `AEGIS_DEMO_PASSWORD` can set the initial demo password; changing it does not reset existing accounts.

| Account name | Synthetic responder | Role / initial access |
| --- | --- | --- |
| `sam.patel` | Sam Patel | Administrator; active |
| `maya.chen` | Maya Chen | Incident Commander; active |
| `alex.rivera` | Alex Rivera | Security Analyst; active |
| `priya.shah` | Priya Shah | Legal/Compliance; active |
| `jordan.davis` | Jordan Davis | Business Operations; active |
| `taylor.morgan` | Taylor Morgan | External Security Analyst; pending invitation, temporary membership |

Taylor’s `analyst` role is separate from membership status and expiration. Temporary access has a seven-day window; an unexpired deadline is preserved when an invitation is accepted, while an expired temporary membership receives a new seven-day window after a valid administrator-issued invitation. It never becomes permanent through renewal. Invitation links themselves still expire after one hour.

All six accounts require their real locally generated passwords. `corporate-admin@acme.example` is deliberately **not** an AEGIS account and grants no access. Acme members cannot open the separately seeded restricted Northstar organization. Acme has three connected synthetic scenarios: **IR-2041 — Ransomware response**, **IR-2042 — Administrative account review**, and **IR-2043 — Unauthorized access investigation**. The incident selector lists only your assignments.

1. Sign in as Sam; choose Acme and IR-2041. Overview, Scope, Operations, Team and Timeline retain the supplied dark visual language.
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

The initial scenarios and original evidence are synthetic. Once seeded, Overview, findings, evidence metadata/links, events, notifications and read state come from the private database through authorized subscriptions. New user actions are real writes. Scope graph, purchasing requests, conversations and presence remain labeled previews. Live messaging, approval execution, automatic contradiction detection and graph propagation are not implemented.

Delivery uses a typed adapter with **demo mode first**. No verified Photon SMS API contract was provided, so Photon credentials are unused. Selecting external mode falls back explicitly to simulated delivery. For a new phone recipient, possession of the invitation link is the demo enrollment proof; administrator phone-verification attestation is not carrier verification, MFA or proof that SMS was delivered. Passkeys, password recovery, production-wide rate limiting, device trust and production identity assurance are not implemented.

The trusted Next.js service can validate credentials/create sessions and must be protected as part of the trust boundary. Browser SDK tokens stay in memory and authorize no private views until the server binds their identities to a validated session. Offline clients cannot receive revocation events until reconnecting; disconnected workspaces hide restricted content, and server operations always recheck access. Previously viewed information cannot be retroactively erased from a device.

The original development dependency audit reports 13 low/moderate transitive tooling advisories; `npm audit --omit=dev` reports no production dependency vulnerabilities. Review updates before any deployment beyond this controlled demonstration. Test traces and private local state may contain credentials/activation URLs; treat them as private and never upload them unredacted.

## Commands and testing

```bash
npm run dev             # Full local environment; preferred
npm run dev:db          # Standalone DB only; reuses an existing instance
npm run db:publish      # Publish with the configured local service identity
npm run db:generate     # Generate frontend bindings
npm run db:seed         # Idempotent access + Phase 2 seed; DB/module must be running
npm run demo:reset -- --confirm-disposable-demo # ONLY IR-2043 personal read/visit state
npm run dev:frontend    # Frontend only, with local service credentials inherited
npm run env:check       # Installed versions and local configuration

npm run build           # Backend type-check/bundle + production Next.js build
npm run lint
npm run typecheck       # Both workspaces, including generated bindings
npm run test            # Password/redirect/permission tests + Phase 0 unit/component tests
npm run test:e2e        # Real SpacetimeDB + Chromium security/integration flows
```

Playwright owns ports **3100/3101**, database `aegis-e2e`, `.spacetime/e2e/`, and `.next-e2e/`. It does not modify the developer environment file. It verifies independent login/logout, spoofed sessions, corporate-account denial, private table/direct reducer restrictions, cross-tenant and incident isolation, invitation acceptance/expiry/reuse/replacement/revocation, role changes in an open second session, last-admin protection, membership/session expiry, live revocation and phone-recipient enrollment. Phase 0 tests still verify cross-browser real-time health-check writes and connection failure/recovery at `/development`.

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
| Browser missing | Install Playwright Chromium with the command above. |

Future phases: **3** Compromise Scope & Context Graph; **4** Real-Time Communication & Coordination; **5** Trust Warnings, Recovery & Reporting. See [architecture](docs/architecture.md) and [AGENTS.md](AGENTS.md) before extending the system.

## Phase 2 incident documentation

Use the header incident selector or the organization list. Commander/Administrator can create incidents; the creator, optional commander and selected active responders receive incident assignments. Existing roles remain unchanged: Commander manages incident lifecycle/description/severity; Commander and Analyst update and verify findings/upload evidence; Legal and Operations can submit observations/findings and notes; evidence viewing follows existing permissions. Administrator does not inherit operational or investigation approval authority.

- **Overview:** live severity/status, commander, discovery/report time, unresolved and personal new counts, findings, business impact, evidence and recent events. Add Finding records observed time, category, priority, investigation status, system, optional assignee and evidence. Open a finding to mark only that finding read. Reading never resolves it. Confirmed/Resolved findings require same-incident evidence and a verifier justification; the backend records verifier/time. Evidence links are additive; an update never silently removes prior supporting links.
- **Timeline:** newest first, UTC storage with America/Chicago display and deterministic ID tie-breaking. Filter Findings/Evidence/Status Changes/Decisions/Access Changes; select an event for source/actor, observed versus recorded times, prior/new values and evidence. Document observations, reported actions, decisions and corrections. Corrections append an event referencing the original and a justification; no normal update/delete-history endpoint exists. Recording an action does not execute it. Replay stays disabled.
- **Since your last visit:** the backend captures the prior last-viewed timestamp before updating it. A per-document visit UUID holds the cutoff stable through App Router navigation and Strict Mode remounts. Reload/opening a new document starts another visit. First visit shows current summary. Finding reads and notification reads are independent from visits and investigation status. This MVP does not infer browser inactivity as a new visit.
- **Bell:** live, recipient-specific notifications for assigned responders, critical/status changes, high-priority findings, and evidence attached to findings they reported or own (the MVP follower rule). Marking a notification read changes only its read timestamp. No SMS/calls/paging is sent.

### Private evidence

Accept UTF-8 TXT/LOG, valid JSON, PDF, PNG and JPEG, **1 byte–5 MiB**. Choose a file or create a text note. Specify description/source, optional collection time, annotation and literal excerpt; a finding upload links it to that finding. The incident-level upload links to its incident, and finding edits can attach existing evidence. The viewer shows actual original text/image bytes, source, upload/collection times, SHA-256 and annotations; literal excerpts are highlighted without HTML interpretation. PDFs download without embedded preview.

Next.js bounds the incoming multipart stream, validates extension/content type and practical signatures, assigns randomized storage names and writes immutable private originals with restrictive permissions. SpacetimeDB stores metadata/hash and relationships only. Downloads require a fresh active session, incident assignment and evidence permission before and after file I/O; storage references never enter browser views. Original bytes are hash-checked before serving, with `no-store`, `nosniff` and attachment downloads. These checks are not malware scanning, forensic chain of custody or proof of authenticity. File and database writes cannot form one transaction: known rejected commands clean up the new file; a transport failure or process crash can leave an unreferenced private file. Uncertain commit outcomes preserve originals to avoid deleting a file referenced by a committed record. There is no automated deletion or retention policy. Back up private files together with database state and the private seed mapping.

### Reproducible synthetic scenario

`npm run dev` and `npm run db:seed` run the same trusted, versioned `acme-phase2-v1` seed. It creates 3 incidents, 9 findings, 26 historical events, 10 real private artifacts and up to 8 notifications for currently authorized seeded responders, using fixed **November 7, 2026 / America/Chicago** timestamps. Stable IDs and `scenario_seeds` make repeat runs no-ops for database records; original-file mappings verify hashes and never overwrite files. Phase 1 users, credentials, roles, revocations and user-created data are preserved. Deliberately missing/corrupt originals fail rather than being silently replaced.

IR-2041 retains the 09:04 opening, 09:08 historical invite, 09:18 isolation report, 09:21 traffic observation, 09:24 EV-018 upload and 09:26 manually seeded containment flag. EV-012 supports an action report, not successful containment; EV-018 supports traffic, not origin/cause; EV-021 supports an unusual transfer, not customer contents; EV-024 supports suspicious account activity, not confirmed compromise. A-09 → Customer Database → October Customer Records → C-1044 are lightweight continuity references; no individual customer dataset or graph engine is generated.

`npm run demo:reset -- --confirm-disposable-demo` explicitly resets **only per-user read and visit windows for disposable IR-2043**, and only when the published module has `AEGIS_DEVELOPMENT_MODE=true`. It never deletes findings, uploaded originals, events, incidents, memberships or accounts. To restore the story to a clean state, use a separately named local database/state directory; there is intentionally no destructive shared Acme reset or HTTP reset endpoint. `frontend/tests/fixtures/ground-truth.private.ts` is a test-only fictional oracle, excluded from application imports and normal APIs/subscriptions. It is not a secret from people who have source repository access.

Data model: incidents retain current lifecycle/metadata; findings retain investigation state, observation/report/verification provenance; append-only events retain every change; evidence and evidence links separate original metadata from annotations; finding reads, incident visits/visit windows and notifications are private per-user state. All are protected by the existing session → organization → incident → role boundary.

Documentation follows capture and review principles from [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final): observations, actors, timestamps, affected systems, assessments, supporting evidence, response decisions and recovery status. This MVP makes no NIST compliance claim.

Phase 2 tests add real incident/finding writes, two-session updates, status history/corrections, unread/visit behavior, evidence integrity/safe previews/size/type/permission checks, recipient privacy, seed preservation and reset guards. Run the unchanged root build, lint, typecheck, unit and browser commands above.
