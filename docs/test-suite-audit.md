# Current test suite audit

Audited November 8, 2026. Scope: test configuration, all unit tests, integration test scenarios and selected implementation paths. This is an audit and explanation; application behavior and test implementation were not changed.

## How the suite is organized

AEGIS has 31 Vitest tests in eight files and 55 Playwright tests in ten files. These are scenario counts, not coverage percentages. One Playwright scenario often makes many assertions across several application layers.

| Layer | Purpose | What a pass establishes |
| --- | --- | --- |
| Vitest | Small functions, shared rules, evidence filesystem operations and one Button component | The tested inputs produce the asserted outputs; no running database is needed |
| Playwright | Real HTTP routes, Chromium, SDK connections, reducers, projections and subscriptions | The tested workflow works across the actual application and database |
| Lint/typecheck/build | Static analysis, TypeScript consistency and compilation | Source meets the configured static rules and compiles; these do not prove runtime behavior |

`npm run test` runs only Vitest. It does not run Playwright or database integration tests. Although the backend workspace has no test script, Vitest imports its pure membership policy and permission matrix, and Playwright exercises its published module.

### Unit and component map

| File under `frontend/tests/` | Tests | Assertions cover |
| --- | ---: | --- |
| `connection-status.test.ts` | 4 | Connecting, connected, initial error, disconnected and recovery labels |
| `coordination-rules.test.ts` | 5 | Selected task transitions, numeric message ordering, attention deduplication, paging timeout bounds and selected role permissions |
| `evidence-store.test.ts` | 3 | Public-directory rejection, invalid/oversized content, original bytes, overwrite rejection and tampering detection using temporary files |
| `incident-model.test.ts` | 4 | Personal unread state versus investigation state, unresolved states, event ordering and literal excerpt splitting |
| `membership-expiry.test.ts` | 4 | Future deadlines, expired renewal, exact expiration boundary and indefinite memberships |
| `scope-rules.test.ts` | 6 | Inventory versus confirmed impact, overlapping memberships, independent dimensions, nonmutating traversal, ruled-out paths and cycles |
| `security-utilities.test.ts` | 4 | Salted passwords, wrong-password rejection, token/hash format, safe return paths and selected role separation |
| `button.test.tsx` | 1 | A disabled Button does not call its click handler |

Vitest defaults to jsdom. The evidence-store file explicitly selects Node and uses real temporary filesystem operations. The Button test name mentions reducer submission, but its assertion reaches only the click handler; it does not invoke a reducer. Likewise, the connection-status unit tests check a label function; real SDK reconnection is exercised separately in Playwright.

### Integration and browser map

| File under `frontend/tests/e2e/` | Tests | Main responsibility |
| --- | ---: | --- |
| `security.spec.ts` | 12 | Independent accounts, cookies, login/logout, invitations, tenant/incident isolation, direct database restrictions, role changes, revocation and expiry |
| `incidents.spec.ts` | 8 | Incident/finding writes, two-session updates, visits/reads, evidence-backed verification, corrections, private original evidence, notifications, seeds and reset guards |
| `scope.spec.ts` | 7 | Graph/inventory rendering, assets/relationships, record-specific impacts, second-session updates, evidence reuse, role boundaries and seed preservation |
| `coordination.spec.ts` | 15 | Rooms/DMs, safe messages, retries/corrections, private-source conversion, independent task review, availability, paging/escalation, revocation and reference permissions |
| `coordination-restart.spec.ts` | 1 | Pending pages, messages and one-time escalation survive a real standalone database restart |
| `health-check.spec.ts` | 3 | Public synthetic diagnostics synchronize between browsers and recover from transport loss |
| `incident-ui.spec.ts` | 6 | Selected colors, enabled live actions, independent selection, phone width, disclosures and task workspace entry |
| `navigation.spec.ts` | 1 | Client navigation preserves the workspace and binding without full navigation requests/access-screen flashes |
| `demo-consistency.spec.ts` | 1 | Cross-page scenario chronology, references, counts and idempotent corrections |
| `event-timing.spec.ts` | 1 | Seeded observation/recording delays, preserved original timestamps and timeline display |

These are hybrid integration/browser tests. Many sign in through HTTP and observe data through separate SDK connections rather than clicking every step. That provides direct assertions about the backend and its projections, but a passing API workflow alone does not establish that every corresponding form works.

## What is particularly well covered

