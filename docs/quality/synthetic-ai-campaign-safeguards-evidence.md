# Synthetic AI campaign safeguards: active verification

Status: local safeguards validation and independent review complete; exact-head CI and hosted activation not run for this patch. Not production readiness.
Scope is owned by `docs/planning/assess-studio-ai-output-correction.md`.
Base head: `f87e194d75e1a3b647d2d016e4c355798128c989`.

## Executed evidence

The base head completed all 18 applicable GitHub workflows successfully, including
Governed Delivery and Monitor PR C run `35248630574`. Hosted Pilot Live Acceptance
was intentionally skipped. These results predate the safeguards changes and must
not be represented as verification of the new working tree.

During local safeguards implementation:

| Exact command | Observed result | Boundary |
| --- | --- | --- |
| `npm run test:synthetic-ai-budget` | 18 tests passed | Mocked local ledger, carry seal, fixtures and semantic oracles only |
| `node --test scripts/prCMigrationTailContract.test.mjs scripts/projectionRpcPostgrestContract.test.mjs` | 11 tests passed | Exact successor-tail and projection harness contracts; not database execution |
| `node --check scripts/runCreationAccessPostgres.mjs` | Passed | Syntax only |
| `node --check scripts/testProjectionRpcPostgrest.mjs` | Passed | Syntax only |
| `node scripts/testProjectionRpcPostgrest.mjs` | 23 scenario assertions passed (24 Node tests including parent) | Actual disposable PostgreSQL 16/PostgREST 14.10 historical projection regression; not new campaign SQL |
| `git diff --check` | Passed at intermediate checkpoint | Must rerun after integration |
| `node scripts/runCreationAccessPostgres.mjs` | Passed, run `4d26e667-e750-4588-8ba3-05c7ed7bca4b` | Fresh 80-migration PostgreSQL 16 chain, 103 campaign assertions, populated upgrade, retained Pilot/PR C; owned container removal verified |
| `node scripts/runAssessImportValidation.mjs browser` | Passed, 32 expected / 0 unexpected / 0 skipped / 0 flaky | Desktop/mobile synthetic transport; not real-provider or hosted evidence |
| `node scripts/runAssessImportValidation.mjs regression` | Passed | Retained Assess, transcript, command/query, ingestion and provider-budget regressions |
| `npm run typecheck:edge` | Passed | Final pre-review runtime snapshot |
| `npm run build` | Passed | Local bundle only |
| `npm run test:scoring` | Passed | Deterministic scoring unchanged |
| `node scripts/check-secret-hygiene.mjs` | Passed, 0 forbidden / 0 tracked environment files | Static scan |
| `npm run test:ai-boundary-static` | Passed, 0 forbidden / 0 stale allowlist | Static scan |
| `node scripts/checkWorkflowYaml.test.mjs` | Passed | Workflow syntax/contracts |

The retained `enterpriseIntelligenceAi.test.ts`, `studioArtifactProvider.test.ts`,
`studioArtifactGeneration.test.ts` and `providerLifecycle.test.ts` each passed
through `node scripts/runEnterpriseIntelligenceTest.mjs supabase/functions/deno.d.ts
supabase/functions/_shared/<test-file>`. Tests explicitly inject mocked ordinary
permits; there is no automatic production fallback. Existing lifecycle recovery,
fencing and response-loss cases remain active. These intermediate passes must be
rerun after final runtime integration and do not prove database authorization.

Confirmed integration defect discovered during this work: legacy token-budget
capability mapping requires approval capabilities absent from the intended
synthetic author. The correction is scoped to an exact active campaign binding;
granting approval permissions to the author is prohibited. The real database
chain passed with the intended author in the dedicated PostgreSQL test, without
granting review/approval capabilities.

Read-only inspection of the retained local campaign ledger found 12 settled new
attempts and aggregate conservative charge 869,320,000 USD nanos, including the
earlier uncertain carry. No paid effects were executed during this continuation.
The real ledger has not yet been sealed or transferred.

The PostgREST run retained sanitized evidence under
`output/assess-import/projection-postgrest/373faa47-68c0-47cc-ad7f-419d4d52ddb8/result.json`.
Its result reports `passed` and `verified_owned_resources_removed`. The run
reproduced the old STABLE transaction failure, proved corrected projections and
wrong-scope/stale-authority denials, and retained exact no-side-effect checks.

