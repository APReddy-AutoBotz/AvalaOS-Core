# Post-M5.7 Delivery Workflow Soft-Delete and Retained-Lineage Persistence Guard Implementation Gate

## Purpose

Implement source-level delivery work item soft-delete and retained-lineage persistence guard behavior after the accepted PR #201 delivery workflow transition matrix and mutation-audit guard milestone.

This gate is source-level/local product-state hardening only. Persistence in this milestone means preserving deletion and retention state through the existing source model, provider state, adapter metadata path, and focused tests. It does not implement durable database persistence, Supabase authority-table promotion, RLS policy behavior, storage retention, hosted deployment behavior, production deletion, or production restore.

## Accepted Baseline

- PR #201 is closed and tagged.
- Accepted/head commit: `39cfe1595e1594bd3b3f6c87e6a04fd14aeddad3`.
- Merge commit: `c4cf71741082215ed5a8a626ebed7d0d8f47ed1c`.
- Current main/tag target baseline: `4084bfb5fec4b13290d99138012c74240f87eb24`.
- Tag: `avalaos-core-post-m5.7-delivery-workflow-transition-matrix-and-mutation-audit-guard-implementation-gate`.

## Controller/Subagent Operating Model

The controller owns architecture, implementation, docs, verification boundaries, branch, commit, push, draft PR, and final consolidation. Subagents produced static findings only and did not edit files, run browser/runtime/database/deployment/export/provider/workflow actions, commit, push, open PRs, or claim readiness.

## Subagent Workstreams Consolidated

| Workstream | Static Finding Summary | Controller Decision |
| --- | --- | --- |
| Soft-Delete Domain Architecture | Existing provider path hard-deleted via adapter after PR #201 guard approval; task type had no deletion/retention metadata. | Add explicit source-level task deletion state, mode, retention class, requested/deleted actor/time, reason, and restore eligibility fields. |
| Retained-Lineage | Hard-delete guard already blocked lineage, dependencies, children, and terminal states but did not persist retained state. | Keep hard-delete denial semantics and add a separate persistence decision that records retained state without physical deletion. |
| Delivery Provider and Adapter | Provider removed tasks from React state and adapter hard-deleted configured Supabase `tasks`; metadata round-trip did not preserve deletion fields. | Provider delete now saves updated task metadata/activity through `saveTask`; adapter metadata preserves deletion/retention fields. |
| UI Affordance and List Filtering | Active views used raw task arrays; UI copy said delete was permanent. | Filter inactive tasks from active dashboard, portfolio, My Work, Team, and Project execution views; keep Delivery Pack on full project task state; update task delete copy. |
| Audit and Activity | Deletion envelope builder existed but provider delete did not persist source activity. | Add source-level deletion persistence activity using sanitized summaries and retention metadata. |
| Product Action Policy Integration | Product action IDs already cover `project.task.delete`; lower delivery policy dependency checks would block retention recording if reused directly. | Preserve product-action attempt authority in App, then provider enforces delete permission and deterministic workflow persistence guard. |
| Test/Quality | Focused delivery workflow tests were needed; no package script existed for this file. | Add focused tests to `services/deliveryWorkflowPolicy.test.ts` and run direct TypeScript test command. |
| Proof/Boundary | Avoid durable DB, RLS, browser, runtime, export, hosted, provider, workflow-proof, or readiness language. | Evidence and docs state source-level only and preserve all unproven domains. |

## Source Implementation Summary

- Added task deletion/retention metadata fields to the source `Task` type.
- Added `filterActiveDeliveryTasks`, `getTaskDeletionState`, and active-state helpers.
- Added `resolveTaskDeletionPersistenceGuard` as the source-state delete request path while preserving `resolveTaskDeletionGuard` as the hard-delete gate.
- Added `applyTaskDeletionPersistenceState` to produce soft-deleted or retained task state without physical deletion.
- Added `buildTaskDeletionPersistenceActivity` for sanitized source activity.
- Updated provider delete handling to save deletion/retention state through `deliveryAdapter.saveTask` instead of calling `deliveryAdapter.deleteTask`.
- Updated adapter metadata mapping so deletion/retention fields round-trip through the existing source-level metadata path.
- Filtered inactive tasks from active planning/work views while keeping full task state available to the provider and Delivery Pack model.
- Updated task delete confirmation copy to describe removal from active delivery views rather than permanent deletion.

## Soft-Delete And Retention Model

- `active`: normal delivery task state.
- `soft_deleted`: clean delete request on a non-terminal task with no retained lineage, child, or dependency blockers. The task receives deletion metadata and is excluded from active delivery views.
- `retained`: delete request on a task requiring retained lineage because of source lineage, evidence/handoff references, child tasks, dependency usage, or terminal delivery status. The task receives retention metadata and is excluded from active delivery views, but it is not physically deleted.

## Retained-Lineage Rules

- Source lineage, handoff IDs, evidence refs, document generation refs, delivery pack refs, and terminal statuses trigger retained-lineage state.
- Child/subtask and dependency relationships trigger retained state rather than physical removal.
- Existing hard-delete denial behavior remains intact for direct hard-delete guard calls.
- Mutations, reorder, sprint movement, and repeated hard-delete attempts against soft-deleted or retained tasks fail closed unless a later approved milestone adds explicit restore/review behavior.
- Restore is not implemented in this gate. `restoreEligible` records source-level eligibility only for future approved work.

## Acceptance Criteria

- Clean delete requests become source-level soft-delete state, not physical deletion.
- Retained-lineage delete requests record retained source state and preserve lineage/evidence references.
- Dependencies, child tasks, and terminal tasks are retained instead of physically removed.
- Active delivery views exclude soft-deleted/retained tasks where active planning calculations are expected.
- Delivery Pack can still receive the full project task state for lineage review.
- Source-level activity records soft-delete/retention decisions without raw provider payloads, prompts, secrets, or document bodies.
- Focused tests cover soft-delete, retained-lineage, active mutation blocking, and sanitized activity.

## Non-Readiness Statement

This gate is not browser evidence, runtime evidence, DB evidence, RLS evidence, tenant-isolation evidence, export/download evidence, storage evidence, hosted/deployment evidence, provider evidence, workflow execution proof, production deletion/restore proof, durable persistence proof, compliance retention proof, readiness evidence, a readiness claim, readiness-domain completion, or a next execution milestone.

## Proof Boundary

No browser retry, browser launch, browser automation, screenshots, runtime app launch, dev server startup, export/PDF/download generation, storage object creation, signed URL generation, workflow/status execution as proof, approval workflow execution as proof, DB/RLS/artifact/schema checks, artifact SELECT checks, tenant-isolation checks, SQL execution, migration execution, schema/policy dump, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, live/local real assertions, readiness evidence, readiness claims, readiness-domain completion, durable DB persistence claim, compliance retention claim, or next execution milestone was approved or performed.