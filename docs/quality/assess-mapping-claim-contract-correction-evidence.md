# Assess mapping SQL/Edge claim correction — active evidence

## Scope and retained failure

Base head: `2f00b828b24ffa8c863fe84da5581f2e2c4b309b`.
This report concerns the separately approved synthetic AI environment only.
Existing controlled-human/exploratory environments, production, customer data,
document approval and downstream handoff are outside this correction.

The real author UI persisted the synthetic TXT meeting source, locked its source
set and Assess input bundle, and attempted analysis. Analysis failed with
`RESOURCE_STALE` after a database claim but before provider spending. The failed
receipt/run/catalog remain retained; no proposals or analysis debit were created.
The parser's persisted text digest matched the canonical synthetic fixture.

Confirmed source defects are incompatible SQL/JS hash comparison and SQL's
omission of null-valued target keys. A strict mapping-local decoder preserves
database hash authority, verifies semantic fields and source lineage, and handles
only the narrow omitted-null compatibility case. No migration or global hash
change is included. Source response validation now precedes provider effects.

## Executed evidence

- Three independent read-only architecture, security and quality reviews closed.
- PostgreSQL 16 focused suite: 16/16 scenarios passed on the initial correction.
  The new bridge uses actual TXT parser bytes, the production request binding and
  catalog builder, a real SQL claim, and the production decoder. Fourteen altered
  responses and two foreign scopes reject. No secret reads, network calls,
  proposals or provider debits occur in this bridge. The disposable, labelled,
  memory-bounded container was removed after the run.
- Canonical source snapshot
  `7a989c0480b01d3fe51bdb810e9916876dbe5bbe91061aa3f28d1f49de738453`:
  feature 10/10 commands, retained regression 1/1 and PostgreSQL 3/3 passed.
  The PostgreSQL rerun includes the added real same-receipt claimed replay.
- Mapping API tests: 20/20. Mapping module coverage: 100% lines, 92.63% branches,
  96.67% functions. This is not whole-command orchestration coverage.
- Browser retry: 32/32 Desktop/Pixel scenarios passed, zero skipped, unexpected
  or flaky results. This uses the synthetic regression profile, not live AI.
- Final independent quality and security reviews found no production-code blocker.
- Retained local gate failures: browser preflight rejected the already occupied
  preview port before tests; the owned preview was stopped for retry. App
  typecheck included ignored downloaded Edge-source evidence under
  `output/local-private`, producing missing-Deno errors. A narrowly reviewed
  exclusion is required; canonical Edge source retains its separate typecheck.

The narrow `output/local-private` app-typecheck exclusion is now applied; no
tracked source exists under that directory. Full canonical gates passed on
that final configuration snapshot. The initial registry-generation command
stopped for missing disposable PR C database configuration; the intended
`--refresh-bindings` mode subsequently refreshed existing assertion ownership and
passed the current provenance contract. This is not an 81-command execution.

Corrected exact-head CI/deployment and successful hosted analysis are pending.

Final configuration snapshot:
`b73525dd54bdff0be26260ba698f73bad931b4a7096c0d111f731080b95c4484`.
Feature 10/10, regression 1/1, PostgreSQL 3/3 and static 8/8 commands passed.
The parallel browser attempt failed 16 scenarios: the controller ran ordinary
`vite build` concurrently with the synthetic browser build/preview, both using
the default `dist` directory. The static build completed during the browser run;
later pages lacked the synthetic app. This orchestration collision is retained
in `output/playwright/assess-import/2d7dc89387d603a02ee8df94/results.json`.
The serial browser rerun on unchanged source passed all 32 scenarios, with zero
skips, unexpected results or flakes; retained result:
`output/playwright/assess-import/5e946b79aa44e7eec1c19718/results.json`.
All 23 canonical local commands therefore passed on the final snapshot.
Do not run these two build-producing groups concurrently in this worktree.

Final command manifests are under `output/assess-import/validation/`:
`feature-8ff160d5-253f-4867-8986-5e398024201a`,
`regression-d1c6dcd5-f188-4e4b-8b17-b599a96eed38`,
`postgres-61feff3c-46b5-4ac8-abf4-0a94229803bc`,
`static-1e913a3e-9fc1-471b-8acc-94f0a0e1b5ea`, and
`browser-643ab91e-75c1-404d-b9e3-9abc14c3e445`.
Every final manifest identifies the same source digest. Command success is not
synthesized into exact assertion PASS.
Unit/SQL results are not real-provider or full UI acceptance proof.

The bridge composes production parser/binding/catalog/decoder functions with real
SQL; it does not invoke the complete mapping command. Actual SQL-to-decoder proof
covers initial claim and same-fence in-progress replay. Other lifecycle shapes
have unit/direct-SQL coverage, not complete orchestration coverage. Its effect
spies start after imports and prove zero effects only in the exercised body.
The service-only RPC is trusted for newly generated opaque hashes/UUIDs; valid
substitutions of those identities are not independently detected by this decoder.
SQL later revalidates persisted lineage. No untrusted injection path was found.

## Budget and rollback

One real OpenAI validation consumed a conservative USD 0.4714592 debit. Including
the sealed local carry of USD 0.86932, aggregate authorization charged is
USD 1.3407792 of USD 10. Invoice cost remains unverified. Preserve immutable
campaign expiry and all failed attempts; no reset, refund or parallel allowance.
Provider execution is disabled during repair. Safe rollback is disabled/read-only
mapping with retained records. No destructive repair or merge is authorized.
