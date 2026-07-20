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

A bounded agent is ineligible when any required necessity condition is proven false. When all five conditions are asserted true but lack a fresh submitted exact claim, the result remains `Conditional Fit` with `Assumption-Led` confidence; at least one fresh submitted exact required claim raises it only to `Partially Evidenced`. `Verified` remains unreachable in PR 1D. Extraction, summarization, retrieval, or drafting alone cannot satisfy this gate.

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

Finalizable author evidence claims must bind exactly to a registered V2 decision field, an imported V1 fact field present in the locked case, or an exact `v1.evidence.<source-evidence-id>` claim projected by the database from the immutable version-1 clone evidence. `sourceV1.importedEvidenceClaimIds` is server-derived from that locked clone version only; the current author-editable evidence array, a V1 source marker, a syntactically valid prefix, or a recomputed deterministic evidence UUID is not provenance. Arbitrary non-empty strings, whitespace variants, typo/default claims, fabricated or unimported V1 evidence identifiers, and unbound V1 provenance claims fail deterministic validation. This adds no new rule, score, threshold, recommendation, approval, or attestation behavior. Rollback remains V2 feature disablement or read-only maintenance with all imported provenance preserved; it must not restore prefix-only claim acceptance or silently reinterpret unbound claims as V1 evidence.

## Create and clone receipt replay correction

An exact succeeded `assessment_v2.create` or `assessment_v2.clone_from_v1` receipt is a committed, non-mutating response. The additive correction checks it before mutable process or V1-source lifecycle validation, after locking runtime control and revalidating current tenant, workspace, authorization version, and command capabilities. Exact replay therefore survives a later parent/source soft delete.

Disabled mode remains fail-closed. Read-only maintenance permits only an exact succeeded replay; a miss remains `READ_ONLY` and cannot claim a command. A mismatched request hash, workspace, resource ID, failed receipt, or in-progress receipt returns `IDEMPOTENCY_CONFLICT`. In normal mode, a receipt miss proceeds through row-locked parent/source validation, so a deleted or foreign resource returns `NOT_FOUND` without receipt, case, version, evidence, or audit side effects. Rollback remains feature disablement or read-only maintenance plus an additive forward correction; it must not delete committed receipts or restore mutable-resource checks ahead of exact replay.

## Create-case agent-necessity compatibility correction

A newly created unsaved V2 case projects the five canonical agent-necessity facts as complete unknown user facts (`fieldId`, `value: null`, `status: unknown`, empty `evidenceIds`, and `source: user`). The additive correction changes the future column default and explicitly persists that shape in the corrected create RPC.

To preserve immutable upgrade history, the read projection normalizes only the exact legacy version-1 `create` shape whose five canonical keys all contain bare nulls; arbitrary draft, clone, or malformed shapes are not normalized. Rollback remains V2 disablement or read-only maintenance plus an additive forward fix; it must not rewrite immutable authoring versions or restore null-unsafe create projections.

## Edge/Deno import-resolution compatibility correction

The dependency graph reachable from `supabase/functions/assess-v2-command/index.ts` uses an explicit `.ts` specifier for every relative static import, type import, re-export, and dynamic import. This includes the shared command/router/handler/database boundary, V1 clone compatibility, and the complete Assess V2 evaluator graph. A TypeScript-AST guard recursively resolves that graph from the Edge entry point, rejects extensionless or missing relative modules, and asserts that the authority-critical V2 modules remain reachable.

Node/Vite behavior remains compatible through bundler resolution and the repository test transpilers' `rewriteRelativeImportExtensions` setting. This correction changes no command schema, capability, scoring formula, rule, threshold, hard stop, recommendation, snapshot, hash, persistence, or lifecycle behavior.

Rollback remains V2 disablement or read-only maintenance followed by an additive forward fix; do not restore extensionless Edge imports or treat source resolution as hosted deployment proof.

## Edge clone-replay preflight correction

After fresh actor, tenant, authorization-version, and capability resolution, the Edge clone handler calls a server-owned replay helper before the mutable V1 source load. The private service-role RPC independently revalidates `assess.v2.clone`, `assess.v2.create`, and `assess.read`, locks runtime control and the actor-scoped receipt, and binds an exact succeeded replay to the immutable version-1 clone projection: organization, workspace, case, source assessment, name, description, contract version, and imported fact/evidence counts.

