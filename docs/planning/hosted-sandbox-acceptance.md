# Hosted Sandbox acceptance evidence correction

## Current dispatch identity correction (2026-10-09)

PR #279 merged as `287f2a298e63b611af8ecda9cc89c7fc6c9520b7`, identical to its tested candidate. All 14 applicable candidate workflows and post-merge Core CI `37805242661` passed. Candidate run `37799542607` proves 40 PASS / 68 BLOCKED; preview run `37799542511` proves 18 supported cases across 36 project executions. These results supersede earlier candidate-pending checkpoints below without establishing stable acceptance.

AP separately approved read-only stable identity inspection and one acceptance run. The stable public response matched the merged SHA and non-production environment. Run `37845645704`, attempt 1, passed bridge provenance, retained suites, independent scoring and disposable server evidence, then failed declaration loading with `HOSTED_ACCEPTANCE_GITHUB_RUNTIME_REJECTED`. Browser installation, deployment verification and browser execution were skipped. Artifact `11580350621` has verified ZIP SHA-256 `d542cbe72165e415f5d638cfb6cffbcc7d9b25d10d22ae21ca0b6c518fd2399a`. Its immutable report is 14 PASS / 0 FAIL / 94 BLOCKED / 0 UNCOVERED, hosted BLOCKED and overall INCOMPLETE_COVERAGE. All 26 retained results and all 16 retained gates passed, but the report rejected the 26 results for workflow-path identity. The original 40-case source/CI proof and 18-case preview proof remain separate evidence; do not rewrite or relabel the failed stable artifact.

### Bounded behavior

The confirmed defect conflates the actual caller `.github/workflows/exhaustive-acceptance-dispatch-bridge.yml` with the canonical reusable producer `.github/workflows/exhaustive-acceptance.yml`. Set the producer identity in the reusable workflow itself so retained, oracle, server and report use one owner. Preserve the raw caller workflow ref in runtime metadata; never rewrite it to resemble the callee. Recognize only the exact existing bridge/callee pairing, with strict repository, controller/triggering actor, create-event, branch, release and hosted deploy bindings. Direct PR and preview identity behavior must remain valid, and unrelated or substituted callers must still fail closed. Declaration-only loading must accept its intentionally blank hosted target fields without making a network request.

No catalog, expected mutation, product runtime, schema, scoring, dependency, provider or hosted setting changes are included. The one approved hosted attempt is consumed; no second dispatch or deployment is authorized by this implementation.

### Execution and focused verification

All three read-only architecture, security and quality reviews are complete and closed. The root synthesized their findings before writes. Wave 2 uses the existing fixed managed workspace-write profile: one implementation worker owns workflow/provenance plumbing and focused tests, and the root owns active documentation, derived source indexes, integration and the single implementation PR. Preserve unrelated local changes and the stash.

Planned verification: extend the existing identity tests with positive direct/preview/bridge cases and negative repository, actor, event, ref, release, deploy and producer substitutions. Load the actual Playwright configuration in a subprocess under dispatch-shaped declaration-only environment. Exercise canonical retained producer-to-report wiring and measured browser attachment/report validation with fixture evidence; such checks are local contract verification, not executed hosted proof. Retain the unchanged exact-run criteria and strict failures. Run focused affected tests and required candidate CI, without another broad local PostgreSQL or browser campaign. Independently verify final candidate artifact identity and counts before a verified merge; stop at that PR boundary.

Executed local verification: identity/substitution checks and the actual dispatch-shaped Playwright configuration load passed (74 declarations, no browser or hosted request). The report suite passed 19/19; the subsequently added representative retained producer/runner/report transport check also passed, including exact three-case identity and preservation of genuine setup-blocked outcomes rather than workflow-path rejection. The focused measured dispatch report, workflow YAML/bridge contracts and 5/5 Sandbox attachment tests passed. Catalog validation, the refreshed governed source index, secret hygiene and whitespace checks passed. A broader metadata test encountered local Git shallow-state and Windows symlink restrictions; no related source or test was changed to bypass these limits. Candidate CI and artifact verification remain pending. These fixture checks do not relabel the failed stable run or prove a fresh hosted execution.

Rollback: revert the workflow identity plumbing, associated tests and current documentation together. Restore the blocked fallback if the pairing cannot be proven. No data rollback applies. Keep the prior stable artifact immutable and require separate authority for the next hosted attempt.

## Objective and approved boundary

AP approved this correction on 2026-10-08 after the three read-only reviews. Establish truthful, same-run browser evidence for the 18 supported Sandbox/public cases. Correct the 14 reviewed generic mutation expectations; preserve the purpose of every case. ADMIN-001 remains BLOCKED because navigation cannot prove its required privileged mutation and audit. No product runtime, schema, scoring, dependency, provider, or deployment change is included.

PR #278 merged as `766cd7fa7cc479f9d366537df89c498fdddda0d1`, with the tested tree unchanged. Candidate acceptance run `37726540790` attempt 1 proves 40 PASS / 0 FAIL / 68 BLOCKED / 0 UNCOVERED; post-merge Core CI `37729275716` passed. This is the source/CI baseline, not hosted readiness. The prior candidate-pending statements are superseded by these results. Stable deployment status is unknown; no hosted inspection is included.

## Findings and execution ownership

The existing browser suite has 19 runnable bindings, 18 explicit null bindings and 28 hosted cases with no browser binding. All runnable bindings have planned fixture provenance. The report currently requires server-style executed fixture scope to promote browser success, but the Sandbox uses browser-local synthetic state with no server tenant identity. Do not invent tenant UUIDs or predeclare execution in static provenance.

