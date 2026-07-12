# AvalaOS Core Enterprise Roadmap

## Current Position

Historical M0–M5.7 and post-M5.7 milestone records remain accepted for the limited proof stated in their evidence. Source hardening through PR #204 is present on `main`. Those records do not establish a server-authoritative, tenant-safe pilot or production platform.

PR 1A is accepted through PR #206. PR 1B is the active substantial vertical implementation boundary.

## Active Sequence

| Order | Work | Entry gate | Exit meaning |
| --- | --- | --- | --- |
| 0 | P0 service-role Storage URL escape decision | Rebaseline accepted/merged; separate approval for deployment inventory | Unknown/deployed/not-deployed path resolved as required; readiness remains blocked until safe. |
| 1A | Platform Safety and Fail-Closed Runtime Foundation | Fresh current `main`; P0 decision first | Fail-closed modes and directly related P0/P1 safety controls. |
| 1B | Server-Authoritative Identity, RBAC, RLS, and Assess | PR 1A accepted | Fresh authorization, revocation, tenant-safe Assess persistence, server scoring parity, reproducible migrations. |
| 1C | Enterprise Assess UI Cutover, Govern Resolution, Studio Handoff | PR 1B accepted | Accessible enterprise journey with atomic Govern/handoff and no false success. |
| 2 | Studio, documents, private artifacts | Workstream 1 accepted | Server-controlled documents, approval/versioning, private artifacts, scoped export/download. |
| 3 | Delivery and lineage | Workstream 2 contracts stable | Canonical import, lineage, idempotent handoff, workflow controls, audit, soft delete. |
| 4 | Monitor, Admin, Trust | Tenant-safe source domains exist | Server read models, administrative controls, entitlements, claim-safe evidence. |
| 5 | Shared quality infrastructure, if needed | Shared need affects at least two slices | Only shared CI/tooling that cannot live in a feature PR. |
| 6 | Deployment and pilot control | Selected pilot journey accepted | Promotion, observability, secrets, rollback, operator controls, controlled cutover. |

## PR Boundaries

- Each workstream uses one to three substantial vertical PRs only when security, schema, deployment, or rollback isolation requires it.
- Feature-specific quality, migration, security, accessibility, performance, evidence, and rollback remain in the implementation PR.
- Plan-only, evidence-only, reconciliation-only, routine post-merge, and closure-only PRs are prohibited.
- Workstream 5 is not a destination for deferred product quality.

## Readiness Boundary

No active roadmap item is pilot or production proof until its stated executed evidence passes. P0 was classified not deployed within the accepted PR 1A boundary; general hosted/deployment status remains unknown. Live infrastructure inspection or mutation requires separate explicit approval.

KlarityFlow Health, scoring changes, runtime agent execution, MCP/A2A controls, browser AI authority, and expansion into a Jira replacement remain out of scope.
