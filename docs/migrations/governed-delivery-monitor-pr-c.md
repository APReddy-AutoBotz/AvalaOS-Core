# Governed Delivery and Monitor PR C migration

Migration: `20260831062024_governed_delivery_monitor_pr_c.sql`

This additive, transactional migration establishes the PR C database authority for Studio-to-Delivery handoffs, manual planning packages, immutable Delivery item/package versions, independent review and approval, and immutable approved Monitor baselines. The three newly added workspace flags default to `false`; PR C also remains governed by the existing default-off `module_handoffs_enabled` flag. Existing Delivery identifiers, hashes, statuses, readable rows, and legacy Monitor rows are retained; legacy rows do not enter the `delivery-monitor-2` canonical Monitor projection.

## Service contract

- Mutation: `public.enterprise_delivery_monitor_command(p_command jsonb) returns jsonb`, executable only by `service_role`.
- Delivery read: `public.enterprise_delivery_workspace_projection(p_org uuid, p_workspace uuid, p_query jsonb default '{}'::jsonb) returns jsonb`.
- Monitor read: `public.enterprise_monitor_approved_baselines_projection(p_org uuid, p_workspace uuid, p_query jsonb default '{}'::jsonb) returns jsonb`.

The command accepts the actions `delivery.handoff.request`, `delivery.handoff.review.resolve`, `delivery.handoff.approval.resolve`, `delivery.handoff.withdraw`, `delivery.handoff.consume`, `delivery.package.create.manual`, `delivery.item.review`, `delivery.package.revision.commit`, `delivery.package.review.resolve`, `delivery.package.approval.resolve`, and `monitor.baseline.create`. Every mutation validates actor, tenant/workspace, exact authorization version, stable request identity, idempotency binding, execution token/fence, feature state, current aggregate/version selectors, package snapshot generation where applicable, and action-specific separation of duties. A cross-workspace handoff request requires current `delivery.handoff.request` authority in both the source and target workspaces before business binding or receipt creation. The command rechecks PR 1B command authority immediately before atomically committing the domain row, canonical receipt response, effect, and one sanitized privileged audit event.

Receipt identity excludes transport-only request IDs and per-attempt authorization versions while preserving them as immutable attempt evidence. First use of an idempotency key is transactionally serialized over organization, workspace, actor, action, and key. A concurrent waiter reselects the canonical committed response; changed business content conflicts, while equivalent business content with different transport metadata replays one receipt and one effect.

The Delivery projection keeps current-authority read eligibility separate from mutation eligibility. A current `delivery.handoff.request` holder may read only their own source-workspace outbox history; current `delivery.handoff.review`, `delivery.handoff.approve`, or `delivery.handoff.consume` holders may read target-workspace inbox history. Turning off `module_handoffs_enabled` or enabling global read-only maintenance removes every handoff action but does not hide already committed authorized history. `delivery.handoff.withdraw` is advertised only when the requestor still has current `delivery.handoff.request` authority and the workspace is writable with handoffs enabled. Handoff-only readers receive no package collection, Studio eligibility, baseline eligibility, raw hash, or server identity fields. Baseline-eligibility selection is independently bounded to 100 rows and continued with a tenant-bound `(updatedAt, workPackageId)` keyset cursor; the strict browser contract rejects an oversized page and exposes only selector-safe continuation metadata. Browser projection state is tagged to the exact actor, organization, and workspace scope and is unavailable on the first render after any of those dimensions changes, before passive effects can run.

Studio handoff requests are selector-only. PostgreSQL locks the approved Studio artifact/version/source package, derives the target workspace route policy, 24-hour expiry, exact bounded proposal items, and proposal/target hashes. Consume uses that immutable stored target; no browser-authored target content is accepted. A later approved Studio version can create a distinct handoff without mutating or relabeling an already consumed Delivery ancestry.

Monitor baseline creation is selector-only: `{ workPackageId, expectedPackageVersion, expectedPackageVersionId }`. PostgreSQL derives the current approval, accepted-set digest and count, relational item manifest, milestone/dependency/risk title arrays, and readiness (`not_ready` for planning-only; `review_required` otherwise). Browser-authored accepted sets or Monitor content are rejected.