The new local handover tests demonstrate exact carry/target binding, byte-for-byte
ledger preservation, idempotent same-target sealing, rejection of target changes,
rejection while a paid effect owns the lock, and zero mocked fetches after sealing
or a malformed seal. They do not prove hosted currency enforcement.

## Planned verification / not run

Two initial `node scripts/runCreationAccessPostgres.mjs` diagnostic attempts
failed before campaign scenarios at the new migration's predecessor guard:
both reported SQLSTATE `P0001`; the second retained the fixed signal
`SYNTHETIC_AI_CAMPAIGN_BUDGET_PREDECESSOR_DRIFT`. Each attempt
verified removal of only its owned disposable container/databases. These failed
attempts remain retained in `output/creation-access/`; they are not passes or
hosted failures. The exact canonical predecessor normalization was corrected
without weakening drift detection; the subsequent full-chain run above passed.

Final read-only reviews found two confirmed transport-binding defects in trusted
server wrappers: mutable request state could diverge after reservation, and raw
provider validation did not compare its transport identity to the consumed permit.
No direct external exploit path was established. Corrections must snapshot and bind
the exact transport, with mutation/substitution tests and zero-effect denial spies.
Quality review additionally requires stale attempt/consume substitutions and an
explicit fail-closed repeat-migration rejection with unchanged data and metadata.
The immutable transport and validation-identity corrections are implemented.
The corrected gateway suite passed 18/18, including six new adversarial transport
cases; lifecycle passed 36/36, including three new zero-effect denial cases and
retained ordinary rotation/Groq behavior. Root reran the gateway after the final
bound-resolver-method adjustment; it passed. Edge typecheck and static secret/AI
scans passed. Independent security review confirmed both transport defects fixed
and independently reran gateway/lifecycle suites. Quality closure found no new
implementation or test blocker. Final application typecheck also passed.

The correction rerun has now executed 135 campaign PostgreSQL assertions across
12 scenarios successfully. This includes all 19 consume-binding substitutions,
stale actor/receipt/token/fence reservations, and exact-precondition rejection of
reapplying the migration to the populated database. Whole public-table/auth-user
snapshots and function/grant/RLS metadata were unchanged, with 19 debits retained.
The enclosing 80-migration run `45e08f0a-abe4-4fcf-9c76-25b35363ecc6` also passed
all 14 retained scenarios, including Pilot and PR C, and reports
`verified_owned_container_removed`. Its result is retained at
`output/creation-access/postgres-45e08f0a-abe4-4fcf-9c76-25b35363ecc6/result.json`.

The initial evidence contract ran 63/64 tests because its canonical fresh-chain
marker still used the predecessor tip. The canonical generator now derives the
expected fresh tip from the independently approved migration inventory; it updates
expected context only, never an executed PASS. Canonical refresh and the complete
64/64 adversarial contract rerun passed, with 81 commands / 221 registered
assertions / 12 owners / 9 explicit not-run boundaries. The earlier failed attempt
remains retained, not rewritten as a pass.
The browser and regression manifests are retained under
`output/assess-import/validation/browser-ee959ab6-8c67-4ff0-9c8e-8b5c6eef2e97/`
and `output/assess-import/validation/regression-e3f96a23-273c-443b-80d4-7a2fb44d2601/`.
Both bind source digest `c50c455dbabb78a5c88646324ab0f83bcb05eaa4d36a7250ebf48538cccf5876`;
later corrections are not covered by that source snapshot.

After the transport corrections, both commands were rerun successfully against
source digest `82908c74ad135c59e3f7b510401148c0ca4210d2c962ac170a4afce16c624023`:
`output/assess-import/validation/regression-ef5c36de-c363-4aaa-818e-1658efcf5572/`
and `output/assess-import/validation/browser-70fe550e-3abc-49d5-a57f-1cbe1e08714e/`.
The corrected desktop/mobile run reports 32 expected, zero unexpected, zero
skipped and zero flaky tests. Final secret hygiene and workflow checks passed.
Only evidence/readiness documentation and its canonical digest refresh followed;
no tested runtime, migration, test or browser implementation changed afterward.

New exact-head CI remains required before activation. Hosted installation, accounts,
provider-secret installation and paid browser scenarios are not run. No document
approval, handoff, merge, customer-data or production action is authorized here.

## Rollback

Before activation, leave the new campaign authority absent/disabled. After an
approved activation, disable the new campaign and routes without deleting charged
attempts, resetting budgets, undoing a local handover seal or rewriting prior
evidence. Existing provider-free backends and frozen human evidence are preserved.
