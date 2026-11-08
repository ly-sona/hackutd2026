# Minimal hackathon integration suite

`npm run test:e2e` runs seven independent Chromium scenarios against the real Next.js application and SpacetimeDB module. One failed scenario does not intentionally skip the rest through a serial group. The default suite has no mobile viewport assertions or screenshot capture; the opt-in investigation suite retains its evidence-view overflow check.

| Default scenario | Essential guarantee |
| --- | --- |
| Access boundaries | Anonymous/foreign-tenant/unassigned/unauthorized operations and direct reducer impersonation fail; revocation clears an existing subscriber and blocks reads/writes |
| Incident documentation | A new incident/finding persists; evidence downloads with its original bytes and matching metadata hash; verification requires evidence; corrections preserve original history; anonymous original retrieval fails |
| Record-specific scope | Paginated record lookup works; one verified impact increases individually confirmed counts without changing inventory or confirming another dimension; Operations cannot verify |
| Communication | Another session receives the actual message once on retry; a nonparticipant cannot receive private messages or derived findings/events; a private finding cannot be referenced into the public room |
| Human review | The worker cannot verify their own investigation; an independent reviewer needs evidence; completion leaves the finding unchanged |
| Paging | The database escalates once after the requester closes; acknowledgment changes receipt state, not task completion |
| Desktop smoke | All five pages render, Add finding opens, Operations exposes its implemented request dialog, and Team messaging is enabled |

Authentication uses the locally generated synthetic passwords; protected reads/writes use real HTTP routes and caller-bound SDK subscriptions. The trusted deadline fixture only accelerates the paging test; the actual database scheduler performs escalation. There are no fake database success responses.

The application now includes Phase 5 and administrator oversight. The smoke test checks live recovery request controls rather than the former approval preview. Privacy checks use a nonparticipant Legal responder; administrators intentionally have organization-wide oversight.

## Commands

From the repository root:

```powershell
npm run test:e2e
npm run test:e2e:extended
npm run test:e2e:restart
npm run test:e2e:investigation
```

- Default: **7** scenarios in `frontend/tests/e2e/critical.spec.ts`.
- Extended: **19** existing desktop recovery, administrator and pending-invitation scenarios. Run when those workflows change; they are not part of the default command.
- Restart: **2** standalone restart scenarios covering durable pages/recovery progression and non-destructive investigation migration, worker resumption and later-snapshot lineage. Run before judging or after scheduler/persistence changes.
- Investigation: collection, scoped authorization, human review, impact and reassessment scenarios. Two cases require a real model API key (`AEGIS_MODEL_API_KEY`; endpoint/model overrides are optional); they do not substitute mock model responses. Without credentials, select deterministic cases with `--grep-invert "real model investigates|later actual evidence drives a real agent"` and report the model gates as unexecuted.
- Existing unit tests remain unchanged and run with `npm run test`.

List tests or filter directly through the workspace script:

```powershell
npm run test:e2e --workspace @aegis/frontend -- --list
npm run test:e2e --workspace @aegis/frontend -- --grep "record impact"
```

Use the installed Node/npm/SpacetimeDB toolchain. If the project-local `.spacetime/tools/activate.ps1` exists, activate it first. Otherwise set `SPACETIME_CLI` to an already installed executable, for example on this Windows machine:

```powershell
$env:SPACETIME_CLI = Join-Path $env:LOCALAPPDATA 'SpacetimeDB\spacetime.exe'
```

The wrapper acquires an exclusive lock at `%TEMP%\aegis-browser-tests.lock` (or the OS temporary directory on other platforms), recording PID, process start time and suite. It holds that lock until Playwright exits after server teardown and refuses occupied suite ports. If a prior process was forcibly terminated, inspect its recorded owner and verify it is no longer running before removing its stale lock. Never terminate or reuse another active run. The developer app on 3000/3001 is unrelated and must remain untouched.

Each run uses fresh temporary database/evidence state; prior runs are retained through the private `.spacetime/e2e-runs.jsonl` manifest. Keep one worker because the module and seeded accounts are shared within a run. Do not reset the developer database. Failure traces may contain local credentials and are private ignored artifacts.

## Deliberate reductions

The old broad Phase 0–4 scenarios were replaced, not preserved as a second default regression suite. Exact CSS, synthetic timestamp distributions, repeated seed tours, every invitation path, notification/read-position variations, graph-control combinations and detailed navigation optimizations are no longer integrated checks. Mobile usability is a manual check when a relevant layout changes. There is no standalone automated mobile suite or mobile screenshot collection. The opt-in investigation flow checks evidence-view overflow at a narrow viewport.

This trades breadth for the critical demonstration and trust boundaries. Passing the default suite does not prove every invitation, report, approval or recovery edge case. Unit rules and the opt-in newer suites provide additional coverage when relevant. Do not silently increase timeouts or claim a full pass by combining separate partial reruns.
