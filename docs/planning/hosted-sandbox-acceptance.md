# Hosted Sandbox acceptance evidence correction

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

Revert browser evidence, catalog correction, bindings/provenance and report integration together. The safe fallback is the existing 40 PASS / 68 BLOCKED with hosted cases blocked; never flip static planned provenance to executed.

After merge, separately authorize read-only stable identity inspection and one exact-main hosted workflow dispatch. If deployment identity differs, stop for the separately authorized deployment decision. Remaining blocked cases keep the full release gate incomplete even when all 18 supported browser cases pass. No paid AI or production operation is authorized.
