# PR 1G Application Portfolio & AI-Assisted Modernization Assessment Architecture

Status: candidate implementation in one substantial PR. Scope is Avala Assess only.

## Decision Law

PR 1G extends Assess V2 with application portfolio assessment while preserving process-first evaluation. It does not change V1 score behaviour or score version `assess-core-2026-05`, PR 1D immutable decisions, PR 1E review/Govern/Studio handoff authority, or PR 1F economics authority. The model version is `assess-v2-application-portfolio-2026-07`.

The model never emits one opaque application score. It evaluates independent bands for integration accessibility, semantic/data clarity, state/execution, security/control readiness, architecture/changeability, UI automation readiness, AI-assisted engineering readiness, and evidence confidence. Economic priority is considered only after technical and governance hard gates pass and incompatible currencies are rejected.

## Server Authority, Inventory, Import, and Persistence

The candidate domain supports tenant/workspace-scoped application assets, metadata versions, process/application links, application dependencies, assessment versions, dimension results, modernization recommendations, review resolutions, portfolio snapshots, import receipts, and row outcomes. Import rejects malformed rows without defaulting Unknown values, uses actor-scoped idempotency with payload hash, returns exact replays, rejects changed-payload reuse, and never reports cross-tenant duplicate existence.

The additive PostgreSQL migration uses the accepted `capabilities(capability_key,module,description)` schema, creates composite tenant ancestry keys and foreign keys, enables and forces RLS on every new tenant table, grants authenticated SELECT only under RLS policies, revokes PUBLIC/anon table access, and keeps mutations behind a service-role-only RPC. Immutable triggers protect finalized metadata, assessment versions, dimension results, recommendations, review resolutions, portfolio snapshots, import receipts, and import row outcomes.

Typed Edge command support parses strict envelopes for `application.create`, `application.import`, `application.metadata.upsert`, `application.assessment.save`, `application.assessment.finalize`, `application.assessment.review.resolve`, `application.assessment.revision.start`, and `application.portfolio.snapshot.create`; it enforces fresh tenant authority, capabilities, authorization version, expected version, actor-scoped idempotency, payload hash, stable non-disclosing errors, and exact successful replay through the injected atomic persistence dependency.

## Dimensions and Dispositions

Every dimension returns a deterministic readiness band, evidence confidence, hard gates, evidence references, missing evidence, rationale, contradictions, remediation requirements, and what would change the result. Evidence confidence is claim-linked per dimension: empty evidence is insufficient; verified evidence must be current, independent, accepted, non-synthetic, and claim-linked; stale, contradicted, or synthetic-only evidence lowers confidence.

Dispositions include retain/monitor, native API/event enablement, API façade and semantic translation, event/CDC bridge, governed workflow/RPA bridge, governed UI/vision bridge, refactor, replatform, replace, controlled AI-assisted rebuild, consolidate, retire, insufficient evidence, and blocked prerequisite. UI-only or absent API defaults to blocked/insufficient evidence unless positive bridge evidence proves stable interface/control accessibility, deterministic error detection, reversibility/compensation, material-action approval, monitoring, and human ownership.

AI-assisted rebuild remains prohibited unless legal source rights, executable acceptance tests, reproducible build, controlled security review, human engineering ownership, controlled deployment, and rollback are evidenced and independently reviewed. Unsupported or old technology alone cannot create a rebuild decision.

## Process × Application and Portfolio Intelligence

The matrix links exact process, primitive, application, metadata version, assessment version, interaction, PR 1E/Govern state, and PR 1F economics reference/currency. It reports process automation suitability, application readiness, technical and governance blockers, recommended integration mode, modernization prerequisites, economics eligibility, and sequencing. A suitable process can remain blocked by a UI-only, batch-delayed, unsupported, or otherwise gated application.

Portfolio snapshots use deterministic graph processing: topological ordering, missing dependency detection, cross-tenant dependency rejection, cycle detection, hard-gate blocking, evidence-confidence qualification, compatible economics only, and no automatic roadmap approval.

## UI and Synthetic Fixture

The Avala Assess V2 workspace now renders an Application Portfolio workspace with inventory, manual creation, CSV/JSON import preparation, row-level import results, application details, metadata version display, process relationships, dependencies, seven dimensions, evidence confidence/missing evidence, Decision Pack recommendations, review lifecycle copy, Process × Application matrix, portfolio dispositions, dependency waves, filters, and an accessible summary.

The AP Invoice Exception fixture is clearly synthetic and demonstrates an API-ready application, a file/batch intake application, and a legacy UI-only application. Synthetic records are never represented as verified enterprise data.

## Explicit Limitations and Non-Claims

No live CMDB integration, live repository scanning, database/network scanning, autonomous code rewrite, autonomous modernization approval, deployment, scientific-validation claim, guaranteed ROI, guaranteed savings, buyer-readiness claim, or live/hosted validation is introduced.
