# AvalaOS Core Current-To-Target Enterprise Architecture

## Governed multi-source transcript PR A accepted architecture

PR #255, accepted final head `460c44864b9d240321e727945411ced51dd0fe30` and merge `11e670003a73b0ab5a28650b70afac4b267760f4`, introduces a server-authoritative chain: immutable source versions -> independently versioned ordered Assess source sets -> locked exact input-bundle versions -> extraction jobs and per-source bindings -> strictly staged grounded candidates -> the real preview-batch identity -> human review/conflict resolution -> one atomic Assess draft version. Every command and projection carries the exact historical selector it acts on; a root's current version is never substituted for the selected source-set, bundle, job, binding, candidate, preview, or draft lineage. Candidate Review and counts are therefore scoped through the exact extraction binding rather than through a reusable source ID.

Composite tenant/workspace foreign keys, forced RLS, service-only mutation RPCs, mandatory real pre-claim request binding, non-disclosing authorization, exact receipt bindings, fenced budget states, and default-off feature controls preserve authority. `transcript.sources.read` exposes only source/source-set/input-bundle projections; candidates, values, relationships, previews, conflicts, applications, runs, journeys, and mixed staleness selectors require `assess.v2.read`. A new source-set version stales only unconsumed dependant bundles, runs, and previews; committed applications and consumed history remain immutable and readable. The browser receives safe selectors and minimized capability-scoped projections only, resets stale local selection state when lineage or authority changes, and preserves the legacy single-source Candidate Review when the multi-source feature has never been activated. Existing scoring and approved Assess decisions remain immutable. Shared-gateway Studio adoption, optional module handoffs, Delivery, and Monitor changes remain PR B/PR C scope.

Rollback disables transcript source-set/extraction/apply mutations and unified gateway routes while preserving sources, versions, exact lineage, candidates, conflicts, receipts, budget history, consumed history, and Assess ancestry read-only for additive forward repair. It does not restore browser AI, browser secrets, current-root substitution, or silent fallback.

## Governed multi-source transcript PR B target architecture

PR B generalizes the accepted Studio aggregate through an immutable exclusive-union source package: exact Assess handoff, exact locked Studio transcript bundle, the two combined, or a bounded manual brief. Assess and Studio source sets remain separately versioned even when they deliberately reuse one immutable source version. Existing canonical artifacts are backfilled only from their already-proven Assess ancestry; artifact IDs, versions, approvals, content hashes, approved pointers, and private renditions are not rewritten.

Optional Assess-to-Studio transfer is a separate request, target review, approval when policy requires it, and one-time consumption boundary. Eligibility or request creates no document. Rejected, withdrawn, stale, unauthorized, wrong-workspace, or changed-lineage handoffs cannot create a source package or provider effect. Direct Studio packages remain durably `not_assessed` and `planning_only`; until PR C is separately authorized they fail closed at the existing Delivery handoff boundary.

The target consumption transaction serializes against the exact upstream Assess case and rechecks currentness after locking it. Studio citation authority is manifest membership, not syntactic validity: transcript citations bind the accepted extraction/candidate manifest and Assess citations bind an immutable server-hashed case-version anchor manifest. Deliberately shared hybrid sources are de-duplicated before coverage cardinality checks, and soft-deleted sources remain visible through their immutable package ancestry while becoming unavailable for new selection.

Tenant templates have immutable versions and independent review/approval. Only an exact current approved system or tenant template version may govern generation. Templates describe bounded document structure only and cannot supply provider endpoints, secrets, headers, tools, system instructions, policy, or approval authority. Studio generation uses the accepted unified six-provider server gateway, atomic budget reservation, framed untrusted source/template data, strict model/usage/output validation, durable staging, execution fencing, and response-loss reconciliation. Each artifact version binds its exact source package and template so late provider completion or later source/template changes cannot move a human-edited, reviewed, or approved head.

Reservation state remains authoritative across lease expiry. `reserved`, `uncertain`, and `settled` work can enter reconciliation but cannot reacquire provider-effect authority; only an explicitly and atomically transferred pre-effect `released` reservation may receive a new fence.

## Governed Delivery and Monitor PR C target architecture

PR C extends the accepted PR B chain without weakening it. A Delivery source package is an immutable exclusive union: either an exact accepted Studio-to-Delivery handoff with the selected Studio artifact, artifact version, source package, template version, server-derived hashes, and inherited lineage classification, or an explicitly manual package with no fabricated Assess or Studio ancestry and durable `not_assessed` / `planning_only` labels. Handoff eligibility and request create no Delivery resource. Target review and approval, current server authorization, exact source currentness, route policy, and one-time consumption precede target creation. Hashes and raw source-package identities remain server-side verification fields and are omitted from browser-safe projections.

