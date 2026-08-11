# V1 Pilot Operations Runbook

## Authority boundary

Workstream 6 configures a non-production pilot control plane. `LIVE_ACTIVATION_NOT_AUTHORIZED` structurally prevents hosted inspection, mutation, deployment, real secret configuration, real provider calls, and customer-data use. Hosted pilot activation requires separate explicit AP approval.

The operator UI consumes only a sanitized server projection; browser-created release identity, environment truth, approval, workflow evidence, or secret paths are never authority. Missing, stale, revoked, or incompatible authority fails closed.

## Governed operations

**Bootstrap/deprovision:** select the exact synthetic organization, workspace, and `pilot_candidate` environment through an authenticated command with expected authority/aggregate versions and a unique request key. Replay the identical request after response loss. Deprovision by deactivation while preserving release, approval, receipt, effect, and audit history; reactivation is a separate transition.

**Promotion simulation:** bind the candidate to exact commit, build, schema, migrations, workflow, and evidence; run preflight; obtain fresh independent approval for that exact version; then run only non-live simulation. New or superseded candidates never inherit approval. The final gate remains `LIVE_ACTIVATION_NOT_AUTHORIZED`.

Hosted/live stop gates are projected separately from non-live blockers. They remain visible and structurally deny hosted activation, but do not prevent the governed `non_live` simulation after its evidence, validation, approval, schema, maintenance, and read-only gates pass.

Candidate validation reads an immutable server-side evidence-manifest record whose environment, Git/build identity, workflow run/head, schema compatibility, manifest digest, and complete required-gate set exactly match the candidate. Caller-supplied evidence metadata cannot validate a candidate. Every mutation supplies an aggregate `expectedVersion`; missing or stale versions fail closed.

**Maintenance/read-only/rollback:** require fresh authority, expected version, idempotency, and atomic audit. Preserve safe authorized reads and deny new mutations. Exact replay never bypasses revoked authority. Rollback selects an immutable prior release and records a new audited transition; prefer feature disablement/read-only and additive forward repair, never destructive history or migration rewriting.

The database serializes each command scope, tenant/workspace, and idempotency key before receipt lookup or effect execution. Exact committed response-loss retries return the canonical receipt; changed-payload key reuse conflicts. A deprovisioned pilot tenant revokes Pilot Operations commands and projections until the explicit governed reactivation transition restores authority, regardless of retained workspace membership.

An active tenant environment rebind is a versioned aggregate mutation. It increments and returns the authoritative tenant version; exact response-loss replay returns that version, while stale sequential or concurrent rebinds fail with `VERSION_CONFLICT`.

Enabled provider bindings re-check the canonical Enterprise Intelligence configuration, workspace route, active key reference, deletion state, and retained 24-hour validation window under lock. Stale, retired, disabled, deleted, or cross-scope provider authority is rejected; no raw reference is projected.

## Disposable backup and recovery

GitHub Actions PostgreSQL 16 is authoritative for the synthetic drill. Create deterministic backup and compatibility metadata, restore into a clean database, validate canonical lineage/approvals/receipts/effects/artifact tombstones/operations bindings, and reject truncated, corrupt, or wrong-version material. Restore must not mint release identity, approval, or audit events.

The workflow applies the full migration chain to fresh and accepted-baseline-upgrade disposable databases, then publishes exact-head/run execution artifacts. The final manifest downloads and verifies those artifacts; a static SQL contract test or in-memory recovery model is supplemental only and cannot satisfy a PostgreSQL gate.

An operator may record a failed or requested drill but cannot self-attest a pass. Passed recovery truth is inserted only by the service/CI ingestion RPC and is immutably bound to the exact workflow name, run, head SHA, artifact digest, evidence digest, environment, and canonical schema version.

## Troubleshooting

- **Stale/version conflict:** reload the server projection; never silently retry changed payload.
- **Revoked/denied:** stop without disclosing whether another tenant resource exists.
- **Missing evidence:** retain blocked status and run exact-head authoritative CI.
- **Restore mismatch:** keep read-only, reject restore, record only sanitized failure, and forward-fix.
- **Disabled provider:** never fall back to browser keys, mocks, or alternate references.
- **Governed query failure:** return only the allowlisted domain code; unknown SQL/PostgREST text is reported as `PERSISTENCE_UNAVAILABLE` without details.
- **Hosted action:** stop and obtain separate AP approval.

PostgreSQL, Desktop Chrome, Pixel 7, and the full manifest are authoritative only when the `Pilot Operations` workflow records a successful exact-head result. Missing, skipped, cancelled, stale, or mismatched evidence is blocked/failed, never passed.

## Governed non-live rollback and recovery ingestion controls

Rollback is a server-authoritative, non-live forward supersession to the exact prior candidate promoted in the same environment. The server projects the opaque target and a bounded eligibility reason, then revalidates tenant/environment binding, current candidate and target versions, fresh `release.promote` authority, operator separation, runtime controls, and idempotency under lock. A successful operation appends immutable rollback, release, receipt, and sanitized audit history; it never deletes history, downgrades a migration, invokes a hosted target, or changes `LIVE_ACTIVATION_NOT_AUTHORIZED`. When rollback is unavailable, the projection supplies the exact bounded reason and the Admin action remains unreachable.

Trusted recovery-evidence ingestion is service/CI-only but is not exempt from environment authority. Deactivated lifecycle, maintenance, read-only mode, or the `recovery` feature kill switch denies every new canonical evidence mutation before either immutable recovery row is inserted. Authorized safe reads remain available. The safe fallback is maintenance/read-only or feature disablement with retained immutable records and an additive forward fix; destructive schema or evidence rollback is prohibited.

Current tenant lifecycle is checked before operational receipt replay and trusted recovery ingestion. A retained authorized actor receives bounded `TENANT_DEPROVISIONED`; callers without current tenant authority retain the non-disclosing denial. Exact response-loss replay remains available only while current tenant and operator authority permit it, and bootstrap/rebind replay remains actor-bound. Provider response-loss retry recovers an authorized committed receipt before external-reference freshness checks, while every new effect revalidates the canonical provider lifecycle.

The operator projection selects the newest pending/actionable candidate and retains the most recent promoted candidate as immutable history. Provider status, schema compatibility, promotion readiness, and completed backup/restore state are derived from current canonical server records. Global read-only mode continues to load this sanitized history/status projection while omitting every command handler; a tenant change invalidates pending command completion before it can replace the newly selected tenant projection.

Rollback eligibility derives the current and immediately prior releases exclusively from immutable `promoted_non_live` event history. Draft, validated, or approved candidates remain separately actionable and never replace promoted-current truth; fewer than two promoted releases remains ineligible. The Admin rollback command uses the server-projected promoted-current identifier/version and prior promoted target, including after a prior rollback.

Promotion history uses an immutable, monotonic per-environment ordinal allocated under the same environment row lock as the promotion or rollback transition. Projection and rollback select current/prior truth only through that bounded ordinal index; transaction-start timestamps and UUIDs are never ordering authority. Exact receipt replay allocates no ordinal, and transaction rollback atomically removes the ordinal, event, domain transition, receipt, and audit. A single legacy promotion is safely representable, while ambiguous legacy multi-promotion history fails closed with `AMBIGUOUS_PROMOTION_HISTORY`. The safe fallback is read-only/maintenance plus additive forward repair; history is never guessed or rewritten.
