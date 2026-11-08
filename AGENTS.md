# AEGIS coding agent instructions

## Context and scope

AEGIS is a HackUTD 2026 Cyber Incident Response Dashboard for the Winstead PC challenge. It must function independently of compromised corporate infrastructure. Prioritize ease of use under stress, real-time incident coordination, evidence-backed scope tracking and human-approved recovery actions.

Phases 0–2 establish the development foundation, independent access controls, and live incident documentation. Overview/Timeline are database-backed; graph, approvals, chat, paging and recovery remain later-phase previews. Implement only the phase requested by the user; never preempt later phases. The planned feature phases are:

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
- Derive the actor from the session hash. Validate active, unexpired organization membership, incident assignment and the backend permission matrix before every protected operation. Platform administration does not imply operations approval.
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

- Run relevant tests after changes. Keep `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` and `npm run test:e2e` working.
- Verify integrations against the actual backend; do not replace integration checks with mock success. Browser smoke tests use dedicated ports 3100/3101 and a separate DB.
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
- Keep the five reference layouts and mark remaining Scope/Operations/Team story content as previews. Do not implement graph traversal, record generation, contradiction detection, paging, chat, approvals, recovery or automatic reporting before the requested later phase.
