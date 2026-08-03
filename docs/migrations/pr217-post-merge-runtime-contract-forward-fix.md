# PR #217 post-merge runtime-contract forward migration

Status: additive corrective candidate. PR #217 closure remains blocked. No hosted migration or deployment is authorized or claimed.

## Chain and preflight

Apply `20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql` only after the accepted `20260729163251_studio_private_artifact_authority.sql`. The accepted migration must retain Git blob `3383268eab95d1b2f12f4bb8a77246e63c3e30a3`.

The forward migration fails atomically when required PR #217 relations or functions are absent, when lifecycle rows contain incompatible values, when pre-existing forward-fix columns have incompatible types, or when a reconciliation-phase backfill candidate has partial or contradictory Storage metadata. A complete candidate must use the exact deterministic organization/workspace/opaque-object/format-extension key in addition to the exact provider, bucket, hash, byte-length, MIME, and filename rules; otherwise it raises `PR217_FORWARD_FIX_DIRTY_UPGRADE` before trigger suspension or data backfill. It then adds execution timestamps/fences, replaces effective projection and command functions, extends lifecycle guards, and adds service-only discovery, claim, guard, completion, and failure RPCs. Due discovery applies cheap indexed state/age predicates in each outer attempt-table query before the private exception-free rendition/deletion actionability functions, while retaining full actionability before its shared stable order and bounded limit; claim RPCs retain independent locked authority checks. Fenced rendition recovery also locks and rereads the runtime-control singleton in the same transaction immediately before returning mutation authority, and holds that lock through the caller. It replaces the accepted unconditional deletion-request uniqueness index with a history index plus a lock-protected unresolved-request check, allowing append-only `deletion_failed` recovery without rewriting accepted history. Reapplication is idempotent in the disposable upgrade harness.

## Access control

- Browser roles retain only the exact safe projection surface.
- Mutation, due-work, reconciliation, execution-guard, completion, and failure functions are revoked from `anon`, `authenticated`, and `public`.
- Exception-free actor, rendition-actionability, and deletion-actionability helpers are revoked from `public`, `anon`, `authenticated`, and `service_role`; only the service-only due RPC can use them through its definer boundary.
- Service-only functions return private bindings only after current authority and lifecycle checks.
- No table RLS is weakened, no provider schema is created, and the canonical bucket remains exactly `studio-private-artifacts`.

## Upgrade verification

Before any separately approved environment change:

1. verify the accepted migration blob;
2. run the full PostgreSQL 16 chain on an empty disposable database;
3. upgrade a disposable database stopped at accepted main;
4. reapply the additive tip;
5. prove dirty-upgrade rejection leaves no partial columns, constraints, indexes, or function changes;
6. run all 383 retained and focused scenarios, including superseded/revoked starvation, contradictory metadata, runtime pauses, hold/retention pause and resume, discovery-to-claim invalidation, deterministic mixed-kind ordering, response non-disclosure, mutation/audit/provider zero deltas, two-worker fencing, both runtime-control/recovery lock orderings, successful continuation after restore, canonical-key acceptance, wrong organization/workspace/object-ID/extension rejection, partial-metadata rejection, fully atomic dirty-upgrade rollback, and large-history `ANALYZE` plus `EXPLAIN (ANALYZE, BUFFERS)` proof for both due-work indexes and bounded actionability calls;
7. decode raw SQL projection output through the production TypeScript decoder;
8. prove both retention/deletion lock orderings, terminal tombstone rejection before receipt/attempt, and governed `deletion_failed` retry with historical rows preserved;
9. verify all new internal RPCs remain service-only.

These checks are source acceptance inputs, not evidence that a hosted database was migrated.

## Safe rollback

Do not down-migrate and do not edit either accepted migration. Through a separately approved forward operational change:

1. stop the scheduler or queue consumer;
2. set the single Studio private-artifact runtime control to disabled/read-only with provider, download, and deletion execution disabled;
3. retain safe read-only projections, private objects, attempts, receipts, policies, holds, deletion records, tombstones, and audits;
4. diagnose from sanitized aggregate evidence;
5. correct schema or behavior through another additive migration.

Never make the bucket public, restore browser Storage access, shorten retention, release legal holds, reset retry counters, hard-delete canonical metadata, or claim rollback by rewriting migration history.
