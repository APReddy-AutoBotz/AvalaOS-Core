# PR 1G Application Portfolio & AI-Assisted Modernization Assessment Architecture

Status: accepted through merged PR #214 and corrective PR #215; post-merge verification executed. Scope is Avala Assess only.

## Decision Law

PR 1G extends Assess V2 with application portfolio assessment while preserving process-first evaluation. It does not change V1 score behaviour or score version `assess-core-2026-05`, PR 1D immutable decisions, PR 1E review/Govern/Studio handoff authority, or PR 1F economics authority. The model version is `assess-v2-application-portfolio-2026-07`.

The model never emits one opaque application score. It evaluates independent bands for integration accessibility, semantic/data clarity, state/execution, security/control readiness, architecture/changeability, UI automation readiness, AI-assisted engineering readiness, and evidence confidence. Economic priority is considered only after technical and governance hard gates pass and incompatible currencies are rejected.

## Server Authority, Inventory, Import, and Persistence

The accepted domain supports tenant/workspace-scoped application assets, metadata versions, process/application links, application dependencies, assessment versions, dimension results, modernization recommendations, review resolutions, portfolio snapshots, import receipts, and row outcomes. Import rejects malformed rows without defaulting Unknown values, uses actor-scoped idempotency with payload hash, returns exact replays, rejects changed-payload reuse, and never reports cross-tenant duplicate existence.

The original additive PostgreSQL migration plus the forward-only authority correction use the accepted `capabilities(capability_key,module,description)` schema, create composite tenant ancestry keys and foreign keys, enable and force RLS on every new tenant table, revoke PUBLIC/anon table access, and keep mutations behind a service-role-only RPC. Detailed inventory tables require `assess.applications.read`; the snapshot table requires `assess.applications.portfolio.read`. Neither direct table policies nor the security-definer projection may combine those read authorities. The authenticated projection is the only client-executable PR 1G function; the command and renamed compatibility entry points are service-role-only, while every internal helper and trigger function denies direct PUBLIC, anon, authenticated, and service-role execution. Immutable triggers protect finalized metadata, assessment versions, dimension results, recommendations, review resolutions, portfolio snapshots, import receipts, and import row outcomes.

Typed Edge command support parses strict envelopes for `application.create`, `application.import`, `application.metadata.upsert`, `application.assessment.save`, `application.assessment.finalize`, `application.assessment.review.resolve`, `application.assessment.revision.start`, and `application.portfolio.snapshot.create`; it enforces fresh tenant authority, capabilities, authorization version, expected version, actor-scoped idempotency, payload hash, stable non-disclosing errors, and exact successful replay through the injected atomic persistence dependency. Assessment saves validate actor authority before application-specific reads or locks and check an exact successful sanitized-payload replay before current-version validation.

Post-merge verification passed all 114 PostgreSQL 16 scenarios with 0 failures, including delegated-command, assessment-save, and snapshot cross-workspace receipt denial; same-workspace exact replay; authorization-before-receipt inspection; and assessment/snapshot concurrency. Semantic parity covered 13 fixtures and detected all 26 adversarial mutations; desktop/mobile browser verification passed; focused coverage is 96.53% lines, 80.46% branches, and 95.74% functions. The four late PR #214 findings are corrected and reconciled. Supabase smoke remained skipped only under the configured non-live condition. This evidence makes no deployment, hosted/live validation, production certification, or readiness claim, and no scoring formula, weight, threshold, or decision law changed.

Portfolio snapshot reads require `assess.applications.portfolio.read`. Creation of an immutable modernization snapshot is a distinct mutation requiring `assess.applications.portfolio.write`; neither general application read/write nor portfolio read grants snapshot mutation authority. Snapshot version is a stored relational value unique per organization/workspace. Allocation and expected-version validation occur under a transaction-scoped workspace advisory lock, and projections order by that authoritative version.

## Dimensions and Dispositions

Every dimension returns a deterministic readiness band, evidence confidence, hard gates, evidence references, missing evidence, rationale, contradictions, remediation requirements, and what would change the result. Evidence confidence is claim-linked per dimension: empty evidence is insufficient; verified evidence must be current, independent, accepted, non-synthetic, and claim-linked; stale, contradicted, or synthetic-only evidence lowers confidence.

Dispositions include retain/monitor, native API/event enablement, API façade and semantic translation, event/CDC bridge, governed workflow/RPA bridge, governed UI/vision bridge, refactor, replatform, replace, controlled AI-assisted rebuild, consolidate, retire, insufficient evidence, and blocked prerequisite. UI-only or absent API defaults to blocked/insufficient evidence unless positive bridge evidence proves stable interface/control accessibility, deterministic error detection, reversibility/compensation, material-action approval, monitoring, and human ownership.

AI-assisted rebuild remains prohibited unless legal source rights, executable acceptance tests, reproducible build, controlled security review, human engineering ownership, controlled deployment, and rollback are evidenced and independently reviewed. Unsupported or old technology alone cannot create a rebuild decision.

## Process × Application and Portfolio Intelligence

The matrix links exact process, primitive, application, metadata version, assessment version, interaction, PR 1E/Govern state, and PR 1F economics reference/currency. Process, primitive, case/version/decision ancestry and approved Govern resolution are derived from same-tenant committed records. Optional economics must resolve to the exact approved PR 1F successor version on the same case/decision/review ancestry; currency is derived from that version. Payload-authored Govern state, currency, or approval claims are not authority, and unverifiable legacy links remain durable but cannot project or qualify a portfolio. The matrix reports process automation suitability, application readiness, technical and governance blockers, recommended integration mode, modernization prerequisites, economics eligibility, and sequencing. A suitable process can remain blocked by a UI-only, batch-delayed, unsupported, or otherwise gated application.

Portfolio snapshots use deterministic graph processing: topological ordering, missing dependency detection, cross-tenant dependency rejection, cycle detection, hard-gate blocking, evidence-confidence qualification, compatible economics only, and no automatic roadmap approval.

## UI and Synthetic Fixture

The Avala Assess V2 workspace now renders an Application Portfolio workspace with inventory, explicit committed application selection, manual creation, CSV/JSON import preparation, row-level import results, application details, metadata version display, process relationships, dependencies, seven dimensions, evidence confidence/missing evidence, Decision Pack recommendations, review lifecycle copy, Process × Application matrix, portfolio dispositions, dependency waves, filters, and an accessible summary. Metadata, assessment, finalize, review, and revision actions remain scoped to the selected application, and lifecycle actions derive only from its single latest assessment row. Assessment saves advance from that application's latest committed assessment version; stale concurrent saves fail without optimistic success. A committed command followed by projection reload failure retains the committed resource, reports a distinct stale-projection state, blocks every mutation, and requires an explicit successful reload before further changes.

The AP Invoice Exception fixture is clearly synthetic and demonstrates an API-ready application, a file/batch intake application, and a legacy UI-only application. Synthetic records are never represented as verified enterprise data.

## Explicit Limitations and Non-Claims

No live CMDB integration, live repository scanning, database/network scanning, autonomous code rewrite, autonomous modernization approval, deployment, scientific-validation claim, guaranteed ROI, guaranteed savings, buyer-readiness claim, or live/hosted validation is introduced.
