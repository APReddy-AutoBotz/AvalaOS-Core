# Avala Assess V2 Decision Intelligence Architecture

Status: PR 1D correction target and implementation contract

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

## Durable Model And Additive Correction

The accepted PR 1D foundation migration adds separate normalized `assess_v2_*` relations. The additive PR 1D correction migration tightens clone persistence and finalization integrity without rewriting the accepted migration. Neither migration adds V2 rows to the V1 `assessments` table or backfills V1 records.

- `assess_v2_cases` owns organization/workspace/process ancestry, optional V1 source, owner, lifecycle, optimistic version, schema/rule-set identity, and soft-deletion state.
- `assess_v2_case_versions` owns immutable authoring revisions, clone provenance, and allowlisted imported facts. Imported V1 evidence is persisted as submitted and unvalidated; imported fact and evidence counts are returned from the clone/load boundary.
- Version-owned relations persist primitives, edges, decision points, exception paths, application assets, application interactions, and evidence links.
- `assess_v2_decision_versions` owns immutable source-version ancestry, schema/rule/decision versions, canonical input/evidence/output snapshots, SHA-256 references, supersession, validation status, actor/time, and explicit non-claims.

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

A bounded agent is ineligible when any required necessity condition is proven false. When all five conditions are asserted true but one or more lack valid claim-linked evidence, the result remains `Conditional Fit` with `Assumption-Led` confidence; only claim-linked evidence can raise that confidence to `Verified`. Extraction, summarization, retrieval, or drafting alone cannot satisfy this gate.

## Rule And Evidence Registry

Every decision-relevant field declares a stable field ID, decision use, decision layer, unit, polarity, candidate impacts, applicability, evidence requirement, and stable rule IDs. Contract validation rejects missing registry coverage, unknown fields, duplicate IDs, incompatible units, inapplicable conditional evaluation, context-only decision effects, and template suggestions treated as verified evidence.

Claim-level confidence is derived from exact evidence coverage, source type, freshness, owner, validation, corroboration, reviewer completion, stakeholder diversity, contradictions, and unresolved assumptions. The buyer-facing bands are `Verified`, `Partially Evidenced`, `Assumption-Led`, and `Insufficient Evidence`. Confidence qualifies conclusions and never adds fit points.

Template and V1-import values begin as suggested/unverified with `validated = false`. Unknown values remain unknown; missing evidence never receives an optimistic default.

## Canonical Snapshots And Database-Verified Hashes

The server generates input, evidence, and output snapshots from the same locked normalized facts used by the deterministic evaluator. Canonicalization has an explicit version and stable object-key, array-order, number, Unicode, and null rules. Each digest is domain-separated and binds tenant, workspace, case, source version, schema version, rule-set version, and decision version.

Finalization sends both canonical JSON text and its parsed snapshot to the private database RPC. PostgreSQL verifies that each canonical text parses to the equivalent bound snapshot, independently recomputes its UTF-8 SHA-256 digest, and rejects any snapshot, digest, or bound-context mismatch before decision, receipt, state, or audit persistence. A 64-character shape check is not an integrity proof.

SHA-256 references prove deterministic snapshot integrity only. They do not prove truth, authorship, evidence quality, scientific calibration, buyer approval, or deployment readiness. Historical V1 `sha-lite` identifiers remain legacy correlation references and are never promoted to cryptographic evidence.

## Commands And Canonical Capabilities

PR 1D supports only these command types:

- `assessment_v2.create`
- `assessment_v2.clone_from_v1`
- `assessment_v2.draft.upsert`
- `assessment_v2.finalize`

One typed capability contract is authoritative across the server mapping, client affordances, browser fixtures, tests, documentation, and migration checks:

- `assess.v2.read`
- `assess.v2.create`
- `assess.v2.clone`
- `assess.v2.draft.write`
- `assess.v2.finalize`

Every envelope and nested payload rejects unknown keys and enforces bounded types, enums, lengths, counts, units, and conditional applicability. Identical actor-scoped idempotent retries return the same committed response. Reusing a key with a different canonical payload conflicts. Concurrent distinct keys at one expected version produce one commit and one version conflict. Any required receipt, decision snapshot, hash, or audit failure rolls back the complete command.

## V1 Clone Boundary

Clone requires `assess.v2.clone`, `assess.v2.create`, and V1 `assess.read` authority plus readable same-tenant V1 ancestry. The Edge handler enforces all three capabilities before any service-role V1 source load, and the private clone RPC independently repeats all three checks before locking the V1 row. The source must be active, non-deleted, and use `assess-core-2026-05`. The server recursively converts only allowlisted response sections into explicit suggested or assumed facts, maps V1 evidence to submitted/unvalidated V2 evidence, persists both in the first immutable V2 version, and reports their actual counts. It records the source assessment and score version and never mutates the V1 row, Govern provenance, Studio handoff, score, or version.

V1 and V2 IDs, commands, persistence, outputs, and lifecycle states are not interchangeable. Existing V1 Govern and Studio handlers cannot accept V2 cases.

