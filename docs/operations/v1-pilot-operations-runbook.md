# V1 Pilot Operations Runbook

## Authority boundary

Workstream 6 configures a non-production pilot control plane. `LIVE_ACTIVATION_NOT_AUTHORIZED` structurally prevents hosted inspection, mutation, deployment, real secret configuration, real provider calls, and customer-data use. Hosted pilot activation requires separate explicit AP approval.

The operator UI consumes only a sanitized server projection; browser-created release identity, environment truth, approval, workflow evidence, or secret paths are never authority. Missing, stale, revoked, or incompatible authority fails closed.

## Governed operations

**Bootstrap/deprovision:** select the exact synthetic organization, workspace, and `pilot_candidate` environment through an authenticated command with expected authority/aggregate versions and a unique request key. Replay the identical request after response loss. Deprovision by deactivation while preserving release, approval, receipt, effect, and audit history; reactivation is a separate transition.

**Promotion simulation:** bind the candidate to exact commit, build, schema, migrations, workflow, and evidence; run preflight; obtain fresh independent approval for that exact version; then run only non-live simulation. New or superseded candidates never inherit approval. The final gate remains `LIVE_ACTIVATION_NOT_AUTHORIZED`.

Candidate validation reads an immutable server-side evidence-manifest record whose environment, Git/build identity, workflow run/head, schema compatibility, manifest digest, and complete required-gate set exactly match the candidate. Caller-supplied evidence metadata cannot validate a candidate. Every mutation supplies an aggregate `expectedVersion`; missing or stale versions fail closed.

**Maintenance/read-only/rollback:** require fresh authority, expected version, idempotency, and atomic audit. Preserve safe authorized reads and deny new mutations. Exact replay never bypasses revoked authority. Rollback selects an immutable prior release and records a new audited transition; prefer feature disablement/read-only and additive forward repair, never destructive history or migration rewriting.

The database serializes each command scope, tenant/workspace, and idempotency key before receipt lookup or effect execution. Exact committed response-loss retries return the canonical receipt; changed-payload key reuse conflicts. A deprovisioned pilot tenant revokes Pilot Operations commands and projections until the explicit governed reactivation transition restores authority, regardless of retained workspace membership.

## Disposable backup and recovery

GitHub Actions PostgreSQL 16 is authoritative for the synthetic drill. Create deterministic backup and compatibility metadata, restore into a clean database, validate canonical lineage/approvals/receipts/effects/artifact tombstones/operations bindings, and reject truncated, corrupt, or wrong-version material. Restore must not mint release identity, approval, or audit events.

The workflow applies the full migration chain to fresh and accepted-baseline-upgrade disposable databases, then publishes exact-head/run execution artifacts. The final manifest downloads and verifies those artifacts; a static SQL contract test or in-memory recovery model is supplemental only and cannot satisfy a PostgreSQL gate.

## Troubleshooting

- **Stale/version conflict:** reload the server projection; never silently retry changed payload.
- **Revoked/denied:** stop without disclosing whether another tenant resource exists.
- **Missing evidence:** retain blocked status and run exact-head authoritative CI.
- **Restore mismatch:** keep read-only, reject restore, record only sanitized failure, and forward-fix.
- **Disabled provider:** never fall back to browser keys, mocks, or alternate references.
- **Hosted action:** stop and obtain separate AP approval.

PostgreSQL, Desktop Chrome, Pixel 7, and the full manifest are authoritative only when the `Pilot Operations` workflow records a successful exact-head result. Missing, skipped, cancelled, stale, or mismatched evidence is blocked/failed, never passed.