An exact replay returns the committed response without reading the current V1 row or creating another case, version, evidence link, receipt, or audit. A normal-mode receipt miss returns `NOT_FOUND` to the Edge boundary and proceeds through the existing locked active-source creation path. A read-only miss remains `READ_ONLY`; disabled mode remains `FEATURE_DISABLED`; a failed, in-progress, foreign-scope, wrong-resource, or request-mismatched receipt remains `IDEMPOTENCY_CONFLICT`. Current authority is required even for replay.

This correction changes no V1 or V2 scoring formula, weight, threshold, hard stop, recommendation, decision version, evidence-attestation boundary, approval state, or lifecycle authority.

Rollback remains V2 feature disablement or read-only maintenance with immutable clone history and receipts preserved, followed by another additive forward fix. Do not restore a V1 source lookup ahead of exact replay or expose the replay helper to browser roles.

## Final evidence-quality and author-status boundary correction

Legacy or incomplete V1 assessment metadata may omit `metadata.evidenceQuality`. Govern Lite treats only an absent or `undefined` value as insufficient evidence: it emits the existing evidence-confidence gap, requires evidence review, and cannot permit L4 autonomy. A present malformed value still reaches the strict canonical V1 evidence-quality normalizer and fails; the compatibility boundary does not silently coerce invalid data.

Every PR 1D author evidence payload must be an object with an explicit `suggested` or `submitted` status and `validated: false`. The database trigger explicitly rejects an omitted or JSON-null status before the allowed-status comparison, so SQL three-valued logic cannot bypass the attestation boundary. Compatible submitted/unvalidated rows already present when the additive migration is applied remain unchanged.

This correction changes no V1 scoring formula or score version, V2 rule or decision version, evidence threshold, approval authority, or lifecycle state. Rollback remains the existing read-only/disable fallback followed by an additive forward fix; do not restore null-unsafe Govern Lite normalization or an author-status predicate that permits SQL `NULL`.

## Final normal-draft atomic audit correction

The service-role-only V1 response-upsert compatibility RPC writes the domain update, actor-scoped receipt, and privileged audit in one transaction for both an ordinary `Draft` save and the narrowly authorized `Changes Requested` reopen. Ordinary saves persist an empty JSON object as non-null sanitized audit metadata; reopen saves retain the explicit `reopenedFrom` and `scoreCleared` metadata. An audit failure rolls back the response update and receipt.

Exact same-key replay returns the committed response without another version, receipt, or audit. The populated PostgreSQL matrix proves a normal Draft save commits, increments the assessment version, preserves Draft state, writes one succeeded receipt and one empty-metadata audit, and replays exactly; the requested-change reopen contract remains separately asserted.

This correction changes no V1 formula, weight, threshold, hard stop, recommendation, score version, Govern authority, or V2 behavior. Rollback remains the existing server-authoritative V1 path plus an additive forward fix; do not restore nullable audit metadata or weaken atomic audit ownership.

## Final V2 runtime-state presentation correction

The Assess V2 command client preserves the server's stable `READ_ONLY` and `FEATURE_DISABLED` codes instead of collapsing either to `COMMAND_UNAVAILABLE`. The Assess V2 boundary scopes both outcomes to a V2-local mutation-blocking `read_only` operational state without clearing valid tenant authority or downgrading the tenant-wide session. They retain distinct user-facing messages so planned maintenance and feature disablement are not presented as the same condition.

Existing committed V2 decisions remain readable while new creates, clones, draft writes, and finalization remain blocked by the existing action policy. Unknown or malformed error payloads still fail closed as `COMMAND_UNAVAILABLE`, and offline transport remains `OFFLINE`.

This is a client compatibility-boundary correction only. It changes no server command, database function, RLS or capability authority, score, rule, threshold, hard stop, recommendation, decision version, lifecycle, approval, attestation, handoff, export, or sharing behavior. Rollback remains V2 disable/read-only with records preserved, followed by an additive forward fix.

