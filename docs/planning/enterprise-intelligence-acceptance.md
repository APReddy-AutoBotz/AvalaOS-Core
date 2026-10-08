# Enterprise Intelligence acceptance

## Objective and baseline

Prove EI-001, EI-002, EI-004 and EI-005 through real disposable-PostgreSQL commands while preserving all catalog criteria. AP authorized continued focused acceptance work and verified merges. PR #277 merged as `26ddf9cc1a0c62e52d0dd108653caf2eb9ee9ddc`; its tree `4d7e161c138ebded94fd6cb2639fb50630f67cc4` matches tested candidate `924d7d62652d077a09e540f72ff3a92c85936e6f`. All 14 applicable candidate workflows and post-merge Core CI `37714454932` passed. Exact acceptance run `37662150396` attempt 1 proves 36 PASS / 0 FAIL / 72 BLOCKED / 0 UNCOVERED.

The architecture, security and quality read-only reviews are complete. Wave 2 uses the fixed workspace-write profile within this package. One implementation worker owns a focused EI harness, producer and tests; the root owns integration, active documentation, source bindings, verification and the single PR. No nested delegation.

## Authority and scope

Product authority is `docs/architecture/enterprise-intelligence-authority.md`. The existing Enterprise implementation plan remains authoritative for product behavior. No scoring, provider, hosted, deployment, Health, autonomous execution, dependency or acceptance-meaning change is included. Real providers remain disabled. The existing broad Enterprise PostgreSQL matrix remains intact; a dedicated focused harness avoids rerunning its seven-database regression matrix as a second acceptance owner.

GOVERN-001 through GOVERN-007 and the other hosted cases remain BLOCKED because their required environment is hosted_sandbox. Delivery's legacy import/retained-lineage semantics cannot be replaced by modern package commands. EI-003 retains its known read-only/one-mutation mismatch and remains BLOCKED. Do not reinterpret any of these cases.

## Confirmed defect and approved correction

The canonical source limit is 12,000,000 bytes, enforced in the application parser and Edge command. The current PostgreSQL source-version CHECK permits 12,582,912, and no current receipt-aware wrapper closes the gap. A direct service-role receipt-aware caller can persist a value above the canonical limit. The existing negative test checks only 12,582,913 and does not prove the exact boundary.

AP explicitly approved the bounded correction on 2026-10-08, superseding only the active goal’s no-schema clause. Migration `20261008022445_enterprise_evidence_canonical_size_limit.sql` is one atomic DO statement: lock against concurrent writes, abort with a stable code on incompatible immutable history, add and validate the exact new CHECK, then remove the old CHECK. It rewrites no source-history row. Verification covers the empty current-chain database, compatible populated history unchanged, and incompatible history aborting with both data and old constraint unchanged, all in the disposable database. No hosted apply is authorized.

The exact approved migration tail and fresh-chain preflights include this hundredth migration. CI established that the environment marker must match the latest migration. The same atomic migration therefore verifies the exact predecessor marker, constraints, inactive-exercise state and four current-consumer definitions, then advances only their tip literals and the marker/exercise tip constraints to `20261008022445`. Every historical exercise tip remains accepted; existing permissions, approval gates, limits and runtime defaults remain unchanged. No campaign, window, allowance or provider call is created. Historical and partial-upgrade test identities remain unchanged.

## Exact acceptance and trust boundaries

Use a unique disposable PostgreSQL database, the complete ordered current migration chain and existing synthetic terminal-journal guard, plus the existing Enterprise fixture helper. Construct the existing SQL-only prerequisite fixture under its required simulation defaults; it performs no HTTP/provider call. Disable both provider runtimes before the upgrade-history proof and all acceptance cases, and assert they remain disabled before and after each case. Real Storage, provider and other hosted I/O remain not run. All command operations use service-role-only receipt-aware RPCs with current actor/tenant/capability checks. Never call the revoked receipt-unaware inner source function to bypass the real command journal.

| Case | Required observations |
| --- | --- |
| EI-001 | One genuine source aggregate at the canonical maximum. Exact 12,000,001-byte, MIME, bucket/path and foreign-tenant negatives must produce no source/version/effect residue. Exercise production validation/extraction helpers where applicable; distinguish persisted database validation from hosted Storage proof. Inspect the final database constraint. Requires resolution of the size-limit defect. |
| EI-002 | One genuine source and immutable version with exact tenant/source/current-version/hash/provenance lineage. Correct-tenant safe projection succeeds; foreign-tenant selectors disclose no source. No provider, job or usage effect. |
| EI-004 | One original receipt-aware command and exact current-authority replay. Preserve the canonical response/resource, one product aggregate and one effect; changed payload under the same key conflicts. Revoked authority cannot disclose historical success. Correlation-attempt bookkeeping is distinct from product mutations. |
| EI-005 | One real draft blueprint bound to an eligible canonically approved modernization decision. Schema assemble-blueprint-1, draft status and exact tenant/decision lineage; all seven code-generation/deployment/infrastructure/credential/source-system/agent/telemetry controls remain disabled. Forbidden mutation is denied without effects. No provider effect or operational outcome is claimed. |

Prerequisite fixture/approval writes never count as the target logical mutation. Measure target rows, source versions or blueprint, command receipt, effect journal and relevant audit separately. Bind exact request, receipt, actor, tenant, resource and immutable ancestry. Production helper results and measured database facts drive evidence; unit fixtures must not substitute for execution. Retain only safe counts, booleans, digests and stable error codes.

