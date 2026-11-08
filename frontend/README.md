# AEGIS frontend

Next.js App Router, React, strict TypeScript, Tailwind 4 and the existing shadcn/ui primitives. Phases 1–5 provide independent access, live incident documentation/evidence, connected scope, incident rooms/DMs, shared tasks and server-controlled paging. Seeded content is synthetic; responder actions persist in the real backend. Operations now provides persisted approvals, simulated recovery, limited fallback access and immutable report generation. The five supplied visual references remain the UI foundation.

Run from the repository root:

```bash
npm install
npm run dev                 # Full stack + private service identity + idempotent seed
npm run demo:accounts       # Explicitly display private local synthetic credentials
npm run dev:frontend        # Frontend only; published and seeded backend required
npm run test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
```

`lib/server/` is trusted Node code. `session.ts` guards server pages with opaque HTTP-only cookies; the API handler validates mutation origin and inputs. The gateway uses a private SpacetimeDB service token. Never import these modules into client components or expose their environment values through NEXT_PUBLIC_*.

`WorkspaceProvider` uses the SDK React provider and caller-restricted views. It binds the transport identity only after a validated cookie session, hides disconnected/revoked workspaces and reflects permission changes live. `IncidentDataProvider`, `CoordinationDataProvider` and `RecoveryDataProvider` subscribe to authorized live records. Operations uses persisted recovery data; the old sample request constants are no longer rendered. Conversation references reuse existing evidence and scope IDs; private-source tasks/findings retain conversation visibility. `/development` preserves Phase 0 public health-check diagnostics separately from authenticated workspaces.

`src/module_bindings/` is generated with `npm run db:generate` and committed. Do not edit it manually. shadcn configuration is in `components.json`; use its existing components. Browser tests start separate real services on ports 3100/3101; a disposable standalone restart check temporarily owns 3201. No browser timer controls escalation. See the [root README](../README.md) for private credentials, configuration, limitations and all commands.