The root reconciles review findings: the earlier projections of 58 or 59 PASS were conditional and omitted this scope blocker. ADMIN-001 must remain blocked even after the scope correction. Exact stable execution is not authorized or claimed by this PR.

Wave 1 is complete and all reviewers are closed. Wave 2 uses the existing managed workspace-write profile. One implementation worker owns browser measurement, its attachment producer/validator and focused tests. The root owns catalog/bindings/provenance, report integration, active documentation, final review, verification and the single PR. Preserve unrelated changes and the stash.

## Behavior and evidence contract

- Keep static provenance as planned fixture scope. Only a successful, validated browser execution may supply `executed-hosted-sandbox-local` evidence.
- Bind each result to the exact source/release, deployment, workflow run and attempt, fixture, scenario, Test ID and required browser project. Require both Desktop Chromium and Pixel 7 Chromium, with no retry, duplicate, skipped or missing execution.
- Record sanitized measured actuals in the browser runner. Do not manufacture actuals from expected values or use navigation as server authorization evidence.
- Preserve GET/HEAD-only traffic, credential/authority/provider rejection, exact hosted response identity, keyboard, accessibility, contrast, responsive and route-isolation assertions.
- Keep localhost/loopback executions as regression evidence, never hosted PASS. Missing, stale, wrong-project, wrong-scope or malformed evidence remains BLOCKED. Actual assertion failures remain FAIL.
- A hosted case cannot become PASS solely from a retained server result. Unsupported and null browser bindings stay BLOCKED.

## Approved mutation definitions

The target action is distinguished from browser fixture/session/navigation setup. No scenario authorizes a hosted server mutation.

| Test IDs | Target mutation expectation |
| --- | --- |
| SANDBOX-001/003/005/007/008/009, PUBLIC-001/002/003/004, SAFETY-006/007 | None; zero target mutations. Prove the named route, isolation, reconstruction, layout or accessibility behavior. |
| SANDBOX-002 | Seven measured browser-local persona-session entries. |
| SAFETY-004 | Four measured invalid-scope reconstruction transitions. |
| SANDBOX-004/006 | Existing zero-mutation expectations unchanged. |
| ASSESS-001/004 | Existing one-process target mutation unchanged. Preserve incomplete-discovery assertions and distinguish supporting draft/setup actions from the counted creation. |

All other catalog business criteria remain unchanged. ADMIN-001 retains its privileged mutation/audit criterion and is explicitly blocked.

## Verification and acceptance

Run focused attachment producer/validator and report integration tests, including missing/forged/cross-run/project evidence, unsupported retained-only hosted cases and unchanged non-hosted results. Validate catalog, proof ownership, source provenance and browser declaration contracts. Run only the affected browser scenarios if a local measurement check is needed; these are not hosted acceptance.

Use the existing required candidate CI/preview gates. Independently inspect the exact acceptance artifact before merge: PR mode must retain 40 PASS / 0 FAIL / 68 BLOCKED / 0 UNCOVERED, hosted NOT_EXECUTED and overall INCOMPLETE_COVERAGE. Fixture-based integration tests may demonstrate a hypothetical 58 PASS result but are not executed hosted proof. Merge only after applicable gates and review pass; verify the merged tree equals the tested tree.

## Local verification checkpoint

Executed: attachment producer/validator tests (5/5), browser source contract, focused TypeScript transpilation, report integration for the 18 supported cases and eight substitution/failure variants, retained-only hosted rejection, and the affected evidence-profile/retained/browser-runner contracts (42/42). Catalog, traceability, provenance, historical-charter compatibility and oracle identity/scope checks passed. The oracle contract required a workspace-local temporary directory after a Windows temporary-file rename denial; no product defect was inferred from that filesystem failure. Declaration-only Playwright lists all 74 project/case declarations without contacting a hosted target. Secret hygiene and whitespace checks passed. Only the 14 approved mutation definitions differ from the baseline catalog; the other 94 criteria are unchanged. Candidate CI/preview and exact artifact verification remain pending.

## Rollback and next boundary

Candidate `b9479a6e09dc56a72eaf8fa8ed2e10971041bffc` passed exact acceptance run `37794716004` and preview run `37794715998`. The preview artifact ZIP digest matched GitHub's recorded `sha256:b28198f4a256c5c0d2b52340246de5830810a0dee99ffefa425c3f925ede1d07`; independent validation verified all 18 measured cases across 36 project executions, including seven persona entries and four reconstruction transitions, with 38 explicit project skips. This is preview proof, not stable hosted acceptance. The Governed Delivery gate exposed an omitted refresh of its current source-digest index; refreshing that derived index restores the local contract check without changing tests or authority. Fresh final-head CI and artifact verification are required before merge.

Candidate `ea68f9e5ea8380079591e914ad527ce0af0c03cb` passed acceptance run `37796290638` with all 108 prior statuses unchanged and independently verified preview run `37796290541` with 18 measured cases / 36 project executions. Governed run `37796290569` completed 36 local Sandbox browser checks with 38 explicit skips, then correctly rejected `SYNTHETIC_REGRESSION_METADATA_MISMATCH`: the runner's source list included the new evidence module while its local Playwright config omitted it. The one-line config correction aligns those lists. A focused parity assertion and an actual declaration-only config load now verify all five source paths match. No browser assertion or metadata validation was weakened. Final-head CI remains pending.

Revert browser evidence, catalog correction, bindings/provenance and report integration together. The safe fallback is the existing 40 PASS / 68 BLOCKED with hosted cases blocked; never flip static planned provenance to executed.

After merge, separately authorize read-only stable identity inspection and one exact-main hosted workflow dispatch. If deployment identity differs, stop for the separately authorized deployment decision. Remaining blocked cases keep the full release gate incomplete even when all 18 supported browser cases pass. No paid AI or production operation is authorized.
