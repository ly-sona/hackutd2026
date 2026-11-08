# AEGIS access module

SpacetimeDB TypeScript CLI/SDK 2.14.1. Phase 1 stores organizations, users, hashed credentials, sessions, connection grants, organization/incident memberships, invitations and access audit events in **private tables**. `permissions.ts` is the authoritative permission matrix; platform administration does not confer operational approval authority.

Only the published `AEGIS_GATEWAY_IDENTITY` may call the access command reducer and service procedures. Each protected operation derives its actor from a session hash and checks current organization/incident permissions. Caller-scoped views expose safe projections to bound browser identities. A private one-second scheduler enforces time-based subscription expiry. The public `health_check` table is still synthetic diagnostics only.

Run from the repository root:

```bash
npm run dev:db
npm run db:build
npm run db:publish
npm run db:generate
npm run db:seed
npm run typecheck
```

`npm run dev` runs the full workflow. It preserves state and credentials; bootstrap is idempotent and is never exposed publicly. Generated bindings are committed under frontend/src/module_bindings; bundles, database state and credentials are ignored. One root lockfile is retained. The root postinstall links the hoisted TypeScript executable where the CLI expects it.

Expected rejected commands store denial audit/result envelopes; unexpected failures roll back. Validate before mutation. Test fixture operations require both the trusted service identity and database `AEGIS_TEST_MODE=true`; keep that false outside isolated tests. No real incident, evidence, graph, messages, approvals or recovery schemas are implemented beyond minimal incident access stubs.

See [architecture](../../docs/architecture.md), [AGENTS.md](../../AGENTS.md) and the [root README](../../README.md).
