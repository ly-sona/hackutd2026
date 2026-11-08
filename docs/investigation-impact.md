# Investigation UX and evidence-derived impact assessments

This extension builds on Additions A and B on `codex/investigation-a`. It changes the dedicated Investigation workspace, not the five primary screen components, navigation, reference incident, recovery or reports. It adds no dependencies, tables, model tools or Addition C feeder/reassessment machinery.

Addition C now extends these initial rules with versioned subsequent collection and reviewed-record access-context leads; see [investigation-c.md](investigation-c.md). The validation record below describes the earlier UX/impact pass.

## Desktop workflow

Investigation opens on **Findings**: real source/export coverage, deterministic observation counts, pending reviews and assessed entities precede compact Needs Review rows. **Potential Impact** links to supported review items or observations; counts describe leads/review items, never compromised records. Reviewed decisions and technical identifiers are secondary.

**Review** opens one focused dialog: what was found, why it matters, actual source values and timestamps, original evidence links, unknowns, intended changes and required justification. Finding acceptance retains Unverified/Suspected selection and optional existing-source association. Impact review displays its fixed evidence-supported dimension/status. Success links to the existing incident or Scope interface.

**Evidence** contains connector selection before collection, then a compact source table with actual snapshot/entry counts and source-reported timestamps. Select a source for baseline/current originals, full comparison counts, field-level differences and related observations. Planned connectors remain unavailable.

**Activity** contains persisted collection, deterministic, agent and review milestones. Tool receipts, arguments and runtime details are expandable. Existing failure, retry, cancellation and model-unavailable behavior is retained. No fabricated progress or completeness is introduced.

## Evidence-supported candidates

`shared/investigation-impact.ts` derives candidates from A's real observations and exact immutable record citations using `aegis-impact-v1`. It reuses Phase 3's dimension vocabulary. Each candidate includes existing target/assessment IDs, source/evidence/snapshot/key/location/field/time/hash/rule lineage, observation IDs, explanation, limitations and missing information.

| Dimension | Current P0 evidence and proposed Scope status | Limits |
| --- | --- | --- |
| Alteration | Unexplained customer field change → existing imported record, **Suspected** | Source-declared approved changes are excluded; difference does not establish malicious change or baseline trust. |
| Deletion | Missing export entry → existing source dataset, **Unassessed** | No fabricated current record or confirmed deletion; complete coverage/deletion evidence is missing. |
| Exfiltration | Traffic after reported isolation, correlated with a new sign-in by account, source and time within 30 minutes → existing network system, **Suspected** | Transfer contents and authorized boundary are unknown. No dataset or individual record is claimed exfiltrated. |
| Encryption | No usable indicators → **Not Assessed** in Investigation | No candidate and no authoritative assessment is fabricated from the ransomware description. |
| Availability | Source-reported service interruption → existing business operation, **Suspected** | Reported state is not independent verification or proof of compromise. |
| Compromise | New successful sign-in source → existing identity system, **Investigating** | Does not establish unauthorized use or account compromise. |

Candidates are coalesced by entity/dimension and capped at twelve per job. This is a bounded initial investigation, not comprehensive assessment of all records. Normal P0 fixtures produce five candidates across five dimensions; unsupported dimensions remain explicit unknowns. Earlier model jobs can use **Assess potential impact** to derive missing candidates without repeating inference.

## Review and persistence

Candidates share the existing private `analysis_proposals` table with discriminated content. Existing finding content and review semantics remain intact. The worker's terminal proposal action registers candidates but cannot write authoritative Scope assessments. Legacy candidate preparation requires a fresh authorized human command; original hashes are preflighted in the server boundary.

Before acceptance, the backend resolves the current job's exact source lineage and existing target, rederives the candidate, rechecks current permissions, requires a justification and rejects any unsupported status, including Confirmed. Applying an assessment invokes existing `scope.assessment` domain validation transactionally, preserving its evidence associations, prior assessment and append-only incident events. It does not set a verifier or verification time. Record access remains separately permissioned.

The proposal captures the previous authoritative assessment. A changed assessment blocks acceptance; an existing substantive human assessment requires manual Scope review. The dialog explains this and disables unsafe acceptance while permitting rejection. Rejection preserves the authoritative decision; identical successful review retries return the existing result without duplicate events. No recovery approval, task, paging, permission or closure action is added.

## Files and boundaries

- UI: `frontend/components/investigation-workspace.tsx`, `agent-investigation-panel.tsx`, new `investigation-evidence.tsx`.
- Rules/contracts: new `shared/investigation-impact.ts`, `shared/investigation.ts`.
- Backend/API: `backend/spacetimedb/src/agent-domain.ts`, `investigation-domain.ts`; `frontend/app/api/investigation/route.ts`; `frontend/lib/server/investigation/agent.ts` (original hash verification before terminal publication).
- Tests: new `frontend/tests/investigation-impact.test.ts`, new `frontend/tests/e2e/investigation-impact.spec.ts`; existing investigation/agent E2E selectors adapted for the local views and dialog, without removing assertions.
- Documentation: this file, README, AGENTS, Addition A/B usage notes.

No schema migration or binding edits are required. Existing five-screen files, source originals, IR-2041 metadata/history/artifacts and user-created data are preserved.

## Focused validation record

- **8/8 impact unit tests passed**, 283 ms, against actual P0 baseline/current fixture bytes: independent supported dimensions, approved-change exclusion, missing export uncertainty, no encryption invention, and strict exposure correlation/system targeting.
- **2/2 isolated desktop integration tests passed**, 26.8 seconds including setup, using actual SpacetimeDB and four-source collection. Verified local tabs, persisted 4-source/18-entry/7-observation coverage, exact original evidence, real field comparisons, finding acceptance, an Availability assessment applied through Scope and visible there, existing Overview navigation, idempotency and unchanged IR-2041 rows/artifact manifest.
- Negative checks covered unauthorized/cross-organization review, Confirmed/blank-justification rejection, duplicate derivation, stale human assessment conflict and rejection without overwriting the prior decision.
- Frontend/backend typechecks and changed-file lint passed. Production build completed in the isolated `.next-build-check` directory.

The desktop test uses an explicitly labeled worker protocol fixture for its finding proposal; it does not claim a new real-model execution. B's earlier real-model gate remains documented separately and its tool loop is preserved. Desktop screenshots were inspected for the Findings and review dialog layouts.

Deliberately not run: mobile/tablet/cross-browser, full unit/E2E suites, load/performance, exhaustive restart/durability, unrelated recovery/coordination regressions or broad accessibility audits. Existing isolated/restart infrastructure and prior tests remain available. This task adds no live connectors, full Addition C, encryption detection without evidence, independent transfer-content verification or automatic confirmation/restoration safety.
