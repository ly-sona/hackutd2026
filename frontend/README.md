# AEGIS frontend

Next.js App Router, React, strict TypeScript, Tailwind 4 and the existing shadcn/ui primitives. Phase 1 adds independent login, organization selection, invitation enrollment, member administration and five incident pages matching the supplied visual references. Incident data/conversations/graphs/requests are synthetic and later-phase actions are disabled.

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

`WorkspaceProvider` uses the SDK React provider and caller-restricted views. It binds the transport identity only after a validated cookie session, hides disconnected/revoked workspaces and reflects permission changes live. `lib/demo-incident.ts` provides consistent typed synthetic content. `/development` preserves Phase 0 public health-check diagnostics separately from authenticated workspaces.

`src/module_bindings/` is generated with `npm run db:generate` and committed. Do not edit it manually. shadcn configuration is in `components.json`; use its existing components. Browser tests start separate real services on ports 3100/3101. See the [root README](../README.md) for private credentials, configuration, limitations and all commands.
