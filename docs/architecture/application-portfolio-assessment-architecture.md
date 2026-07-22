# PR 1G Application Portfolio & AI-Assisted Modernization Assessment Architecture

Status: candidate implementation in one substantial PR. Scope is Avala Assess only.

## Decision Law

PR 1G extends Assess V2 with application portfolio assessment while preserving process-first evaluation. It does not change V1 score behaviour or score version `assess-core-2026-05`, PR 1D immutable decisions, PR 1E review/Govern/Studio handoff authority, or PR 1F economics authority. The model version is `assess-v2-application-portfolio-2026-07`.

The model never emits one opaque application score. It evaluates independent bands for integration accessibility, semantic/data clarity, state/execution, security/control readiness, architecture/changeability, UI automation readiness, AI-assisted engineering readiness, and evidence confidence. Economic priority is considered only after hard gates pass and incompatible currencies are rejected.

## Inventory, Import, and Persistence

The candidate domain supports tenant/workspace-scoped application assets, metadata versions, process/application links, application dependencies, assessment versions, dimension results, modernization recommendations, review resolutions, portfolio snapshots, import receipts, and row outcomes. Import rejects malformed rows without defaulting Unknown values. Duplicate detection is scoped to the provided workspace collection and row outcomes use stable non-disclosing errors.

The additive PostgreSQL migration creates typed capabilities for `assess.applications.*`, normalized tenant tables, forced RLS on each table, and a service-role-only private command RPC placeholder for future server implementation. Private mutation RPCs are not granted to browser roles.

## Dimensions and Dispositions

Every dimension returns a deterministic readiness band, evidence confidence, hard gates, evidence references, missing evidence, rationale, contradictions, remediation requirements, and what would change the result. Dispositions include retain/monitor, native API/event enablement, API façade and semantic translation, event/CDC bridge, governed workflow/RPA bridge, governed UI/vision bridge, refactor, replatform, replace, controlled AI-assisted rebuild, consolidate, retire, and insufficient evidence.

AI-assisted rebuild remains prohibited unless legal source access, human engineering ownership, executable acceptance tests, reproducible build, controlled security review, controlled deployment, and rollback are evidenced and independently reviewed. PR 1G does not implement autonomous source rewriting or deployment.

## Process × Application and Portfolio Intelligence

The matrix links process primitives to applications and reports process automation suitability, application readiness, technical and governance blockers, recommended integration mode, modernization prerequisites, evidence confidence, economics reference, and sequencing. Required behavior is explicit: a suitable process can remain blocked by a UI-only, batch-delayed, unsupported, or otherwise gated application.

Portfolio snapshots expose deterministic dispositions and proposed waves ordered by hard gates, dependency order, process blocking impact, criticality, evidence confidence, and compatible approved economics when available. Roadmaps are never approved automatically.

## Review Lifecycle

The lifecycle is `draft -> reviewer_ready -> approved | changes_requested | rejected -> superseded`. Reviewer and author must differ. Material decisions require independent human review: rebuild, replace, retire, consolidation, high criticality, regulated data, UI/vision bridge for material actions, and high-risk integration changes. Changes requested require a new immutable assessment version.

## Explicit Limitations and Non-Claims

No live CMDB integration, live repository scanning, database/network scanning, autonomous code rewrite, autonomous modernization approval, deployment, scientific-validation claim, guaranteed ROI, guaranteed savings, buyer-readiness claim, or live/hosted validation is introduced.
