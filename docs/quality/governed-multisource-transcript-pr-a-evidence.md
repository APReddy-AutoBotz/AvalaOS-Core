# Governed Multi-Source Transcript PR A Evidence

Status: local implementation and evidence complete; repository acceptance pending

Date: 2026-08-27

Base and checked-out Git SHA: `5518413a947030de2af0144f143c4ee97f72fc08`

## Boundary

This evidence covers only PR A: governed Source Library/source-set/input-bundle authority, exact extraction job/binding/candidate/preview/draft lineage, selective unconsumed-dependant staleness, transcript-assisted Assess review/conflict/batch apply, unified server BYOK with first-class Groq, atomic fenced provider budgets, durable cleanup, UI, rollback, and process-lifecycle evidence. PR B Studio transcript adoption and PR B/PR C handoff consumption were not implemented.

No hosted/live infrastructure, real provider, real secret, customer data, deployment, incident, pilot, production, security-certification, or compliance action was used. Provider behavior was mocked, browser checks used synthetic fixtures, and database behavior used one disposable local PostgreSQL 16 container.

## Confirmed defects corrected

- Candidate Review, run counts, preview, and commit now bind the exact selected source-set version, bundle version, extraction job and binding, candidate, real preview batch, and expected Assess draft version. Current-root substitution and workspace-wide candidate leakage fail closed.
- Source-set optimistic concurrency uses the caller's observed version. A new version stales only unconsumed dependant bundles, runs, and previews; consumed and committed history remains immutable and readable.
- `transcript.sources.read` is limited to source/source-set/input-bundle projections. Candidates, candidate values, relationships, previews, proposed values, conflicts, applications, runs, journeys, and mixed staleness selectors require `assess.v2.read`; service-role and authenticated PostgreSQL negative/countercontrol tests enforce the same boundary.
- Default-off first entry preserves the retained legacy single-source Candidate Review. Once the multi-source flow is active, authority loss remains fail closed rather than silently falling back.
- Candidate edit completion restores keyboard focus only after the asynchronous command lock clears and the exact Edit control is enabled, preserving deterministic Desktop and Pixel 7 keyboard flow.
- The real request-binding derivation path is mandatory under every handler seam. All eight selector-bearing transcript command classes reject genuinely foreign and missing selectors identically before receipt claim with zero receipt, audit, provider, or domain effects; conflict chosen candidates also require same-tenant conflict membership.
- Cancellation, timeout, deterministic pre-call failure, staging/settlement uncertainty, response loss, and replay use fenced reservation states without a second provider effect. The PostgreSQL transition helper is correctly `VOLATILE` because it acquires row locks.
- Evidence is assertion-owned rather than marker-only: executed assertions emit their actual persona, canonical capabilities, tenant/workspace, fixtures, and exercised lineage; context, marker, and command-record digests bind those facts, and the verifier compares them with independently governed expectations. `AUTH-001` through `AUTH-004` belong only to their exact API assertions, and exact evidence cardinality is enforced. Before `AUTH-001` or `AUTH-002` can emit, the API producer now requires all 28 executed request/authority traces and all 40 assertion-completion keys, including 12 completed foreign-versus-missing byte-equality comparisons; producer-level mutations prove that a missing completion or substituted request/completion trace fails closed even when the command otherwise remains green.
- The PR A transcript, retained Enterprise, PR 1D, and Studio browser gates use the repository-owned lifecycle runner. It owns transcript, Enterprise, and PR 1D production build/strict-preview boundaries (4193, 4191, and 4183) plus strict-port Studio Vite (4187), binds their configs and the exact multi-page harness build input into PR A provenance, and releases each server after success or failure instead of leaving an `npm`/`npx` descendant alive on Windows. An exact loopback bind preflight rejects an existing listener before any build or Playwright process starts; Vite `--strictPort` remains the post-build race defense. Readiness requires both the owned Vite child's exact host/port listening signal and an HTTP success; foreign HTTP 200 listeners fail closed and remain untouched. Bounded ANSI-sanitized Vite stdout/stderr and classified readiness observations preserve startup diagnostics without retries, cache deletion, or timeout inflation. The Enterprise keyboard journey proves the committed workspace and exact tab are ready before focus, while the projection-safety assertion samples labels and visible text atomically from one rendered workspace so an absent descendant set cannot masquer as a checked surface under load.
- The retained ten-operation Enterprise functional journey has a bounded 60-second test deadline because it is not a performance assertion. After one load-sensitive 30-second timeout at its final rendered state, the exact Pixel 7 scenario passed three isolated repetitions in 2.3–2.6 seconds; the separately owned performance thresholds remained unchanged.
- The retained Enterprise PostgreSQL concurrency test attaches its expected stale-source rejection before releasing the competing transaction. This preserves the lock-wait assertion and prevents the governed rejection from becoming an unhandled microtask-race failure; the exact harness is included in PR A provenance.
- Exact-head CI on the first pushed candidate exposed a deterministic PostgreSQL catalog-identity mismatch: PostgreSQL may omit a visible `public` qualification from composite routine arguments while migration SQL retains it. The shared canonical inventory now normalizes only that visibility-dependent qualification, preserves non-`public` schema identity, and has positive/adversarial hosted-inventory regressions. The same run exposed the hosted identity marker lagging the PR A migrations; additive migration `20260827173000_governed_transcript_hosted_identity_convergence.sql` advances the fail-closed marker to the actual chain tip. Fresh and accepted-baseline PostgreSQL 16 paths now pass the exact failing gate.

Existing deterministic scoring formulas, weights, thresholds, hard stops, recommendation logic, and score version are unchanged.