## Final financial-action, decision-time evidence, and draft replay correction

Technically Ready financial writes remain approval-bound: they are excluded from directly allowed actions, require Human approval, and retain the prohibition on autonomous financial action. This changes the action-classification output without changing technical readiness or the deterministic `INT-006` rule contract. The rule set therefore remains `assess-v2-rules-2026-07`, while the decision-output version advances to `assess-v2-decision-2026-07-19`. V1 `assess-core-2026-05` remains unchanged.

The server finalization timestamp is the single deterministic as-of instant for evidence freshness, candidate and agent evidence, gaps, assumptions, confidence, trace, and the immutable output snapshot. Draft creation or update time cannot keep evidence current after it has expired before finalization.

The private draft-upsert RPC locks runtime control, fails closed when V2 is disabled, and revalidates current `assess.v2.draft.write` authority before replay. During read-only maintenance it may return only an exact succeeded draft receipt bound to organization, actor, workspace, command, request hash, case, Draft status, and committed version. A receipt miss remains `READ_ONLY`; any mismatched, failed, or in-progress receipt remains `IDEMPOTENCY_CONFLICT`; neither path creates a domain, receipt, version, or audit side effect.

This correction adds no V2 approval, evidence attestation, Govern resolution, Studio handoff, export, sharing, PR 1E, or PR 1F behavior. Rollback remains V2 disablement or read-only maintenance with immutable decisions and receipts preserved, followed by an additive forward fix.

## Final read-only discovery and immutable imported-evidence correction

With valid tenant context and `assess.v2.read`, read-only sessions continue V2 case discovery, current-draft reload, and reviewer-ready Decision Pack reads. Create, clone, draft-save, and finalization authority remains strictly `ready`-only; read-only mode exposes no create or clone controls and cannot commit a mutation.

For V1-cloned cases, the immutable version-1 clone evidence row is authoritative for every imported evidence ID. An exact imported payload may round-trip through authoring but never creates a mutable shadow row. Altered same-ID author evidence returns `INVALID_COMMAND` before receipt, authoring version, evidence, case-head, or audit mutation, and the read projection defensively prefers the locked clone row over any historical collision. Imported claims, owner, provenance, confidence, canonical snapshots, and output therefore cannot be changed through an author evidence-ID collision.

This hardening adds no scoring, rule, approval, attestation, Govern, Studio, handoff, export, or sharing behavior. The rule set remains `assess-v2-rules-2026-07`; V1 `assess-core-2026-05` remains unchanged. Rollback remains V2 disable/read-only with immutable data preserved plus an additive forward fix.

## Final Edge-shaped clone authoring and immutable client reload correction

The draft RPC compares a same-ID imported evidence payload against its client-authorable projection, which intentionally omits the server-only `reviewerIds` and `contradictory` fields rejected by the Edge parser. An exact Edge-shaped round-trip can therefore save a later V2 draft without copying a mutable shadow row. Altered status, owner, claims, provenance, or an attempt to supply server-only evidence fields remains `INVALID_COMMAND` before receipt claim and has zero side effects.

Draft reads for a V1-cloned case query the tenant-scoped version-1 `v1_clone` authoring row, reload its immutable evidence, and merge it with current-version author evidence so immutable imported evidence wins every same-ID collision. The same projection reconstructs `sourceV1.importedEvidenceClaimIds` and `clonedAt`, preserving provenance and preventing a browser reload from inventing a linked-evidence gap.

## Final candidate-confidence and private fact-validation correction

Candidate, agent, and overall confidence now share the PR 1D author-evidence boundary. No relevant evidence is `Insufficient Evidence`; suggestions, templates, expired evidence, and unrelated claims are `Assumption-Led`; at least one fresh submitted exact required claim is `Partially Evidenced`. `Verified` remains unreachable until a later independently authorized attestation milestone. These confidence changes do not change candidate fit, agent fit, V1 scoring, or the `assess-v2-rules-2026-07` rule contract. Because immutable output can change, the decision version advances to `assess-v2-decision-2026-07-19-2`.