For V1 compatibility, a scored assessment in `Changes Requested` exposes an explicit keyboard-accessible **Revise requested changes** control. The control invokes the existing authorized V1 draft persistence path, which reopens the assessment as `Draft`, clears the prior score projection, and returns the author to editable sections before a new deterministic score can be calculated and resubmitted. The control is not rendered for other V1 statuses and does not alter V1 score formulas, score version, Govern transition authority, or V2 behavior.

## Application Interaction And Modernization

Each application/primitive/operation/mode interaction records interface, identity, least privilege, data, transaction, concurrency, idempotency, compensation, audit, errors, capacity, event, testing, monitoring, support, change, and lifecycle facts. Each action is independently classified as allowed, approval-bound, evidence-bound, or prohibited.

Modernization is evaluated separately and may compose `Retain + Native Integration`, `API Facade`, `Semantic Bridge`, `Event Bridge`, or a bounded temporary RPA bridge. Weak autonomous-write readiness never automatically means replace or rebuild.

## Canonical AP Invoice Exception Outcome

The golden V2 fixture composes mailbox/API/event intake, document intelligence, deterministic PO/GRN/duplicate/tax/vendor validation, workflow or dynamic case management, API-first ERP integration, bounded RPA only for unsupported UI gaps, human investigation or bounded assistance for genuine ambiguity, and human approval before posting, payment release, or vendor communication.

The ERP is retained and integrated or wrapped. Autonomous payment release and vendor communication are prohibited. Read-only investigation, evidence collection, recommendation, workflow, validation, audit, and monitoring remain permissible under their controls.

## Rollback And Safe Fallback

Rollback is operational feature disablement or read-only maintenance, followed by another additive forward fix. It preserves V1 and V2 data, imported facts/evidence, case versions, finalized decisions, canonical snapshots/text, receipts, hashes, and audits. Finalized V2 decisions remain readable. The accepted foundation migration and its correction are not destructively reversed. The system never restores browser authority, silently falls back to V1, reinterprets V2 data using the V1 engine, or destructively down-migrates evidence.

The V1 requested-changes compatibility control can be rolled back by hiding that affordance while retaining the existing server-authoritative assessment and review records. Rollback must not restore a stale score as an editable draft result or bypass the authorized V1 persistence and resubmission transitions.

## Proof Boundary

PR 1D source and disposable-test evidence cannot prove hosted RLS, deployment, private artifact safety, pilot or production readiness, security certification, compliance, scientific validation, expert calibration, guaranteed ROI, or buyer approval. PR 1E owns V2 review/approval and handoff authority. PR 1F owns calibration and economics hardening.


## P1 independent evidence-attestation correction

PR 1D permits only author-controlled evidence submission (suggested or submitted, with validated false). It does not create evidence approval, independent reviewer attestation, reviewer assignment, Govern resolution, Studio handoff, export, or sharing. The Edge parser rejects validated/rejected states, reviewer IDs, and review receipt/attestation fields; an additive database trigger independently rejects author-attestation payloads even if a private RPC is called directly.

Verified confidence is reserved for an immutable, server-authoritative, independently authorized evidence-attestation projection. That projection and its review command are PR 1E work. Consequently the PR 1D authoring/finalization path is reviewer-ready only and submitted claim-linked evidence can be no higher than Partially Evidenced; V1 imports remain submitted, unvalidated, and provenance-linked. Rollback remains the existing V2 disable/read-only fallback; no destructive migration rollback is permitted.

### Authoring completeness correction

The V2 workspace exposes canonical primitive fact controls and editable application lifecycle and accountable-owner fields. These inputs remain author-controlled facts; deterministic finalization validates their completeness and evidence linkage server-side.


### Locked-row clone projection authority

The private clone RPC reconstructs the complete canonical V1-to-V2 projection from the locked same-tenant V1 assessment row before any receipt or V2 write. It normalizes only the six allowlisted response sections, assumptions, and evidence items; derives deterministic evidence surrogates and claim links; preserves declared section and source-array ordering; and requires exact JSON equality with the server-supplied imported facts and evidence. Shape-valid but fabricated allowed-section values, owners, claims, IDs, or assumption content are rejected with no case, receipt, audit, or evidence side effect.

## Final review replay and claim-registration correction

Read-only mode blocks new finalization work but does not invalidate an already committed response. The private finalize replay boundary locks the runtime control, fails closed when V2 is disabled, revalidates current `assess.v2.finalize` authority, and returns an exact succeeded receipt during read-only maintenance. An absent receipt remains a mutation attempt and returns `READ_ONLY`; a mismatched receipt returns `IDEMPOTENCY_CONFLICT`.

Finalizable author evidence claims must bind exactly to a registered V2 decision field, an imported V1 fact field present in the locked case, or a bounded V1 evidence-provenance claim on a real V1 clone. Arbitrary non-empty strings, whitespace variants, typo/default claims, and unbound V1 provenance claims fail deterministic validation. This adds no new rule, score, threshold, recommendation, approval, or attestation behavior.
