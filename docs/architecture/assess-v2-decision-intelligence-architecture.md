# Avala Assess V2 Decision Intelligence Architecture

Status: PR 1D target and implementation contract

Baseline: PR #208 / PR 1C merged at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`

## Purpose

Avala Assess V2 is an additive decision-intelligence boundary. It decomposes a process into primitives, evaluates compatible solution components and application interactions independently, and produces a governed hybrid operating model. It does not replace or reinterpret historical V1 assessments.

V1 `assess-core-2026-05` remains a legacy deterministic heuristic with unchanged formulas, weights, thresholds, hard stops, recommendation behavior, records, Govern provenance, and Studio lineage. A V1 assessment enters V2 only through an explicit clone whose imported facts are unverified source information.

## Bounded Contexts

1. **V1 compatibility** owns historical V1 scoring, records, Govern provenance, Studio handoffs, and buyer-safe legacy presentation.
2. **V2 case authoring** owns cases, immutable authoring versions, primitives and graph edges, decisions and exceptions, application assets and interactions, evidence links, and assumptions.
3. **V2 decision intelligence** owns the versioned field/rule registry, deterministic categorical evaluation, evidence-derived confidence, component composition, action controls, application readiness, and modernization dispositions.
4. **V2 command authority** owns typed create, V1 clone, draft upsert, and finalize commands. It reuses accepted tenant authority but independently validates, authorizes, versions, transacts, audits, and sanitizes each command.
5. **V2 read projection** owns capability-scoped authoring views and the finalized read-only executive Decision Pack.

PR 1D finalization ends in `reviewer_ready`. V2 approval, Govern resolution, Studio handoff, export, and external sharing are reserved for later approved work.

## Trust And Request Boundary

```text
Untrusted browser projection
  -> assess-v2-command transport
  -> exact typed V2 handler
  -> fresh caller identity and tenant/workspace authority
  -> resource ancestry, capability, authorization-version check
  -> actor-scoped idempotency and expected-version check
  -> deterministic V2 evaluation over locked server facts
  -> one atomic state + immutable snapshot + receipt + audit transaction
  -> stable sanitized response
  -> read-only browser decision projection
```

The browser never supplies authority-bearing decisions or hashes and never reruns final deterministic rules. Service-role database access is transport privilege, not application authorization. Every private mutation RPC independently revalidates active actor, organization, workspace, capability, authorization version, and resource ancestry inside the transaction.

## Durable Model

The canonical migration adds separate normalized `assess_v2_*` relations. It does not add V2 rows to the V1 `assessments` table and performs no V1 backfill.

- `assess_v2_cases`: organization/workspace/process ancestry, optional V1 source, owner, lifecycle, optimistic version, schema/rule-set identity, and soft-deletion state.
- `assess_v2_case_versions`: immutable authoring revisions and clone provenance.
- Version-owned primitives, edges, decision points, exception paths, application assets, application interactions, and evidence links.
- `assess_v2_decision_versions`: immutable source-version ancestry, schema/rule/decision versions, canonical input/evidence/output snapshots, SHA-256 references, supersession, validation status, actor/time, and explicit non-claims.

Every child relation carries organization, workspace, and case ancestry with composite constraints. Authenticated clients receive tenant-scoped read projection only. `PUBLIC`, `anon`, and `authenticated` cannot execute private mutation RPCs or directly mutate V2 relations. RLS is enabled and forced.

Draft upsert creates a new immutable case version and atomically advances the case head. Finalize locks the exact source version and appends one immutable decision version. Update or deletion of finalized decisions, snapshots, or hash references is prohibited.

## Deterministic Decision Layers

The V2 rule set evaluates independent layers and never collapses them into one whole-process winner:

1. evidence confidence;
2. process readiness and business disposition;
3. candidate eligibility per primitive;
4. component fit per primitive;
5. application read, write, event, UI, and operational readiness;
6. action-specific risk, autonomy, controls, and required approval;
7. application modernization disposition; and
8. least-complex composed operating model.

Business value and evidence confidence cannot increase technical fit. Data sensitivity changes controls, not data quality. Mandatory human approval changes the action boundary, not component suitability. API facts and UI/RPA facts remain separate. Modernization never derives solely from agent readiness.

A bounded agent is ineligible unless irreducible ambiguity, adaptive next-step selection, tool/path selection, incremental value beyond simpler components, and controllability are all evidenced. Extraction, summarization, retrieval, or drafting alone cannot satisfy this gate.

