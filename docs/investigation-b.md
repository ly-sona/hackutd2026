# Addition B: bounded agent investigation and human review

Addition B extends A's actual fixture bytes, private evidence, immutable snapshots and deterministic observations. The implemented desktop path is collection → deterministic observations → a real model's validated tool calls → grounded proposal → human Accept/Reject → persisted Unverified/Suspected finding → existing Overview, Timeline and optional Scope relationship. No Addition C functionality is included.

## Run the demonstration

1. Put `AEGIS_MODEL_API_KEY` in the ignored root `.env.local`. This is server-only. The default endpoint is `https://api.openai.com/v1` and default model is `gpt-6-luna`. Optional `AEGIS_MODEL_BASE_URL` and `AEGIS_MODEL_ID` override the single adapter; there is no provider fallback. Remote endpoints require HTTPS; explicit localhost configuration may use HTTP. Never put keys in `NEXT_PUBLIC_*` variables, URLs, source or browser storage.
2. Restart the existing `npm run dev` supervisor once to load the updated worker. Preserve the existing database and evidence store; use no reset. The same narrow worker now polls A's collection queue and B's agent queue. Next.js remains the human command boundary.
3. Create an incident with the existing form, enter Investigation and collect P0 sources. Overview remains available throughout. IR-2041 cannot be used for collection or agent execution.
4. After deterministic processing completes, choose **Run Investigation**. The pass focuses on one supported lead, preferring explicit identity/network account/source/time correlation. Other deterministic observations remain available for responders.
5. In **Findings**, select **Review** on a proposal to inspect its explanation, exact evidence and limitations. Tool receipts are available under **Activity**. Choose Unverified or Suspected, optionally link the existing source dataset, enter a justification, and Accept or Reject. The review displays its intended authoritative changes before submission.
6. Open Overview and Timeline to see the accepted finding through their existing providers. Scope receives a Suspected RELATED_TO link only if explicitly selected; no impact assessment is automatically confirmed.

The adapter follows the official [function-calling contract](https://developers.openai.com/api/docs/guides/function-calling). The current [GPT-6 Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna) is configured with `reasoning_effort: none` for Chat Completions function-tool compatibility. This does not grant the model any additional tools or backend authority.

## What the agent can do

Five strict tools are available: `detect_anomalies`, `compare_snapshots`, `parse_evidence`, `query_context_graph`, and `propose_findings`. Parsing/hash/comparison/rule calculations reuse A and execute deterministically. Graph reads are confined to an existing same-incident entity and at most ten adjacent relationships. Original records are read from the private store with SHA-256 verification; the model never receives private paths, credentials, entire record inventories or private conversations.

The MVP uses a closed proposal schema. The model selects observation IDs, exact citations, priority and a cautious interpretation. Backend validation compiles the factual claim and limitations from those immutable observations. Arbitrary model-authored factual assertions, confirmed exfiltration claims and unsupported record exposure cannot enter review. Every citation resolves its evidence ID, frozen snapshot, record/event key, JSON pointer, fields, observed timestamp, rule version and record hash. Supported cross-source correlation requires explicit matching account and source values within thirty observed minutes. Missing exports, baseline trust, confidentiality exposure, availability, investigation state and restoration safety remain separate.

This is one focused initial investigation, not an exhaustive model review of every record. HR/Payroll and optional domains retain A's availability. Task generation, follow-up model passes, subsequent snapshots, recovery integration, reports integration and automatic paging/closure remain deferred.

## Persistence and authorization

Two additive private tables extend the existing schema:

- `agent_runs`: parent deterministic run, fixed snapshot/evidence/observation/context manifest, initiating actor and membership/assignment revisions, model/prompt configuration, bounded deadline, attempts, requests, lease and completed tool receipts.
- `analysis_proposals`: immutable grounded content and lineage plus current human disposition, reviewer, reason, result IDs and decision fingerprint. Review events and findings use the existing append-only incident history.

The run authorizes a fixed scope under A's separate service identity. Browser closure and natural initiating-session expiry do not cancel it. Current account, membership/expiry, incident access, permission and revision checks gate every protected worker operation. Cancellation and revocation block publication. A permission regrant cannot resurrect an old delegation. A new authenticated submission is required after Failed/Unavailable/Revoked/Canceled work; the first successful agent run for an initial collection is retained rather than automatically rerun.

Limits are ten model requests, eighteen completed tools, three proposals, two invalid-call corrections, three worker claims, 180 seconds per worker attempt, a ten-minute authorization deadline, 90-second leases, 40-second endpoint timeouts and 100,000 context characters. Completed receipts reconstruct the tool conversation after interruption; model requests consume their durable budget before external I/O. Unknown database transport outcomes resume through leases/checkpoints. Malformed JSON, budget exhaustion and unsupported terminal output cannot become Complete. Model failures leave collection and deterministic milestones intact.

Live subscriptions contain safe run summaries and pending counts. Proposal/source details require evidence and record access through a fresh paginated command (maximum 50). Human review separately requires current finding permissions, plus Scope editing when linking. Accept preflights original hashes and rechecks permissions and immutable citations in the backend transaction. Expected denials cannot leave a partially created finding. Identical review retries return stored results; conflicting/stale decisions are rejected. Accepted findings remain Unverified/Suspected and are never automatically Confirmed.

## Focused validation record

The Addition B gate uses `frontend/tests/agent-investigation.test.ts` and `frontend/tests/e2e/agent-investigation.spec.ts`. The real-model desktop case alters actual isolated fixture bytes and a network event key, collects all four P0 sources, expires the initiating session, uses the real configured model against real SpacetimeDB, verifies a correlated proposal citing the changed event, accepts it through the desktop, and verifies the finding, Timeline entry, Scope link, absence of confirmed assessments and unchanged reference rows.

Negative/review coverage uses real backend tools with explicitly labeled protocol fixtures. It rejects unallowed tools, foreign sources, unsupported factual fields, fictional citations, missing original inspection, unauthorized/cross-organization reviews, confirmation through acceptance, missing justification and competing decisions. It verifies rejection/idempotency and no findings on rejection. A separate case verifies unavailable-model behavior, retained deterministic results, usable desktop Overview and canceled-job publication denial. Unit coverage checks exact citation components, supported joins, unsupported certainty/claims and endpoint failures.

Executed: 18 focused unit tests passed (360 ms); the final real-model/negative-review selection passed 2/2 (32.2 seconds including startup, real-model case 19.1 seconds); the unavailable/cancellation case passed in the earlier focused invocation (3.7 seconds). Results are across focused invocations, not one full-suite pass. Initial API configuration, bounded-loop and test-harness failures were diagnosed and the affected cases rerun. No assertions were skipped or weakened. The full suite, mobile checks and unrelated coordination/recovery/restart suites were deliberately not rerun. Addition A's existing restart infrastructure and tests remain available; a separate B-specific OS/database restart scenario was not run in this time-constrained pass.

Final production build passed using the isolated `.next-build-check` output directory, including backend compilation and frontend TypeScript validation. Both workspace typechecks and changed-file lint passed; generated bindings and whitespace checks passed. No dependency installation or developer database reset was used. Local keys, DB state and test artifacts are excluded from the commit.

## Investigation UX and impact assessment extension

The results-first workspace and evidence-derived impact candidates are documented in [investigation-impact.md](investigation-impact.md). These candidates share the existing proposal table but remain distinct from model-generated finding proposals. Human acceptance uses existing Phase 3 assessment validation; the model has no authoritative assessment write tool. This does not implement Addition C. The validation record above describes the original B gate; the extension has its own focused test record.