The additive `20260719130000_pr1d_author_fact_validation.sql` migration mirrors the Edge parser at the private service-role draft RPC. It validates primitive facts, optional primitive agent facts, and top-level agent facts as exact five-key fact objects; binds fact-map keys to `fieldId`; permits only user, system, and template author sources; enforces unknown/null equivalence; rejects template-known facts and author-supplied `v1-import`; validates evidence UUID arrays; and restricts canonical agent values to boolean or null.

Validation returns `INVALID_COMMAND` before command receipt claim or draft persistence, producing zero side effects. Trusted immutable `imported_facts` remain copied from the prior server-owned version and are never accepted from author input. Rollback remains V2 disable/read-only with immutable records preserved, followed by an additive forward correction.

This is a compatibility-boundary correction only. It changes no V1 or V2 score, formula, weight, threshold, hard stop, rule, recommendation, decision version, approval, attestation, Govern, Studio, handoff, export, or sharing behavior. Rollback remains V2 disable/read-only with immutable records preserved and an additive forward fix.

## Final V2-local fallback and legacy evidence-ID alignment correction

`READ_ONLY` and `FEATURE_DISABLED` returned by an Assess V2 operation are presented as a V2-local operational fallback. The organization session and current tenant authority remain `ready`, so frozen V1 authoring and unrelated enterprise actions remain available. Assess V2 create, clone, draft-save, and finalization stay blocked, while authorized V2 discovery, draft reload, and finalized Decision Pack reads remain available. Authentication, stale authority, tenant revocation, offline, and other enterprise boundary failures continue through the tenant-wide policy.

The V1 clone boundary now validates generated `v1.evidence.<source-id>` claims with the same source evidence-ID alphabet already accepted by the locked V1 projection: `[A-Za-z0-9._:-]+`. Valid dotted identifiers therefore preserve their complete provenance claim. Spaces, slashes, and every other unsupported character remain `INVALID_COMMAND` before case, receipt, evidence, or audit mutation.

This correction changes no V1 scoring behavior, V2 rule or decision version, capability grant, RLS policy, approval, attestation, handoff, export, or sharing scope. Rollback remains V2-local disable/read-only with immutable records preserved and V1 available, followed by an additive forward fix.

## Final author-provenance and executable-guard correction

Browser-authored primitive and agent facts accept only `user`, `system`, or `template` sources. `v1-import` is reserved for the server-created clone projection derived from the locked V1 source and cannot be asserted through draft authoring, including after a legitimate clone. Trusted imported facts remain immutable case provenance and continue through the private clone RPC and deterministic finalization path.

The PR 1D source-boundary guard executes its imported-evidence require/forbid assertions on every successful run, outside the preceding draft-replay-order failure branch. A mutation probe that removes the client-authorable imported-evidence projection must fail the guard rather than bypass those assertions.

This correction changes no scoring, rule, decision version, capability, RLS, lifecycle, approval, attestation, handoff, export, or sharing behavior. Rollback remains V2-local disable/read-only with immutable records preserved and V1 available.

## Final V1 clone eligibility correction

The browser exposes V1-to-V2 clone only when the source assessment matches the server contract: lifecycle `Approved` or `Handed Off to Docs`, and frozen score version `assess-core-2026-05` from the scored or top-level compatibility projection. Draft, Ready for Review, Changes Requested, and non-frozen assessments remain visible as V1 history but are not eligible clone sources.

The clone control is disabled for an ineligible source, the component presents local safe-unavailable copy, and the start path returns before any command or enterprise-boundary handler. Create V2 remains available when independently authorized, so a known clone ineligibility cannot clear tenant context or block unrelated work.

This correction changes no server eligibility, score, rule, decision version, capability, RLS, lifecycle, approval, or V1 behavior. Rollback remains V2-local disable/read-only with V1 available.

## PR 1E governed review extension

PR 1E does not redesign this decision model. It binds append-only assignment, attestation, resolution, Govern, and Studio-source records to the exact organization, workspace, case, case version, decision, evidence, claims, actor, and authorization version. `Verified` becomes available only after every current material required claim has an accepted independent server-authoritative attestation. Any new case revision requires new finalization and a new decision; prior review cannot authorize it.