## Failure classification and cleanup

Run each case in a transaction with unconditional rollback. Setup, database, migration or prerequisite failures leave unexecuted cases BLOCKED; actual evaluated behavior mismatches are FAIL. Preserve independent per-case PASS/FAIL/BLOCKED results. A valid complete producer may exit successfully for retained transport, but the retained CI gate fails on any unsuccessful case; standalone unsuccessful execution exits nonzero.

Close connections, drop the unique database and any roles created by this harness, and verify their absence before emitting evidence. Rollback or cleanup failure is fatal and emits no artifact. No raw data, object paths, identifiers, credentials, provider responses or logs belong in the evidence.

## Integration and focused verification

Add a dedicated enterprise-intelligence-postgres-acceptance owner for these four cases, while retaining EI-003's existing aggregate owner. Pass ENTERPRISE_INTELLIGENCE_ACCEPTANCE_DATABASE_URL from the existing exhaustive PostgreSQL 16 service. Add strict identity/source/scope/actual-result validation at producer ingestion and final report consumption. Refresh proof-owner contracts, source provenance and generated PR C bindings after final edits.

Run focused producer/adversarial tests, report integration including partial/forged/mixed outcomes, catalog/traceability/provenance checks, workflow YAML, secret hygiene and diff checks. No new local broad regression, browser, performance or provider run is needed. Local PostgreSQL is unavailable; do not install or start services. Existing exact-candidate CI provides PostgreSQL execution and required merge gates.

Before merge, independently verify target 40 PASS / 0 FAIL / 68 BLOCKED / 0 UNCOVERED, all other 104 statuses unchanged, exact candidate/run/source/scope/cleanup binding, hosted NOT_EXECUTED and overall INCOMPLETE_COVERAGE. These are planned results until executed. Resolve review findings, require all applicable gates, merge with expected head, and verify the merged tree equals the tested tree.

## Local verification checkpoint (2026-10-08)

Executed: the evidence producer's 8 focused tests; production parser/extractor with a valid exactly 12,000,000-byte input and oversized-input rejection; the three new report integration tests (including ten report variants and independent PASS/FAIL/BLOCKED transport); evidence adversarial tests; catalog and traceability validation; metadata fixture/oracle checks; workflow YAML and syntax checks. All passed after correcting the test input's extracted-text limit, denial measurement before cleanup, and an overly broad redaction check that rejected a public migration filename containing `secret`. That filename exception is exact and still requires source provenance; URL, traversal and suffixed-name substitutions remain rejected.

The retained missing-configuration path emits four BLOCKED results and exits zero for transport; standalone missing configuration exits nonzero. These are harness checks, not executed PostgreSQL acceptance. Initial CI exposed a marker/ledger mismatch and prematurely disabled Studio fixture. Candidate `2f53f369` cleared both: Enterprise Intelligence and Pilot Operations passed; acceptance run `37719047040` retained 36 PASS / 0 FAIL / 72 BLOCKED with all 108 statuses unchanged. Its four new cases remained BLOCKED by permission denial on the authority RPC during incompatible-history setup. The current production signature and cumulative privileges require investigation; the failure does not authorize a test-only grant or authorization bypass. Artifact `11525008146` was downloaded and its SHA-256 matched GitHub's recorded digest. New EI database PASS, complete exact-candidate CI and merge remain planned verification. AP approved the narrow schema exception; no hosted apply is authorized. Unrelated local edits and stash are preserved.

## Approved authority-RPC correction

Read-only audit after run `37719047040` confirmed a separate source defect: production `enterpriseIntelligenceCommand.ts` directly invokes `pr1b_assert_command_authority(uuid,uuid,uuid,text,bigint)`, but the current migration chain leaves `service_role` without EXECUTE. The harness calls the correct signature as the actual server role; substituting a superuser would conceal the defect. All other source, extraction, journal, completion, blueprint and projection signatures/ACLs used by this harness match the current production boundaries.

AP explicitly approved the correction on 2026-10-08: grant EXECUTE on that one existing authority check to `service_role`, preserving PUBLIC/anon/authenticated denial and the existing function body. This supersedes the active goal's runtime/schema exclusions only for the approved size and authority-call corrections. Include the grant in the existing unmerged migration, preserving its identity integration, and verify real-role valid authority, stale authorization, missing capability, removed membership and foreign-tenant denial without effects. Historical oversized rows are isolated prerequisite fixtures; they do not count as target command proof or justify test-only privilege grants. No hosted apply is included. The four EI cases remain BLOCKED until the corrected candidate is verified; no merge is ready.

## Rollback and fallback

Revert acceptance harness, producer, owner bindings and metadata together to return the four cases to BLOCKED. When the approved constraint correction is merged, retain immutable history and correct future issues with an additive forward migration; do not weaken the canonical limit or rewrite data as a test rollback. No hosted rollback is authorized or needed by this repository-only package.

If the authority grant must be withdrawn later, a separately authorized forward migration may revoke only its service-role EXECUTE grant; Enterprise commands then fail closed at their authority check. Keep the byte limit and browser-role denial intact. Do not alter historical migrations or silently substitute a privileged test caller.
