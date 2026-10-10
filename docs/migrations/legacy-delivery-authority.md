# Legacy Delivery authority

Status: approved implementation candidate. This document describes repository and disposable-PostgreSQL behavior. It is not hosted, pilot, production, deployment, or paid-provider evidence.

Migration `20261010025331_legacy_delivery_authority.sql` promotes the existing `delivery_work_items` storage for the original Docs-to-Delivery Task workflow. It does not substitute Governed Delivery/Monitor PR C packages and does not create a second task aggregate. Existing rows are neither backfilled nor rewritten. They remain queryable with `version: null` and `mutable: false`; new authoritative rows have a positive version and may be changed only through the service command.

## Server contract

`legacy_delivery_apply_command` is executable only by `service_role`. It receives a server-resolved actor, organization, workspace, expected authorization version, request ID, actor-scoped idempotency key, action, and exact action payload. Supported actions are `import`, `task.create`, `task.update`, and `task.delete`. The function resolves current canonical membership, capability, project, source, assignment, dependency, and version state inside the transaction. A workspace control row with `writes_enabled=true` is required and locked for the transaction; installation creates no row, so writes default off. An exact committed retry rechecks current authority and resource scope before returning its stored response, including assignment for `task.update.own`.

Imports accept selectors only: `projectId`, `sourceGenerationId`, `expectedSourceDigest`, and unique zero-based `sourceItemIndices`. The server reads `document_generations.artifacts.workItems`, validates the generation, project, Assess process and assessment ancestry independently, verifies the `sha256:` digest, and creates one logical import plus the selected Story/Task rows atomically. Epic source items are grouping metadata. They produce no mutable Epic row; following items retain `sourceEpicIndex` and `sourceEpicTitle`. Source descriptions, criteria counts and strings, and the composed task description are bounded before commit.

Direct create accepts the exact task fields `title`, `description`, `priority`, `type`, `assigneeIds`, and `dependencyIds`. The server sets status to `To Do`, owner and reporter to the actor, and version to 1. Assignment changes require `task.assign`, project management, or the existing administrative equivalence. `task.update.own` is limited to an active assigned task and cannot change assignees or dependencies. Status transitions follow `services/deliveryWorkflowPolicy.ts`, and progress is denied while an active dependency is incomplete. Retained or soft-deleted rows reject update.

Delete never physically removes an authoritative row. Imported/source-bound rows retain immutable lineage, terminal rows retain release history, referenced rows retain dependency history, and other eligible rows become soft-deleted. Direct physical delete is rejected by the row guard.

`legacy_delivery_query` is service-only and reauthorizes `task.read`, `backlog.read`, project management, or the existing administrative equivalence. It returns at most 100 UUID-keyset rows. `includeRetained` defaults to true so lineage remains inspectable. An optional source generation returns only the validated selector projection `{id,digest,items}`; arbitrary generation metadata is never returned.

## Persistence and compatibility

The migration adds nullable authority, import, source-index, Epic-grouping, and retention columns to `delivery_work_items`, plus normalized workspace controls, command receipts, imports, assignees, and dependencies. Receipt, import, source lineage, creation authority, and ancestry fields are immutable. One workspace/project/generation/source-index tuple may be imported only once, even if the source artifact later changes.

The preflight requires the exact predecessor hosted-pilot marker and current marker consumers, rejects active controlled-human exercises, and advances the marker and consumers to `20261010025331` only after installation. Unsafe partially promoted history aborts the transaction. Historical rows with all new authority fields null are preserved unchanged.

A restrictive SELECT policy preserves direct historical reads while routing newly authoritative rows exclusively through the capability-checked query RPC. The older workspace-membership SELECT policy cannot expose new rows directly. Browser roles cannot execute the command/query functions or helper functions and cannot mutate authoritative items, receipts, imports, assignees, dependencies, or controls. The service role receives execute only on the two public RPCs and has no direct DML grant on these tables. If legacy `tasks`, `epics`, task comment/activity, or handoff-ledger tables exist, their existing reads remain compatible while direct DML is revoked. No fabricated migration history or source lineage is introduced.

## Verification

Run the focused disposable PostgreSQL 16 harness:

```text
node scripts/legacyDeliveryAuthorityPostgres.mjs
```

CI must provide `LEGACY_DELIVERY_ACCEPTANCE_DATABASE_URL` pointing to `127.0.0.1` and database `avalaos_exhaustive`; missing CI configuration produces setup `BLOCKED` evidence. Local execution may start a task-named `postgres:16-alpine` container and verifies its removal. The harness applies the actual current migration chain and covers default-off behavior, exact source import, atomic receipt/audit/lineage, exact replay, changed-payload conflict, fresh-key and overlapping-source duplicate prevention, source drift, foreign scope and non-service denial, malicious later-item rollback, retention, hard-delete denial, forced-audit rollback, unchanged historical upgrade, exact reapply rejection, unsafe-history abort, exact marker advancement, and verified cleanup. The companion role-policy harness covers administrative equivalence, assignment authority, own-task limits, status and dependency policy, stale authorization, and revocation.

The latest focused run completed with two imported work items from one logical import, one receipt, one audit, exact replay with zero additional effect, duplicate/conflict/drift denials with zero additional effect, and one retained deletion transition with unchanged physical row count and lineage. The retained evidence writer binds those measured fields to `DELIVERY-007` and `DELIVERY-008`; command success alone is not evidence.

## Rollback and read-only fallback

This migration is forward-only because it creates immutable receipts, audits, import ancestry, and task versions. Do not delete or rewrite those rows. The safe fallback is to remove or set `legacy_delivery_workspace_controls.writes_enabled=false` for the affected workspace. New commands then fail before a receipt or domain effect; currently authorized exact committed retries remain recoverable after current scope checks. Query remains available for history and lineage. Schema correction requires another additive forward migration that preserves identifiers, receipts, audits, task versions, retention state, and source ancestry.
