# Deterministic scoring acceptance correction

## Objective and authorization

AP approved correcting ASSESS-005 through ASSESS-017 to calculation-only checks
with zero persistent changes and implementing their focused evidence validation.
Baseline: merged PR #271, `4167913fda6e7f05e177e5fccbdfa6bce16c0423`.
The three read-only reviews closed before implementation. The controller rejected
adding synthetic tenant IDs to pure calculations: identifiers alone cannot prove
tenant execution. Under the fixed workspace-write profile, one implementation
worker owns the producers, validators, catalog and tests; the controller owns
documentation, integration and final review. Existing worktrees and stash remain
preserved. No nested delegation.

Confirmed acceptance-contract defect: eleven of these thirteen deterministic
cases require a state mutation, despite the production comparator being a pure
calculation. ASSESS-005 also incorrectly describes missing-input rejection as
non-denial. The prior exact CI artifact, run `37276900268` attempt 1, remains
immutable: 1 PASS, 107 BLOCKED, zero FAIL across 108 cases. Its thirteen scoring
assertions passed, but their full catalog cases remained blocked. Aggregate suite
success is not case-level execution proof.

## Scope and expected behavior

Correct only these thirteen catalog cases to zero persistent mutations and
unchanged persistent state. Record exact missing/invalid-input rejection,
governance score/tier/decision extrema, gate outcomes and completion boundaries.
Use an oracle-only deterministic fixture scope without tenant IDs or claims of
authorization, database persistence, audit, provider or hosted execution.

Bind the actual production comparator results to the existing fixture and
scenario inputs, source identity, release SHA, workflow run/attempt and command.
The independent oracle and production calculation must execute and match before
an individual case can pass. Validate complete, unique scenario/results coverage.
A copied metadata declaration, aggregate suite result or fixture name is not
sufficient evidence. Planned fixtures remain blocked; server, retained and
hosted evidence cannot acquire this deterministic-only pass scope.

No scoring formula, weight, threshold, hard stop, recommendation, production
scoring implementation or independent oracle algorithm changes. No other catalog
case criteria change. No database/schema migration, new dependency, provider
call, hosted operation or production action. This improves the common Assess
scoring and Govern risk-decision evidence path without broadening product scope.

## Acceptance criteria and focused verification

1. Thirteen individually owned production/oracle comparisons pass under their
   approved deterministic criteria and exact execution/input/source binding.
2. Missing, extra or duplicate results; wrong fixture/source digests; stale
   release/run/attempt; substituted tenant scope; nonzero mutation claims; and
   mismatched production output cannot produce PASS.
3. Evidence validators and unified reporting accept the new scope only for the
   approved oracle cases. Other 95 case definitions and pass conditions remain
   unchanged. Historical artifacts are never rewritten or counted as new passes.
4. The catalog/provenance/source contracts validate, and scoring implementation
   and independent oracle bytes match the baseline.
5. Only the oracle runner, affected evidence/report validators and necessary
   catalog/source-contract checks run locally. Broad product, browser, database,
   paid-provider and recovery regressions are not needed for this change.

Planned commands: `node scripts/runAssessV1AcceptanceOracle.test.mjs`,
`node scripts/exhaustiveAcceptanceEvidence.test.mjs`,
`node scripts/runExhaustiveAcceptanceReport.test.mjs`,
`npm run test:acceptance:catalog`, and `git diff --check`, plus any directly
affected generated-source contract checks. Exact executed results are recorded
below after implementation; planned verification is not a pass.

## Rollout, compatibility and rollback

The correction changes test/evidence interpretation only. Keep the old manifest
and planned-scope denials fail-closed; no legacy artifact is automatically
promoted. A fresh run on the new source is required to establish new case results.
Revert the producer, scope contract, catalog and generated bindings together to
return these cases to BLOCKED. No runtime rollback or data cleanup is needed.
Merge and any later hosted or paid work require their own authorization.

Remaining 60 retained-case assertion producers and 34 browser-dependent cases
are outside this implementation. Broader real-AI quality, performance budgets,
hosted recovery and production acceptance also remain separate. This thirteen-
case result cannot establish whole-product readiness or a production percentage.

## Verification record

Executed locally on 2026-10-05:

- `node scripts/runAssessV1AcceptanceOracle.test.mjs`: PASS. Real production
  comparisons, exact identity, valid deterministic scope and planned-scope
  blocking are checked.
- `node scripts/exhaustiveAcceptanceEvidence.test.mjs`: PASS. Stale/substituted
  identity, input/source/output digests, malformed/duplicate/missing evidence,
  unsupported scopes and false PASS claims are rejected. A genuine comparison
  failure retains FAIL.
- `node scripts/runExhaustiveAcceptanceReport.test.mjs`: 5/5 PASS, including an
  actual producer-to-report run with exactly 13 PASS and 95 BLOCKED. No other
  case gains execution proof.
- `npm run test:acceptance:catalog`: PASS, including catalog, traceability,
  metadata, provenance, retained charter and oracle contract checks.
- Controller scope review: exactly thirteen catalog cases changed; all other
  ninety-five definitions and both scoring algorithms match the baseline.

The approved cases use no browser/persona execution labels. No broad product,
database, browser, hosted, paid-provider or recovery regression was run locally.
These are local executed results; candidate CI remains pending at publication.
The historical 1 PASS / 107 BLOCKED artifact is unchanged. A fresh committed-head
oracle result and PR CI establish their own execution identities.

### First candidate CI and generated binding correction

Candidate `998e1c5d9d428baa96be79f6808b2a7e34e5d0e7`, exhaustive acceptance
run `37310089878` attempt 1: 14 PASS, 0 FAIL, 94 BLOCKED across 108 cases.
All thirteen approved scoring cases passed, alongside the existing SAFETY-005
case. Overall remains INCOMPLETE_COVERAGE; hosted execution is NOT_EXECUTED.

The PR C workflow exposed stale generated source bindings
(`PR_C_PROVENANCE_FILE_SET`). Refreshing those bindings preserves all 241
registered assertion expectations, 85 commands and 15 owners; it does not add
execution proof. `npm run test:transcript-flow:delivery-monitor-evidence-contract`
passed all 75 focused cases and the final provenance validation locally.

The first candidate Netlify preview failed during the build stage. AP authorized
read-only metadata and build-log diagnosis. Metadata confirms exit code 2 only;
the underlying build error remains unverified. No Netlify settings or deployment
actions are authorized by this read-only diagnosis. Updated-candidate CI remains
pending; this record does not claim merge or preview readiness.