# PR #217 post-merge runtime-contract forward migration

Status: additive corrective candidate. PR #217 closure remains blocked. No hosted migration or deployment is authorized or claimed.

## Chain and preflight

Apply `20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql` only after the accepted `20260729163251_studio_private_artifact_authority.sql`. The accepted migration must retain Git blob `3383268eab95d1b2f12f4bb8a77246e63c3e30a3`.

The forward migration fails atomically when required PR #217 relations or functions are absent, when lifecycle rows contain incompatible values, or when pre-existing forward-fix columns have incompatible types. It then adds execution timestamps/fences, replaces effective projection and command functions, extends lifecycle guards, and adds service-only discovery, claim, guard, completion, and failure RPCs. Reapplication is idempotent in the disposable upgrade harness.

## Access control

- Browser roles retain only the exact safe projection surface.
- Mutation, due-work, reconciliation, execution-guard, completion, and failure functions are revoked from `anon`, `authenticated`, and `public`.
- Service-only functions return private bindings only after current authority and lifecycle checks.
- No table RLS is weakened, no provider schema is created, and the canonical bucket remains exactly `studio-private-artifacts`.

## Upgrade verification

Before any separately approved environment change:

1. verify the accepted migration blob;
2. run the full PostgreSQL 16 chain on an empty disposable database;
3. upgrade a disposable database stopped at accepted main;
4. reapply the additive tip;
5. prove dirty-upgrade rejection leaves no partial columns, constraints, indexes, or function changes;
6. run the retained PR #217 scenarios, the forward-fix projection/command/recovery matrix, and two-connection hold/deletion races;
7. decode raw SQL projection output through the production TypeScript decoder;
8. verify all new internal RPCs remain service-only.

These checks are source acceptance inputs, not evidence that a hosted database was migrated.

## Safe rollback

Do not down-migrate and do not edit either accepted migration. Through a separately approved forward operational change:

1. stop the scheduler or queue consumer;
2. set the single Studio private-artifact runtime control to disabled/read-only with provider, download, and deletion execution disabled;
3. retain safe read-only projections, private objects, attempts, receipts, policies, holds, deletion records, tombstones, and audits;
4. diagnose from sanitized aggregate evidence;
5. correct schema or behavior through another additive migration.

Never make the bucket public, restore browser Storage access, shorten retention, release legal holds, reset retry counters, hard-delete canonical metadata, or claim rollback by rewriting migration history.