Delivery work is version authority, not a mutable task board. Stable logical item aggregates point to immutable item versions; edits create descendants; accept and reject decisions record an explicit human rationale; package review and approval bind the exact current package version, canonical accepted-item set, server-derived hashes, and independent actors. Rejected, unresolved, historical, superseded, stale, blocked, foreign, duplicate, or cross-package item identities cannot enter the approved set. Public Delivery DTOs expose only safe selectors, lifecycle labels, counts, citations, and bounded history; they do not expose those hashes or raw authority identities.

A reviewer-blocked package is recoverable only from the production Delivery workspace and only after the client has loaded the complete bounded current descendant projection. The revision request binds the exact package aggregate generation, package version/version ID, and every current descendant aggregate/version selector, while authored values are allowed only for explicitly selected descendants. PostgreSQL locks and re-derives that complete set, rejects partial knowledge, stale/foreign selectors, unchanged selected content, replay substitution, and mixed-validity batches atomically, then creates one immutable package version with fresh descendants. The Edge result boundary independently requires one unique new item-version identity per expected descendant and rejects reuse of any predecessor item-version identity anywhere in the complete set. The resulting draft must repeat item decisions, independent package review, and independent package approval; Monitor remains bound to the prior approved baseline until that sequence completes.

Monitor receives only a server-derived immutable baseline for the exact approved current Delivery package version and its exact accepted item-version manifest with zero authoritative blockers. Baseline creation accepts only the safe package/version selectors; PostgreSQL derives the approval, accepted set, relational manifest, counts, and internal digests. The Enterprise surface and primary Monitor surface consume one minimized safe projection with the same baseline ID, version, status, accepted count/type counts, and lineage labels, while hashes and approval/source identities remain browser-hidden. Exact hash binding is PostgreSQL evidence, not a browser observation. Monitor adds no authoring, task mutation, completion inference, due dates, upload, execution, or live telemetry authority; legacy operational project/task state is separate and non-authoritative.

All new mutations are default off and service-only. Composite tenant/workspace relationships, forced RLS, transaction-local authorization-version rechecks, actor-scoped exact receipts, execution fences, canonical SQL-result propagation, one global lock order, safe cursor-bounded projections, and non-disclosing errors govern the boundary. Current actor/source/target authority and structural binding are revalidated before any receipt is disclosed. An exactly bound committed result is then replayed before mutable feature and global read-only gates; those gates still reject every new effect before a new receipt. Rollback sets `module_handoffs_enabled`, `direct_delivery_planning_enabled`, `delivery_item_review_enabled`, and `monitor_approved_baseline_enabled` false, disabling new handoff, manual creation, item decisions/revisions, package approvals, and baseline creation while retaining authorized exact replay, committed history, and both legacy and v2 safe projections for additive forward fixes.

The browser treats organization, workspace, and authenticated actor as one presentation-security scope. A scope change synchronously replaces the Enterprise Intelligence workbench so raw BYOK input, private-file bytes, provider/source/route selectors, candidate and draft selections, previews, pending confirmations, status, and errors cannot render or remain actionable in the replacement scope. Every asynchronous continuation, including file reads and mutation finalizers, is fenced to the exact captured scope and epoch. Requested, outer, and nested Delivery/Monitor organization/workspace identities must agree under case-insensitive UUID semantics before a projection can enter browser state. Candidate evidence follows the same anti-substitution rule: the runner derives one execution identity from the actual GitHub or explicit local environment and binds it into the manifest, command results, every assertion, and every `not_run` record; local evidence is never promotable to hosted proof, and any base-tracked deletion or rename fails evidence-scope collection closed rather than disappearing from source provenance.

## Studio PR B accepted architecture

PR #217 plus corrective PR #218 establish a server-authoritative database claim -> deterministic renderer -> private create-only object -> verified completion saga on verified main baseline `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`. Browsers receive only tenant-scoped projections and binary broker responses; they never receive storage coordinates or mutation authority. Retention and legal-hold state are rechecked before a separate-human deletion approval can claim physical deletion. Canonical metadata and tombstones are never hard deleted.

## Studio PR A authority

PR 1G remains accepted. Studio PR A adds a server-authoritative aggregate and append-only structured-JSON version boundary over exact accepted PR 1E ancestry, with durable staged provider attempts, human revision, independent review, separate approval, and atomic supersession. Provider execution is an external effect, not cross-system atomic. Legacy `document_generations` is unverified and excluded. Those private-storage, rendition, brokered-download, retention, legal-hold, and deletion concerns remain outside PR A and are addressed by the accepted Studio PR B boundary above. Safe rollback disables mutations and provider generation while preserving read-only committed records for additive forward repair.