- Authorization is exercised below the UI: forged claims, anonymous/private database access, direct reducer calls, tenant and incident boundaries, current memberships and live revocation.
- Several tests use independent browser contexts or SDK connections. A second client must receive actual subscription updates; local React state cannot satisfy those assertions by itself.
- Evidence tests inspect real bytes and SHA-256 values, reject dangerous inputs, and check authorized retrieval. The suite preserves the distinction between a hash/integrity check and proof of incident facts.
- Investigation, reads, acknowledgments, task completion and scope confirmation have separate assertions. These are central AEGIS invariants, not just page-load smoke checks.
- Private DM conversion is tested across tasks, authoritative findings, events, notifications and Scope restrictions.
- The restart scenario uses disposable state on 3201 and checks the persisted scheduler after restart without publish/bootstrap/test ticks. This is stronger than a browser refresh or mocked timer test.
- Idempotent seeding and narrow reset restrictions are tested alongside user-created records and original artifacts.

## Observed full-run failures

The configured full browser run finished with **28 passed, 4 failed and 23 not run**. The suite is not currently verified green. The 23 unexecuted scenarios follow failures in serial incident, scope and security groups; they are not passing checks.

| Scenario | Observed failure | Interpretation supported by artifacts |
| --- | --- | --- |
| `incident-ui.spec.ts:156` | The 45-second scenario budget expired during the final `page.goto` to Scope at line 187 | Earlier phone-width assertions completed. The failure does not establish horizontal overflow; it establishes that the complete workflow did not finish within its budget |
| `incidents.spec.ts:110` | New incident heading was absent after the 15-second expectation at line 137 | Trace network entries show HTTP 200 for `/api/incident/create`; the failure snapshot still shows IR-2041 and its original heading. Creation response success did not lead to the asserted new workspace. Root cause remains unproven |
| `scope.spec.ts:229` | The 45-second scenario budget expired during an `/api/scope` POST at line 288 | This is a request/workflow timeout, not an observed incorrect count or permission result |
| `security.spec.ts:80` | Gateway connection timed out with “The access service is temporarily unavailable” during setup | The security assertions were not established in this run; the rest of this serial group did not execute |

All four scenarios passed in a focused rerun against the restarted test environment: phone layout in 26.1 seconds, incident creation in 13.6 seconds, scope asset creation in 12.4 seconds and initial security/login in 11.2 seconds. The rerun reported 1.8 minutes including setup. The failures did not reproduce in that smaller run. This supports investigating execution timing, environment lifecycle and shared state, but does not establish a single root cause. The 23 skipped scenarios were not subsequently executed. Do not increase timeouts globally or label all failures flaky without diagnosing request timing, service availability and the incident navigation path.

## Findings and coverage gaps

1. **CLI discovery currently blocks the default commands on this Windows environment.** Plain `npm run test:e2e` and `npm run build` failed with `spawn spacetime ENOENT`. The installed launcher exists at `%LOCALAPPDATA%\SpacetimeDB\spacetime.exe`; setting `SPACETIME_CLI` for the process lets the commands proceed. `scripts/config.mjs` searches a Unix-style home location before falling back to PATH; two integration tests also use `process.env.HOME` and a Unix-style fallback. Prefer one cross-platform resolver or explicit documented configuration. This is an execution/setup problem, not a failed application assertion.

2. **Denial-audit persistence lacks a direct assertion.** The tests frequently assert 400/403 responses and restricted projections, but do not inspect `visible_audit`/security audit records to prove an expected rejection committed its denial audit while leaving domain state unchanged. Add focused real-database tests for that transaction contract and for unexpected-exception rollback. The existing urgent-page validation scenario already checks one useful no-partial-task case; it is not general transaction coverage.

3. **Login cooldown behavior lacks a dedicated scenario.** The implementation tracks failed login attempts and a 15-minute block, but the tests do not exercise reaching the five-failure threshold, rejecting a correct password while blocked, expiry, or successful-login cleanup. Test this with isolated accounts and service-gated time fixtures rather than waiting 15 minutes.

4. **Persistent shared integration state limits isolation.** Playwright uses one worker and a fixed database/data directory; startup preserves rows. Security, incident and scope groups are serial, so a failure can skip their remaining scenarios. Membership restoration and some `finally` cleanup help, but created incidents, messages, findings, tasks and history persist across runs. This can make runs depend on earlier mutations and accumulated data. Prefer per-run namespaces or disposable owned databases and assert cleanup results. Do not broaden the application's narrow demo reset or erase shared developer data.

5. **One seed-preservation assertion can pass with missing fixtures.** In `frontend/tests/e2e/incidents.spec.ts:710`, the test filters for `IR-2041:F-01` and `IR-2041:F-03`, then asserts `.every(f => f.status === "Suspected")`. An empty array, or only one surviving finding, satisfies that condition. Assert that both expected IDs exist before asserting their states. Similarly, the chronology loops in `demo-consistency.spec.ts` check returned rows but should establish expected fixture presence per incident before iterating. This does not mean the whole suite would miss every deletion; it means these particular assertions do not prove presence.

