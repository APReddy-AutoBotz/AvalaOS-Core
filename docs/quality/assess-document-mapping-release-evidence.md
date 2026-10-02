# Assess document-mapping release integration evidence

Active corrective record; no hosted activation or real-provider result is claimed.
The completed local implementation report remains immutable at
`docs/quality/assess-supporting-document-mapping-evidence.md`.

## First committed-head attempt

Head: `34a04fba17b43468dc84920a660af9b0257386d8`, PR #264, workflow attempt 1.
All 19 workflows completed: 11 succeeded, seven failed and one was intentionally
skipped. The native Assess workflow [35111886685](https://github.com/APReddy-AutoBotz/AvalaOS-Core/actions/runs/35111886685)
passed its 22-command gate. This does not override retained-check failures.

| Retained workflow | Run | Confirmed failure |
| --- | --- | --- |
| Creation access | 35111886331 | Harness assumed its previous convergence migration was globally last |
| Pilot Operations | 35111886812 | Operational marker lagged the full applied migration ledger |
| Governed PR C | 35111886454 | Fresh marker was 20260916003000; approved tail expected 20260916083814 |
| Exhaustive acceptance | 35111886645 | Same fail-closed operational identity mismatch |
| Studio artifacts | 35111886567 | PR 1D source check inspected the former fixture owner |
| Core CI | 35111886929 | Same stale browser-fixture source check |
| Pilot acceptance | 35111886591 | Same stale browser-fixture source check |

The downstream incomplete manifests are consequences of these stopped commands,
not proof that their unexecuted cases passed. The exhaustive report's 0 PASS,
5 FAIL and 103 BLOCKED remains that attempt's result. The separate hosted-live
workflow was skipped, not passed. No exploratory database or preview was changed.

## Corrective scope

The read-only architecture and quality reviews closed before implementation.
The controller retained the security boundary and integration ownership.
The database change is one forward-only identity convergence with exact
predecessor/schema/non-production preconditions and zero retained controlled-human
exercise/recovery history. Already committed migrations and the dynamic ledger
guard remain unchanged. Harnesses use the exact approved successor order.

PR 1D's check now resolves the canonical capability through the extracted
network fixture and actual retained scenario imports. Its focused suite passes
14/14 checks, including 13 adversarial mutations. This is static ownership
verification, not proof that the browser assertions ran.

## Executed corrective verification

The final read-only architecture and quality reviews closed with no confirmed
blocker. Their focused checks passed: PR 1D fixture ownership 14/14, exact migration
tail/convergence 4/4, mapping migration 28/28, canonical execution contract 7/7,
PR 1D lint, PR C migration/CI contracts and patch integrity.

Effective runtime/test/execution source digest:
`75ab7dc5e19ab1e6a2dae541dc7c84082bf8873399e190713e5c4700709c25d0`.
All five canonical groups passed 22/22 commands at that unchanged digest:
feature 10, PostgreSQL 2, retained regression 1, browser 1 and static/build 8.
Their exact sanitized results are retained in:

- `output/assess-import/validation/feature-ce59df38-2749-4344-990d-5176ce72b6b1/manifest.json`
- `output/assess-import/validation/postgres-b71be681-0d3d-4b55-940c-a93c4f808e08/manifest.json`
- `output/assess-import/validation/regression-92dba0f2-2582-4be1-9194-f7c916567d70/manifest.json`
- `output/assess-import/validation/browser-66496665-9573-4573-b44c-a974ceff30e1/manifest.json`
- `output/assess-import/validation/static-e0284f89-5b7f-4952-93d9-71ae08548c43/manifest.json`

The feature browser report at
`output/playwright/assess-import/e60036a56aeaf7f7e9e54a1a/results.json` contains
32 passed Desktop/Pixel scenarios, zero unexpected failures, skips, flaky cases
or runner errors. It uses synthetic browser transport, not real providers.
Typechecks, workflow YAML, AI boundary, secret hygiene, deterministic scoring,
scoring-law drift and build passed. Dependency audit reported zero vulnerabilities.
The acceptance catalog/provenance/adversarial gates passed with 108 source-backed
catalog branches and 10 explicit composite cases; this is not 108 executed hosted
acceptance passes. PR C evidence-contract/verifier tests passed 37/37.

The actual retained PR 1D browser suite passed 52/52 Desktop/Pixel scenarios;
the retained transcript suite passed 16/16. Both reports contain zero skipped,
flaky or unexpected results and zero runner errors, at the same unchanged source
digest. Their separate reports and execution bindings are retained under:

- `output/assess-import/retained-browser/pr1d-9a221527-2806-4d51-9fe8-6c1d2236ad62/`
- `output/assess-import/retained-browser/transcript-c11ba56a-8a85-41a0-91c3-e27a1965179f/`

The full creation-access PostgreSQL matrix passed all 77 ordered migrations,
54 process assertions, 109 Admin assertions, 19 named identity-precondition
negatives, two concurrent history-writer fences, populated upgrade preservation,
and retained Pilot Operations fresh/upgrade plus PR C scenarios. Result:
`output/creation-access/postgres-e6bc92e9-72ce-42e0-adab-616b2491f665/result.json`.

The separate recovery run passed all six actual backup/restore, corruption,
incomplete/wrong-version backup, interrupted-restore retry and canonical
response-loss receipt checks. Result:
`output/assess-import/release-local/14e3e84d-eeeb-4766-b44d-af0b9e32ed27/result.json`.
Both runs verified removal of only their own disposable memory-backed containers.
No unrelated workload, persistent database or Docker backup was removed.

The first local PostgreSQL attempt remains failed with SQLSTATE `42704` because
its negative test invented a long generated constraint name. The correction
resolves the exact single-column constraint from PostgreSQL's catalog before
mutating it inside the rolled-back fixture. Two interim feature attempts remain
`source_changed` while this correction and the package provenance hash were
reconciled; they are not counted as clean source-bound passes.

## Current verification boundary

The corrective commit, exact-head CI and exploratory activation are planned verification.
They must be recorded separately; prior passing attempts must not be relabelled to new source.
Rollback disables new effects and preserves history. The frozen twelve-persona
backend, real providers, production, merge and the three-human acceptance gate
remain outside this correction.
