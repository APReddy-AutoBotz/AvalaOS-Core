# Assess process creation authority and rollback

## Outcome and scope

An authorized workspace member can create a bounded manual Assess process or one of the two existing template-backed process records. The browser sends no owner, role, approval, score, or pricing claim. The server derives the owner from the authenticated actor and commits one process, command receipt, and privileged audit event in one PostgreSQL transaction. Creation returns success only after a separately scoped committed read matches the request identity and receipt binding. V1 scoring and existing Assess V2 lineage remain unchanged.

The old hosted browser insert into `assess_processes` is removed. Local demo mode remains local only. The fixed PR #264 controlled-human personas and seeded rows are not modified by this migration.

## Boundary and controls

- `process-command` accepts exactly `process.create` with current organization, workspace, authorization version, zero expected version, bounded fields, one generated process ID, request ID, and stable idempotency key.
- The Edge handler checks the authenticated user and fresh tenant authority; the service-role transport invokes `create_assess_process`, which independently rechecks active profile, memberships, `assess.process.create`, `assess.read`, and the authorization epoch inside the transaction.
- The new capability is registered but is not automatically granted to any role. A role grant is a separate governed administrative change.
- `process_creation_workspace_controls` is absent/default-off. An explicitly authorized synthetic workspace needs an operator-controlled row with `enabled=true` and `read_only=false`. The row locks while quota is counted and committed, so two concurrent creates cannot bypass the workspace maximum.
- Template IDs and all template-owned fields must match the server template registry. Unknown templates and changed template claims reject.
- Creation receipts, request IDs, and idempotency keys are stored on new process rows. An uncertain browser transport result reuses the same in-memory request anchor and verifies the exact process/request binding before presenting success. New input cannot replace an unresolved same-scope anchor.
- Direct authenticated process insert remains denied by the existing RLS and grant boundary. New controls and template registry are RLS-forced and unavailable to browser roles.

## Failure and compatibility behavior

Wrong workspace, revoked actor, missing capability, stale authorization, disabled control, read-only control, quota exceedance, changed idempotency payload, substituted response, or mismatched committed read fail closed. Known domain codes are bounded; unexpected database errors return `COMMAND_UNAVAILABLE` without raw SQL or request content. Transaction exceptions roll back process, receipt, and audit together. An exact succeeded receipt may replay only after current authority passes; a soft-deleted process remains absent from committed readback and cannot be shown as successful.

Existing processes have nullable creation lineage columns and remain readable under current tenant-scoped Assess RLS. This migration does not backfill, delete, or rewrite existing Assess records. A newly created process starts `Not Started`; V1 assessment authoring, score version, review, and approvals follow their existing independent controls.

## Rollout and rollback

Apply the full retained migration chain in a disposable database before any hosted rollout. Keep all workspace creation controls disabled until the new server command, client, role grant, and scoped projection are verified together on the dedicated synthetic environment. Rollback is a read-only operation: set the exact synthetic workspace control to `enabled=false, read_only=true`, revoke the process-create role capability if needed, and leave committed processes, receipts, and audits intact. Do not reverse the additive migration or erase history. Forward fixes may amend the command without changing V1 scores.

The already-applied `20260915142940` and `20260915142942` files are immutable.
Their required forward successor `20260916003000_creation_access_migration_identity_convergence.sql`
repairs the retained operational identity marker, whose exact-ledger gate correctly
rejected the incomplete intermediate chain. It requires one exact frozen marker,
both predecessor tables and unchanged non-production flags, then advances the
marker and CHECK constraint atomically. Deploy the complete approved tail as one
maintenance window; an intermediate tip is not operational readiness. Never apply
this tail to the old controlled-human backend. Rollback remains read-only/default-off
with preserved ledger, marker, accounts and history, followed by an additive fix.

## Acceptance and verification

Focused contract/API tests exercise exact payload ownership, permission denial before atomic command, foreign workspace, stale epoch, fake template, substituted owner/receipt/request/key, wrong committed projection, unknown transport recovery, and no optimistic success. Disposable PostgreSQL tests must apply the migration chain and run allowed/denied actor and two-workspace cases, replay/conflict/quota/read-only/rollback checks, and verify exactly one process, receipt, and audit per accepted request. Browser checks must exercise creation, save and reopen of an existing V1 assessment, template creation, denied roles, and accessible busy/error behavior. Record exact commands and sanitized outcomes in this implementation PR; do not promote any hosted or controlled-human acceptance claim from local tests alone.