Package review and approval bind the exact package version, version identifier, and package aggregate generation. Every item review advances that generation, so a review selector captured before any current-item decision becomes stale even when the package version itself has not changed. Item review is allowed only while `draft`; changes-requested writes an authoritative blocker and moves the package to `blocked`; only a new package revision resolves that blocker and returns the package to `draft`. Each revision creates a complete current-item snapshot, including unchanged carried items, and advances the generation once for that atomic snapshot. An actor who authored or made the current decision for any item in the snapshot cannot review or approve the package, and those actions are omitted from that actor's projection. Package approval and Monitor therefore bind one exact independently reviewed item snapshot.

The only public-safe command errors are:

- `ENTERPRISE_DELIVERY_IDEMPOTENCY_CONFLICT`
- `ENTERPRISE_DELIVERY_COMMAND_IN_PROGRESS`
- `ENTERPRISE_DELIVERY_PERMISSION_DENIED`
- `ENTERPRISE_DELIVERY_RESOURCE_UNAVAILABLE`
- `ENTERPRISE_DELIVERY_RESOURCE_STALE`
- `ENTERPRISE_DELIVERY_HANDOFF_STALE`
- `ENTERPRISE_DELIVERY_FEATURE_DISABLED`
- `ENTERPRISE_DELIVERY_READ_ONLY`
- `ENTERPRISE_DELIVERY_COMMAND_BLOCKED`

Other malformed content, duplicate selectors, parent/locator errors, constraint errors, and internal failures remain generic and must be collapsed by the Edge boundary.

## Acceptance and verification

The feature-owned checks are:

```powershell
node scripts/checkGovernedDeliveryMonitorPrCMigrationContract.mjs
$env:TRANSCRIPT_FLOW_PR_C_MIGRATION_DATABASE_URL='<disposable-postgresql-16-url>'
node scripts/testTranscriptFlowPrCPostgres.mjs
```

The PostgreSQL harness creates isolated temporary databases, covers fresh/exact/empty/populated/dirty migration paths, and always drops them in `finally`. It verifies default-off flags, legacy preservation, dirty-state atomic rejection, forced RLS and ACLs, composite scope FKs, authorization and non-disclosure, exact replay/changed binding, 1:1 receipt/effect/audit identity, server-derived handoffs and baselines, separation of duties, blocker resolution, full revision snapshots, package-generation staleness after item decisions, current-item actor exclusion from package review and approval, source currentness, immutable consumed ancestry, projection safety, concurrent one-winner/no-deadlock behavior, and rollback after committed PR C history. It additionally proves 100/1 keyset continuation over 101 eligible packages with no public hashes, denial before receipt when a cross-workspace requester lacks target membership, and two-session same-key equivalent replay with exactly one effect. The rollback scenario executes all 11 PR C actions twice: first with all four workspace flags disabled and then with those flags restored while global `read_only=true`. Both modes must reject before a receipt, attempt, effect, or audit row; package history, current-authority handoff outbox/inbox history, and Monitor baselines must remain readable through hash-free projections with no advertised actions. Every completed causal check emits a sanitized `PR_C_ASSERTION` record.

## Rollback and read-only fallback

This migration is forward-only because it creates immutable authority history and revokes legacy bypass RPCs. Do not delete or rewrite PR C rows. The safe operational fallback is to set `module_handoffs_enabled`, `direct_delivery_planning_enabled`, `delivery_item_review_enabled`, and `monitor_approved_baseline_enabled` to `false` for affected workspaces and, when a complete mutation stop is required, set Enterprise Intelligence runtime control to read-only. Either control suppresses the corresponding new handoff, manual-package, item/review/approval, and baseline mutations before receipts or effects. Global read-only suppresses every PR C action. Current-authority package, handoff outbox/inbox, and Monitor projections remain readable, action-free, and hash-free. A corrective forward migration is required for schema rollback; it must preserve all identifiers, hashes, receipts, effects, audit events, decisions, approvals, baselines, and relational manifests.

No hosted deployment, production, live telemetry, or readiness claim is made by this migration or its disposable PostgreSQL verification.