6. **Most UI coverage is through large integration scenarios.** There is only one isolated React component test, for a shared Button. High-value form validation, pending/error states and access-loss rendering are therefore diagnosed mostly through slower cross-layer tests. Add small focused tests where UI-specific bugs would otherwise be difficult to localize; avoid duplicating every integration scenario.

7. **No configured coverage measurement or minimum thresholds.** The Vitest configuration does not collect coverage and the package declares no coverage provider. There is no justified line/branch percentage to report. Pure rules use selected examples rather than exhaustive state/permission matrices or property-based inputs. Coverage reporting would reveal unexecuted branches; it would not by itself establish security correctness.

8. **Browser and presentation coverage is bounded.** Only Chromium is configured. A 390px viewport test checks horizontal overflow and selected mobile interactions, but does not emulate all mobile browser behavior. CSS assertions and saved screenshots exist; there are no screenshot-baseline comparisons or automated accessibility scans. Role/label locators are useful, but do not prove keyboard flow, focus management or contrast compliance.

9. **No repository CI workflow was found.** There is no `.github/` directory in this checkout. The commands exist for local use, but this checkout does not show automatic PR enforcement. External CI settings were not inspected.

No `test.skip`, `test.fixme` or `test.only` declarations were found in the current suite. Phase 5 workflows are deliberately unimplemented; their absence from functional coverage is consistent with current scope.

## Running and diagnosing tests

Run commands at the repository root:

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

For this Windows installation, configure the CLI for the shell session before build or Playwright:

```powershell
$env:SPACETIME_CLI = Join-Path $env:LOCALAPPDATA 'SpacetimeDB\spacetime.exe'
```

To discover or target tests directly without npm argument forwarding, run from `frontend/`:

```powershell
node ../node_modules/@playwright/test/cli.js test --list
node ../node_modules/@playwright/test/cli.js test tests/e2e/security.spec.ts
node ../node_modules/vitest/vitest.mjs run tests/scope-rules.test.ts
```

Keep the worker count at one with the current shared fixtures. Playwright owns frontend 3100, database 3101, `aegis-e2e`, `.spacetime/e2e/` and `.next-e2e/`; the restart test separately owns 3201 and a temporary state directory. The runner starts a development Next.js server, not the production build. It publishes the module, regenerates bindings and runs idempotent bootstrap before tests. Even a targeted browser run needs this setup.

For failures, distinguish setup errors before any scenario runs, failed assertions, timeouts waiting for subscription state and skipped scenarios following a serial-group failure. Traces are retained on failure in the ignored test artifacts and may contain private local test credentials or invitation links. A trace is diagnostic evidence, not a passing check.

## Execution results

| Check | Result |
| --- | --- |
| `npm run test` | Passed: 8 files, 31 tests; reported duration 11.62 seconds |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed for frontend and backend |
| `npm run build` | Passed after setting the installed Windows `SPACETIME_CLI` path; database module and production Next.js build both completed |
| Playwright discovery | 55 scenarios in 10 files, one Chromium project |
| `npm run test:e2e` | Failed: 28 passed, 4 failed, 23 not run |
| Focused failed-scenario rerun | Passed: all 4 originally failing scenarios; reported duration 1.8 minutes including setup |

The unconfigured build/browser attempts failed before application assertions because the CLI executable was not discoverable. The configured execution uses the existing installed CLI, not a replacement backend or mocked success.

Full-run failure artifacts are in ignored `frontend/test-results/`; focused rerun artifacts use ignored `.spacetime/audit-rerun/` so they do not replace the original evidence. Generated binding output was restored to its initial tracked contents after inspection; there were no semantic binding changes. No application or test source fixes were included in this audit.

## Suggested order of follow-up work

1. Stabilize CLI discovery, capture service readiness/timing diagnostics, and investigate full-run versus focused-run behavior. Split multi-page smoke scenarios where separate tests would improve failure localization. Preserve original failures when reporting retries.
2. Reduce serial failure cascades using independently prepared scenarios. Re-run the 23 unexecuted scenarios before claiming full browser coverage passes; do not switch on parallelism while shared state remains mutable.
3. Strengthen fixture-presence assertions and add focused real-backend tests for login cooldown, denial-audit persistence and transaction rollback.
4. Add coverage reporting and a few targeted UI state tests, then automate the existing checks in CI. Broader browser/accessibility/visual regression checks can follow according to the supported deployment targets.
