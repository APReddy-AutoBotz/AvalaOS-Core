# AvalaOS Core Enterprise Roadmap

## Current Position

Historical M0–M5.7 and post-M5.7 milestone records remain accepted for the limited proof stated in their evidence. Source hardening through PR #204 is present on `main`. Those records do not establish a server-authoritative, tenant-safe pilot or production platform.

PR 1A is accepted through PR #206. PR #208 / PR 1C, PR #209 / PR 1D, PR #211 / PR 1E, and PR #212 / PR 1F are accepted; PR 1F post-merge verification is complete at main `480cc9b943e8b51b074873c20c2a9f30dc6521c2`.

## Active Sequence

| Order | Work | Entry gate | Exit meaning |
| --- | --- | --- | --- |
| 0 | P0 service-role Storage URL escape decision | Rebaseline accepted/merged; separate approval for deployment inventory | Unknown/deployed/not-deployed path resolved as required; readiness remains blocked until safe. |
| 1A | Platform Safety and Fail-Closed Runtime Foundation | Fresh current `main`; P0 decision first | Fail-closed modes and directly related P0/P1 safety controls. |
| 1B | Server-Authoritative Identity, RBAC, RLS, and Assess | PR 1A accepted | Fresh authorization, revocation, tenant-safe Assess persistence, server scoring parity, reproducible migrations. |
| 1C | Enterprise Assess UI Cutover, Govern Resolution, Studio Handoff | PR 1B accepted | Accessible enterprise journey with atomic Govern/handoff and no false success. |
| 1D | Avala Assess V2 Decision Intelligence Foundation | PR 1C accepted | Accepted immutable reviewer-ready V2 decision foundation. |
| 1E | V2 Governed Review, Approval and Studio Handoff | PR 1D accepted | Independent attestation, approval, action-specific Govern, and durable Studio source handoff. |
| 1F | V2 Economics and Calibration | Accepted and post-merge verified in PR #212 | Versioned economics, realized outcomes, Insufficient Data calibration reporting, and tenant/workspace portfolio dispositions. |
| 1G | Application Portfolio & AI-Assisted Modernization Assessment | PR 1F accepted | Candidate Avala Assess application inventory, deterministic modernization dimensions, process/application matrix, portfolio waves, and review lifecycle. |
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

## PR 1D Current Authority

PR 1D closure baseline `779a4801aa7c6660ad4581f8e334f5ad422519e7` remains retained and its decisions remain immutable.

### PR 1E Accepted Closure

PR #211 accepted V2 independent review and approval, action-specific Govern resolution, and durable Studio-source handoff. Accepted head `be502c9faf4f768d3a60e2f9debd5ffc40b6b66e` is contained in merge/main `d3074e5b99b3d40f33a472679b7a861bcac1700a`; post-merge verification is complete with zero unresolved review threads.

V1 `assess-core-2026-05` scoring is unchanged and PR 1D decisions remain immutable. No deployment or hosted/live validation occurred. PR 1F is accepted; PR 1G Application Portfolio Assessment is implemented as a candidate Assess extension; broader Studio/private-artifact work is not started.


## PR 1F Accepted Closure

PR #212 is accepted and post-merge verified at main `480cc9b943e8b51b074873c20c2a9f30dc6521c2`; exact-head and merge-triggered CI passed with zero unresolved threads. Calibration remains **Insufficient Data**. V1 scoring is unchanged, PR 1D decisions remain immutable, and PR 1E authority is unchanged. No deployment or hosted/live validation occurred. PR 1G Application Portfolio Assessment is implemented as a candidate Assess extension; broader Studio/private-artifact work is not started.
