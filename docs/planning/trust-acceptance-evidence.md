# Trust Acceptance Evidence

## Objective

Promote `TRUST-001` through `TRUST-005` only when the exact candidate runs assertion-derived Trust Assurance behavior against an owned disposable PostgreSQL 16 database. The retained suite remains the existing `trust-authority` owner, while its command now executes the real migration chain and service-only Trust RPC boundary.

## Bounded behavior

- `TRUST-001` proves one evidence-link mutation binds the reviewed evidence version and canonical hash to the selected claim ancestry, with one matching receipt and audit event.
- `TRUST-002` proves one publication by three distinct active creator, reviewer, and publisher actors, followed by a same-actor publication denial with no additional effects.
- `TRUST-003` proves one service-RPC evidence registration, then a stale replacement denial with unchanged version, hash, current-version pointer, receipts, and audits. Direct trigger disabling is not acceptance proof.
- `TRUST-004` proves foreign-tenant caller and resource denials with zero evidence, receipt, audit, or publication-pointer changes in either synthetic tenant.
- `TRUST-005` proves one withdrawal mutation with semantic receipt and audit fields, replay without duplicates, and complete rollback when the audit insert fails.

The five cases keep their existing expected mutation, denial, audit, and result criteria. The synthetic fixture is fixed to `synthetic-trust-postgresql-v1` and its repository-safe organization/workspace IDs. No customer data, hosted system, provider, runtime schema, or production migration is changed.

## Evidence contract

The producer binds every exact result to the release SHA, workflow run and attempt, canonical retained command, workflow path, environment, canonical Trust branch and assertion IDs, exact fixture scope, and canonical SHA-256 bytes for:

- `scripts/testTrustAssurancePostgres.mjs`
- `scripts/trustAcceptanceEvidence.mjs`
- `services/trustAssurance/domain.ts`
- `supabase/migrations/20260808190000_trust_assurance_evidence_hub.sql`

The result set must contain each of the five Test IDs exactly once. The producer and report validator reject stale identity, substituted source bytes, partial or duplicate results, wrong command or scope, incorrect mutation/audit facts, and a missing cleanup confirmation. An executed assertion failure remains `FAIL`; missing or invalid proof cannot become `PASS`.

The harness publishes its sanitized result artifact only after all owned clients, databases, and temporary roles are removed successfully. Logs contain scenario names and bounded failure summaries; the artifact contains no database URL, secret, raw log, or generated object identifier.

## Verification

Focused verification for this slice is:

1. Trust evidence producer and adversarial validator tests.
2. Acceptance declaration, traceability, provenance, and report integration tests.
3. The Trust PostgreSQL harness against the workflow-owned PostgreSQL 16 service.
4. Repository diff and whitespace checks.

Local PostgreSQL execution is `not run` when the managed workstation has no available Docker Linux engine or native PostgreSQL server. That environment limitation cannot be represented as executed database evidence. The exact candidate workflow must run the real database harness before the intended report state of 19 `PASS` and 89 `BLOCKED` is accepted.

### Focused results on 2026-10-05

- `node scripts/exhaustiveAcceptanceValidate.mjs` — `PASS` (108 catalog tests, 108 source-backed branches, 0 uncovered).
- `node tests/acceptance/validators/validate-traceability.mjs` — `PASS` (108 branches/cases, 0 errors).
- `npm.cmd run test:trust-acceptance-evidence` — `PASS` (3/3 producer, substitution, and genuine-failure cases).
- `node scripts/exhaustiveAcceptanceEvidence.test.mjs` — `PASS`.
- Focused `Trust report` integration — `PASS` (8/8 valid, substituted, partial, aggregate-only, and genuine-failure variants).
- `node --check` for the Trust PostgreSQL harness, Trust evidence helper, retained-suite runner, and retained evidence validator — `PASS`.
- Disposable PostgreSQL harness — `not run` locally because the managed workstation exposed neither a Docker Linux engine nor native PostgreSQL tools. The workflow PostgreSQL 16 execution remains required before promotion.

## Proof limits

This evidence proves only the five deterministic Trust rules against the candidate migration chain in an owned disposable database. It does not prove hosted deployment, production configuration, customer data behavior, external providers, performance, availability, or broader product readiness. All other 103 acceptance case definitions and their evidence state remain unchanged.

## Rollback

Revert the Trust retained command, exact producer/validator, five metadata bindings, workflow database environment, and focused tests together. The five Test IDs then return to `BLOCKED` because exact assertion artifacts are absent. No database rollback is required: every run creates and removes isolated databases and roles, and this slice changes no product migration or runtime schema.