Baseline: accepted source/CI `main` at `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`
Status: Studio PR B accepted through PR #217 and corrective PR #218; hosted and deployment validation remain unproven

## Current Architecture

AvalaOS Core is a React/Vite TypeScript application with deterministic scoring, browser-side domain services, demo adapters, partial Supabase adapters, Supabase migration sources, and Edge Function sources for AI, extraction, export, storage, and provider governance.

The current browser is both presentation layer and, in several flows, effective policy and workflow authority:

```text
Browser UI
  ├─ demo/Supabase identity mapping
  ├─ client action and route policies
  ├─ client deterministic scoring
  ├─ direct Supabase table mutations
  ├─ local/mock fallback and transient state
  └─ selected Edge AI/export calls

Supabase
  ├─ partial canonical migration chain
  ├─ additional legacy SQL contracts under docs/schema
  ├─ incomplete enterprise RLS proof
  └─ Edge helpers using service-role authority
```

Material current boundaries are source-validated in the active risk register. They include demo-persona permission inheritance for matching Supabase emails, missing-config mock fallback, client policy authority, incomplete export authorization, service-role URL construction, best-effort audit, non-atomic persistence/UI transitions, and an unreconciled migration authority split.

Provider-governance code is stronger than the general application path: it checks active membership and fails closed when allowed-operation audit persistence fails. That control is not yet a uniform platform authorization layer.

## PR 1A Candidate Transition

PR 1A implements the first target slice without claiming the later server-authoritative platform is complete:

- exact explicit runtime modes with no implicit pilot/production fallback;
- server-required pilot/production data and AI paths, without demo-persona authorization or browser provider authority;
- server-derived allowlisted Storage authority and authenticated export checks before service-role operations;
- required AI audit persistence that fails closed;
- structural sanitization at the three validated rich-content sinks and durable-persistence-before-success UI behavior; and
- a minimum canonical AI-audit migration with isolated fresh and supported-upgrade execution.

This is branch evidence pending acceptance. It does not complete PR 1B identity/RBAC/RLS/Assess, prove tenant isolation, or establish a deployed environment.

## Target Architecture

PR 1B implements the accepted server identity/RBAC/RLS and typed Assess authority. The PR 1C candidate adds the enterprise browser projection, Govern resolution, and atomic Studio handoff; hosted/deployed behavior remains unproven and out of scope.

```text
Browser projection
  │ authenticated request + command envelope
  ▼
Edge/API transport router
  │ typed dispatch only
  ▼
Command/query handler
  ├─ validate schema and stable error contract
  ├─ resolve fresh server identity
  ├─ revalidate tenant/workspace/resource authority
  ├─ check authorization version and revocation
  ├─ enforce deterministic domain policy
  ├─ enforce idempotency and expected version
  └─ execute one transaction
       ├─ domain state
       ├─ immutable audit/evidence reference
       └─ outbox/invalidation record when required
  │ sanitized non-disclosing result
  ▼
Browser state projection
```

### Trust boundaries

- The browser is untrusted input and a presentation projection.
- Server handlers are the authority for identity, permissions, tenant/workspace scope, lifecycle transitions, exports, and handoffs.
- PostgreSQL constraints, RLS, and transaction boundaries provide defense in depth; service-role access never substitutes for application authorization.
- Storage bucket and object authority is derived server-side from an allowlist and verified tenant context. User-controlled bucket names never enter privileged URLs.
- AI may draft or transform content but cannot determine scores, risk gates, approvals, or regulated decisions.

### Runtime modes

| Mode | Permitted authority |
| --- | --- |
| `local_demo` | Explicit demo identities, local/mock persistence, and labeled demo behavior. |
| `automated_test` | Deterministic fixtures and fakes scoped to tests. |
| `pilot` | Server configuration, identity, authorization, persistence, AI, audit, and storage required; missing authority fails closed. |
| `production` | Pilot controls plus production promotion, observability, secrets, rollback, and operator controls. |

There is no implicit mode. Pilot and production cannot fall back to demo identity, mock data, browser AI, local downloads, or success UI after failed persistence.

## Identity, Tenant, And Revocation Model

- Server identity begins with a validated session user ID.
- Active organization membership, tenant role grants, normalized permissions, workspace access, and resource ownership are loaded or revalidated for every privileged request.
- `TenantContext` is returned for UI projection with an `authorizationVersion`; it is not accepted as authorization evidence.
- Membership, role, permission, module, and workspace changes increment the authorization version and invalidate affected caches.
- Server mutations always perform an authoritative lookup inside the request/transaction. Cache is an optimization only.
- Revocation denies the next request. Stale TenantContext, stale sessions, email matching, client role claims, hidden controls, and routes cannot retain access.
- Queries and errors use stable non-disclosing results so cross-tenant resource existence, list sizes, and counts are not leaked.

