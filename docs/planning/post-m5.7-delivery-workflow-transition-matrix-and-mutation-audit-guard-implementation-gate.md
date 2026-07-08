# Post-M5.7 Delivery Workflow Transition Matrix and Mutation Audit Guard Implementation Gate

## Purpose

Implement a source-level, product-grade delivery workflow transition matrix and mutation-audit guard layer after the accepted PR #198 product navigation stabilization and PR #199 product action-policy hardening.

This milestone moves delivery workflow mutations from permissive UI/provider behavior toward deterministic domain decisions. It does not create browser evidence, runtime evidence, workflow-status proof, DB/RLS proof, export evidence, hosted evidence, provider evidence, or readiness evidence.

## Controller and Subagent Boundary

The Codex controller owns final decisions, consolidation, file ownership, implementation scope, branch, commit, push, and draft PR. Subagents provided findings only.

Completed subagent workstreams:

| Workstream | Findings Applied |
| --- | --- |
| Delivery workflow architecture | Recommended a pure source-level workflow policy layer, fail-closed unknown statuses, provider enforcement, and no runtime/provider execution. |
| Transition matrix design | Recommended explicit task, project lifecycle, and sprint matrices with decision-pending treatment for skips, backward moves, reopens, and ambiguous terminal transitions. |
| Mutation audit and deletion boundary | Recommended source-level audit-envelope scaffolding, deletion denial for retained lineage/dependencies/terminal states, and no hard-delete claims. |
| Product action policy integration | Recommended preserving product-action policy as coarse attempt authority while adding a stricter delivery-domain guard layer. |
| Component affordance guard | Identified Delivery Pack export/download affordance risk and recommended blocked copy until a later approved export boundary. |
| Test and quality review | Recommended focused deterministic tests for matrix decisions, guard denials, audit sanitization, and product-action integration. |
| Proof-boundary review | Controller performed local proof-boundary review because subagents were limited to findings-only and no execution-proof work was approved. |

No subagent committed, pushed, opened a PR, approved readiness, executed browser/runtime/database/deployment/export/provider/workflow/assertion actions, or produced prohibited output.

## Source Implementation Scope

Implemented source-level changes:

- Added `services/deliveryWorkflowPolicy.ts` with deterministic transition decisions and assertion helpers.
- Added `services/deliveryWorkflowPolicy.test.ts` with focused matrix, guard, audit, and product-action integration coverage.
- Updated `services/productActionPolicy.ts` so delivery task/status mutations can be attempted by the correct existing delivery permissions before domain guards decide final eligibility.
- Updated `services/productActionPolicy.test.ts` to preserve the delivery attempt-authority behavior.
- Updated `components/delivery/DeliveryProvider.tsx` to apply delivery workflow guards before task, sprint, project lifecycle, reorder, sprint-assignment, and deletion mutations.
- Updated `App.tsx` to guard docs-to-delivery import before creating delivery work items or handoff lineage.
- Updated `components/delivery/DeliveryPackView.tsx` to block Markdown/JSON export/download affordances in this milestone.
- Updated static guardrail metadata and scanner token-boundary handling so verification does not classify line movement or the ordinary phrase `risk-mutation` as prohibited secret/AI-boundary behavior.

## Transition Matrix

The delivery workflow matrix is deterministic and fail-closed:

- Task status transitions allow declared forward and no-op transitions only.
- Unknown task statuses are blocked as unregistered.
- Skips, backward transitions, terminal reopen paths, and blocked-resume paths return `decision_pending` and require a later approved product decision.
- Task transitions into active work are dependency-gated.
- Project lifecycle transitions allow declared sequential forward movement, block unknown states, and keep skips/backward moves decision-pending.
- Sprint status transitions allow `Upcoming` to `Active` to `Completed`, block unknown states, and prevent more than one active sprint per project in source-level context.

## Mutation Audit Guard

The guard layer adds source-level audit scaffolding without claiming persisted audit completeness:

- Task mutations create sanitized audit activity summaries in the delivery provider.
- Audit envelopes exclude raw provider payloads, raw document content, secrets, storage objects, signed URLs, raw logs, and DB rows.
- Reorder is blocked for active or terminal tasks unless a later approved decision authorizes it.
- Sprint assignment is blocked for terminal tasks.
- Deletion is blocked for missing authority context, dependent tasks, child/subtasks, source lineage, handoff/evidence/doc-generation lineage, and terminal statuses.
- Docs-to-delivery import is blocked without actor, organization, project, document/generation context, or non-empty import batch.

Hard-delete replacement with durable soft-delete persistence remains out of scope for this milestone because it requires a separate data-contract and storage/DB boundary milestone.

## Delivery Pack Export Boundary

Delivery Pack Markdown and JSON download affordances are blocked in source UI copy for this milestone. No export/PDF/download artifact was generated, and no storage object or signed URL was created.

## Acceptance Criteria

- Deterministic delivery workflow transition matrix exists.
- Provider-level mutation guards apply before high-risk delivery mutations.
- Source-level mutation audit envelopes and activity summaries are sanitized.
- Deletion is blocked where lineage, dependency, child, or terminal retention concerns exist.
- Docs-to-delivery import is guarded before creating delivery work items.
- Delivery Pack download affordances are blocked pending a separate approved export boundary.
- Focused tests cover transition decisions, denial paths, audit sanitization, and product-action integration.
- Tracking docs record this as source-level hardening only.
- Draft PR only; no readiness domain is marked complete.

## Non-Readiness Statement

This milestone is not browser evidence, runtime evidence, route proof, DB/RLS evidence, tenant-isolation evidence, export/download evidence, hosted/deployment evidence, provider evidence, workflow execution proof, approval-workflow proof, real assertion evidence, production-readiness evidence, release-candidate evidence, buyer-readiness evidence, or compliance evidence.

## What Remains Unapproved

- Browser retry, browser launch, browser automation, screenshots, or browser artifacts.
- Runtime app launch or dev server startup.
- Export/PDF/download generation, storage objects, or signed URLs.
- Workflow/status execution as proof or approval workflow execution.
- DB/RLS/artifact/schema checks, SQL execution, migration execution, schema/policy dumps, or Supabase execution.
- Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, or live/local real assertions.
- Readiness evidence, readiness claims, readiness-domain completion, or next execution milestone start.

## Recommended Next Grouped Execution Milestones

1. Delivery workflow soft-delete and retained-lineage persistence gate.
2. Delivery workflow runtime observation AP decision gate.
3. Export/artifact storage reauthorization and UI affordance implementation gate.
4. DB/RLS tenant-isolation execution approval gate.
5. Hosted deployment and operational validation approval gate.