## Rule And Evidence Registry

Every decision-relevant field declares a stable field ID, decision use, decision layer, unit, polarity, candidate impacts, applicability, evidence requirement, and stable rule IDs. Contract validation rejects missing registry coverage, unknown fields, duplicate IDs, incompatible units, inapplicable conditional evaluation, context-only decision effects, and template suggestions treated as verified evidence.

Claim-level confidence is derived from exact evidence coverage, source type, freshness, owner, validation, corroboration, reviewer completion, stakeholder diversity, contradictions, and unresolved assumptions. The buyer-facing bands are `Verified`, `Partially Evidenced`, `Assumption-Led`, and `Insufficient Evidence`. Confidence qualifies conclusions and never adds fit points.

Template and V1-import values begin as suggested/unverified with `validated = false`. Unknown values remain unknown; missing evidence never receives an optimistic default.

## Canonical Snapshots And Hashes

The server generates input, evidence, and output snapshots from the same locked normalized facts used by the deterministic evaluator. Canonicalization has an explicit version and stable object-key, array-order, number, Unicode, and null rules. Each digest is domain-separated and binds tenant, workspace, case, source version, schema version, rule-set version, and decision version.

SHA-256 references prove deterministic snapshot integrity only. They do not prove truth, authorship, evidence quality, scientific calibration, buyer approval, or deployment readiness. Historical V1 `sha-lite` identifiers remain legacy correlation references and are never promoted to cryptographic evidence.

## Commands And Capabilities

PR 1D supports only:

- `assessment_v2.create`
- `assessment_v2.clone_from_v1`
- `assessment_v2.draft.upsert`
- `assessment_v2.finalize`

The corresponding capabilities are read, create, clone, draft-write, and finalize capabilities scoped to Assess V2. Every envelope and nested payload rejects unknown keys and enforces bounded types, enums, lengths, counts, units, and conditional applicability.

Identical actor-scoped idempotent retries return the same committed response. Reusing a key with a different canonical payload conflicts. Concurrent distinct keys at one expected version produce one commit and one version conflict. Any required receipt, decision snapshot, hash, or audit failure rolls back the complete command.

## V1 Clone Boundary

Clone requires V2 create/clone authority plus readable same-tenant V1 ancestry. The source must be active, non-deleted, and use `assess-core-2026-05`. The server copies only allowlisted values as unverified source facts or assumptions, records the source assessment and score version, and never mutates the V1 row, Govern provenance, Studio handoff, score, or version.

V1 and V2 IDs, commands, persistence, outputs, and lifecycle states are not interchangeable. Existing V1 Govern and Studio handlers cannot accept V2 cases.

## Application Interaction And Modernization

Each application/primitive/operation/mode interaction records interface, identity, least privilege, data, transaction, concurrency, idempotency, compensation, audit, errors, capacity, event, testing, monitoring, support, change, and lifecycle facts. Each action is independently classified as allowed, approval-bound, evidence-bound, or prohibited.

Modernization is evaluated separately and may compose `Retain + Native Integration`, `API Facade`, `Semantic Bridge`, `Event Bridge`, or a bounded temporary RPA bridge. Weak autonomous-write readiness never automatically means replace or rebuild.

## Canonical AP Invoice Exception Outcome

The golden V2 fixture composes mailbox/API/event intake, document intelligence, deterministic PO/GRN/duplicate/tax/vendor validation, workflow or dynamic case management, API-first ERP integration, bounded RPA only for unsupported UI gaps, human investigation or bounded assistance for genuine ambiguity, and human approval before posting, payment release, or vendor communication.

The ERP is retained and integrated or wrapped. Autonomous payment release and vendor communication are prohibited. Read-only investigation, evidence collection, recommendation, workflow, validation, audit, and monitoring remain permissible under their controls.

## Rollback And Safe Fallback

Rollback is operational feature disablement or read-only maintenance, followed by an additive forward fix. It preserves V1 and V2 data, case versions, finalized decisions, receipts, hashes, and audits. Finalized V2 decisions remain readable. The system never restores browser authority, silently falls back to V1, reinterprets V2 data using the V1 engine, or destructively down-migrates evidence.

## Proof Boundary

PR 1D source and disposable-test evidence cannot prove hosted RLS, deployment, private artifact safety, pilot or production readiness, security certification, compliance, scientific validation, expert calibration, guaranteed ROI, or buyer approval. PR 1E owns V2 review/approval and handoff authority. PR 1F owns calibration and economics hardening.