## Executed results

| Gate | Exact local result |
| --- | --- |
| Evidence registry | 33 exact commands; 194 passed assertion markers; six explicit `not_run` results; 67 source-provenance hashes. |
| Evidence mutation verifier | 19/19 evidence-contract tests passed: one positive registry-contract case plus 18/18 adversarial rejection cases covering assertion-producer runtime substitution, substituted runtime persona/capability/tenant/lineage, default-off browser context, unrelated or missing AUTH assertions, duplicate/count drift, fake/missing source, owner/hash, command, run identity, digest, and arbitrary output mutations. |
| Browser lifecycle diagnostics | 9/9 passed: exact free loopback bind/release, native free-port non-misclassification, bounded never-ready cleanup, spawn-error classification, capped ANSI-sanitized output, split exact binding recognition, Enterprise and transcript build/preview sequencing, and pre-build foreign HTTP 200 preservation with no Playwright launch. |
| PR A domain/API/provider/adversarial suites | Exit 0; migration static 12/12; API command 24/24 plus query tests; all owned source, Assess, authorization, idempotency, budget, provider, and injection assertions passed. |
| Governed source coverage | 94.82% lines, 88.03% branches, 90.70% functions; required 90/80/85 thresholds passed. The separately disclosed difficult command/query orchestration observation was 64.06% lines, 73.48% branches, and 79.51% functions and remains backed by focused API, authority, PostgreSQL, and static gates. |
| Deterministic scoring | Exit 0; golden fixtures, gates, determinism, monotonicity, and polarity passed with no scoring-law change. |
| PR A PostgreSQL 16 | Exact source-set/bundle/job/binding lineage, selective staleness, Assess conflict/apply, RLS/ACL, authorization, budget/cancellation/timeout/replay, rollback, and disposable-database cleanup passed. |
| PR A browser | 12/12 exact-lineage and adverse-flow cases passed: six Desktop Chrome and six Pixel 7. |
| PR A accessibility | 6/6 passed: three per profile, covering keyboard/focus/relationships, axe, 200% containment, and horizontal overflow. |
| PR A performance | 2/2 `PERF-002-A` 200-candidate cases passed, one per profile. Each assertion uses one unmeasured warm-up plus 20 native browser input samples, observes the exact React commit with `MutationObserver`, includes paint with double `requestAnimationFrame`, retains the governed browser-local p95 `<200 ms` threshold, and emits sanitized sample-count/p95/maximum metrics into the command record. |
| Retained migration chain | Studio contract 44 assertions and 16 executable scenarios; Enterprise Intelligence contract 391 assertions and 30 executable scenarios; Pilot Operations fresh and accepted-baseline upgrade catalog/identity/authority scenarios; fresh/upgrade/populated/dirty/authority/read-only/cleanup paths passed on PostgreSQL 16. |
| Retained source regressions | Enterprise Intelligence, Assess V2, unchanged scoring, Studio artifacts, mocked full-platform provider, and the 108-case canonical campaign passed. |
| Retained browser regressions | Enterprise Intelligence 20/20, Assess V2 36/36, and Studio artifacts 14/14 passed on their controlled browser profiles. |
| Type/build/security | Browser and Edge typechecks, production build, Enterprise boundary/CI contracts, workflow YAML, AI-boundary scan, secret hygiene, dependency audit, and `git diff --check` passed. |

## Machine evidence

`scripts/runTranscriptFlowEvidence.mjs` executes the canonical 33-command registry and writes sanitized JSON under `output/process-lifecycle/<base-sha>/<working-tree-digest>/<run-attempt>/`. The manifest records 200 per-assertion results: 194 executed passes and six explicit `not_run` boundaries. `scripts/verifyTranscriptFlowEvidence.mjs` independently checks exact commands, ownership, canonical source hashes, emitted runtime persona/capabilities/tenant/fixtures/lineage, context/marker/command digests, exact result cardinality, Git/workflow identity, sanitization, and the current working-tree digest. A green suite exit cannot synthesize an individual Test-ID pass. Generated output is ignored local evidence and is not committed as product source.

The six truthful `not_run` boundaries are:

- `PERF-001`: no registered assertion owner measures the 2.5-second cached-route usability budget.
- `PERF-002-B`: the 250-work-item interaction half belongs to downstream work and was not executed; `PERF-002-A` passed for 200 candidates.
- `PERF-003`: no approved numeric PostgreSQL CI duration budget exists.
- `PERF-004`: no approved end-to-end memory, provider-call, reservation, and token budget exists.
- `IDEMP-002-B`: downstream handoff response-loss consumption belongs to PR B/PR C; PR A's `IDEMP-002-A` passed.
- `PROVIDER-009-B`: Studio shared-gateway adoption belongs to PR B; PR A's `PROVIDER-009-A` passed.

The first pushed exact-head candidate ran GitHub Actions and exposed the two linked catalog/marker defects recorded above. Final exact-head GitHub Actions is `not_run` for this local additive follow-up and remains required before repository acceptance. The generated manifest and the controller handoff record the exact local working-tree digest and verifier result because including a digest inside a digest-scoped source document would be self-referential.

## Rollback

Disable transcript source-set, extraction, apply, and unified-gateway mutations at the server controls. Preserve sources, immutable versions, exact source-set/bundle/job/binding/candidate/preview/draft lineage, edits, conflicts, receipts, reservations, cleanup records, consumed history, and Assess versions read-only. Preserve the initial default-off legacy single-source projection. Correct schema only through additive forward migration; never restore browser AI, browser keys, current-root substitution, or silent fallback.