## Assess Command Boundary

`assess-command` may be one Edge entry point but contains no domain workflow. It dispatches to typed handlers such as:

- `assessment.create`
- `assessment.response.upsert`
- `assessment.finalize`
- `govern.resolve`
- `studio_handoff.create`

Every handler owns validation, fresh authorization, expected-version and idempotency checks, deterministic policy, transaction boundaries, audit, and stable errors. State and required audit commit atomically. Denied-attempt telemetry may be best effort only when the denial itself remains fail closed.

Scoring remains deterministic and versioned. PR 1B proves server parity against the existing regression corpus before browser cutover.

## Data And Migration Authority

- `supabase/migrations/` is the only canonical ordered migration chain.
- `docs/schema/` is a legacy design and historical operational reference until required contracts are reconciled into canonical migrations.
- Fresh database, supported upgrade path, policy/RLS assertions, and failure/rollback behavior are CI gates for schema-changing PRs.
- PR 1A supplies those executed gates for its minimum AI-audit migration only; broader runtime schema and two-tenant RLS proof remain PR 1B work.
- Production rollback is normally flag disablement, read-only maintenance, or forward migration. Destructive down-migrations are not the default.

## Audit And Evidence

- Privileged state changes and their audit records commit atomically.
- Audit failure blocks the privileged change unless an explicitly documented low-risk telemetry event is best effort.
- Audit events use request/correlation IDs, actor and tenant references, action, resource reference, outcome, version, and sanitized metadata.
- Evidence records distinguish source inspection, executed tests, deployment status, planned checks, blocked checks, and unknowns.
- Secrets, raw logs, signed URLs, customer content, object identifiers, and production infrastructure identifiers are prohibited evidence.

## UI And Failure States

Enterprise UI must represent loading, empty, error, offline, stale, revoked, blocked, read-only maintenance, and expired-session states. It must not silently substitute demo data or transition to a success surface before durable server confirmation.

## Transition Boundaries

| PR | Architecture transition | Rollback boundary |
| --- | --- | --- |
| 1A | Fail-closed runtime and P0/P1 platform safety | Endpoint disablement and reversal of non-security refactors; never restore vulnerable behavior. |
| 1B | Server identity/RBAC/RLS and Assess command authority | Disable enterprise commands or enter read-only mode; preserve data/audit; forward-fix migrations. |
| 1C | Enterprise Assess UI, Govern resolution, atomic Studio handoff | Disable cutover/handoff flags and use read-only maintenance; never fall back to demo authority. |

Later Studio, Delivery, Monitor/Admin, and deployment work builds only on accepted Workstream 1 contracts.

## PR 1D Current Authority

PR 1E extends the immutable PR 1D decision boundary with append-only review assignments, exact evidence/claim attestations, review resolutions, action-specific Govern resolutions, and durable Studio source packages. All mutation RPCs are private to `service_role`; authenticated users receive tenant-scoped read projections only. Fresh authorization, separation of duty, expected versions, actor-scoped idempotency, and one state/receipt/audit transaction remain mandatory. The browser is never authority, and no runtime agent execution or private artifact storage is introduced.

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

PR 1D adds separate V2 case-authoring, decision-intelligence, command-authority, and read-projection bounded contexts. The detailed target is routed through [Assess V2 Decision Intelligence Architecture](assess-v2-decision-intelligence-architecture.md).


## PR 1F active candidate

PR 1F adds versioned Assess V2 economics, deterministic scenario formulas, independent economic review, append-only realized outcomes, transparent calibration reporting with **Insufficient Data** status, and tenant/workspace portfolio dispositions. It preserves V1 scoring, PR 1D decision immutability, PR 1E review/Govern/Studio handoff authority, and the sequence PR 1F -> PR 1G Application Portfolio & AI-Assisted Modernization Assessment -> broader Studio/private-artifact work.
# V1 RC composition boundary

Draft PR #225 composes the existing server-authoritative module contracts through the canonical AP Invoice Exception lineage. The Admin RC surface and evidence manifest are read-only projections: neither may mint canonical IDs, scores, approvals, hashes, provider authority, or release truth. Enterprise Intelligence/BYOK and Trust Assurance participate only as governed control/evidence surfaces. Exact release identity comes from the build commit and workflow artifact; browser state is never authoritative. Rollback remains global maintenance/read-only or server-side feature disablement with immutable history preserved. Assemble runtime remains out of scope.
