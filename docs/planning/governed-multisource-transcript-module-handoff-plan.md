# Governed Multi-Source Text Transcript And Optional Module Handoff Plan

Status: PR A accepted through PR #255 at `11e670003a73b0ab5a28650b70afac4b267760f4`; PR B exact head `fe3ebfb900bc163df2e436ec5b11f8751f9b79ea` merged through `5433cad41721355e3ec5a29bc2f87772540c77b5`; existing Draft PR #264 is the authorized PR C corrective continuation and remains merge NO-GO pending full exact-head verification

Plan date: 2026-08-25

Planning baseline: post-PR-B `main` at `5433cad41721355e3ec5a29bc2f87772540c77b5`

Deployment status: unknown; no hosted or live environment was inspected

Implementation authority: PR A was accepted through PR #255; PR B is merged through PR #263; the AP explicitly authorized PR C implementation and testing control on 2026-08-31

PR A evidence boundary: accepted final head `460c44864b9d240321e727945411ced51dd0fe30`, merge `11e670003a73b0ab5a28650b70afac4b267760f4`, 33 exact commands, 194 executed assertion markers, six explicit `not_run` results, 68 source-provenance entries, mocked providers, disposable PostgreSQL 16, Desktop Chrome, Pixel 7, all 15 applicable workflows, Netlify preview, and fresh independent review. Executed markers bind assertion-emitted runtime persona, canonical capabilities, tenant scope, fixtures, and exact exercised lineage. Hosted/live infrastructure, real providers, deployment, pilot, production, security certification, and compliance certification were not run.

PR C execution boundary: one additive implementation PR owns Delivery and Monitor behavior, migrations, tests, assertion-owned evidence, rollback, and controlled-human readiness material. Its source/local/CI evidence may prove only the exact candidate it executes. Hosted/live infrastructure, real providers, deployment, pilot, production, security certification, compliance certification, and controlled-human results remain `not_run` unless separately authorized and actually executed. `PERF-003` and `PERF-004` remain `not_run` until the AP approves numeric budgets.

## 1. Plan handling and authority

This file records the approved target behavior for text-only transcript ingestion, independent module source selection, optional governed handoffs, the required user interface, unified BYOK dependencies, deterministic mock verification, and controlled-human-testing readiness.

This plan must not become a standalone plan-only PR. When implementation is authorized, it must travel with the implementation, migrations, tests, feature documentation, rollback instructions, and exact verification evidence in the substantial PR that needs it.

The plan is subordinate to:

- `AGENTS.md` for execution, safety, delegation, and delivery discipline;
- `docs/00_SOURCE_OF_TRUTH.md` for product and readiness authority;
- `docs/architecture/enterprise-intelligence-authority.md` for current BYOK, ingestion, Delivery, and Monitor authority;
- `docs/architecture/assess-v2-decision-intelligence-architecture.md` for Assess authority;
- `docs/architecture/studio-governed-artifact-authority.md` for current Studio authority; and
- `PLANS.md` for required plan content.

The implementation PRs must update the active authority documents where this plan intentionally expands current scope. Historical evidence must not be rewritten.

## 2. Executive decision

AvalaOS will introduce one governed workspace Source Library containing immutable text-source versions. Assess and Studio will each build their own independently versioned source sets from that library.

The same transcript may be reused by both modules, but reuse is never automatic. Assess and Studio may select:

- completely different transcripts;
- the same transcripts;
- partially overlapping transcripts; or
- one or many transcripts in any declared order.

Each module run binds the exact immutable source-set and input-bundle version it used. Adding, removing, replacing, reordering, or reclassifying a transcript creates a new version and never rewrites an earlier decision or artifact.

Users may begin in Assess, Studio, or Delivery and may stop after any module. No completed module automatically creates a downstream resource. A downstream handoff requires an explicit user action, current server authorization, source eligibility, an exact immutable source version, and target acceptance. Organization policy may require an additional independent handoff review and approval.

The complete governed route remains:

```text
Assess -> Studio -> Delivery -> Monitor
```

Module independence is also supported:

```text
Assess only
Studio only
Studio -> Delivery -> Monitor
Delivery only
Delivery -> Monitor
```

Direct Studio and Delivery paths are labelled `not_assessed` and `planning_only`. They may produce governed documents, work packages, approvals, and read-only Monitor baselines, but they cannot claim Assess decision ancestry, automation suitability, risk acceptance, or future execution authority. If execution is authorized in a later milestone, an approved Assess decision remains a hard prerequisite.

Monitor remains a read-only projection. Transcript ingestion, work-item editing, due-date mutation, completion inference, live telemetry, and task execution do not move into Monitor in this milestone.

## 3. Objective and user outcome

The objective is to let an authorized user:

1. upload or paste one or more already-transcribed text sources;
2. select exactly which transcript versions a module may use;
3. review, edit, accept, or reject source-derived suggestions;
4. complete missing information manually without silent AI overwrite;
5. use different source sets for Assess and Studio;
6. select a governed system or approved tenant template;
7. edit, review, reject, request changes to, and approve generated documents;
8. translate an approved Studio document into an editable Delivery work-item proposal;
9. edit, accept, reject, review, request changes to, and approve that package;
10. create a read-only Monitor baseline only from an exact approved Delivery package; and
11. choose whether to stop, continue, or request each optional handoff.

Every result must retain machine-verifiable causality back to the exact selected sources, human decisions, module versions, provider route, template version, and approval records.

## 4. Approved product decisions

The following decisions are fixed for this plan:

1. **Text transcripts only.** Supported VTT, SRT, TXT, Markdown, CSV, and meeting-note text remain in scope. Existing text PDF and DOCX ingestion may continue. Audio/video transcription, OCR, remote URL ingestion, and archive expansion remain out of scope.
2. **Independent module source sets.** Assess and Studio never share a mutable source set. They may deliberately reference the same immutable source versions.
3. **One or many sources.** A module bundle may include one or multiple exact source versions.
4. **No implicit influence.** An uploaded but unselected source has zero influence on extraction, generation, scoring, documents, work items, or Monitor.
5. **No automatic handoff.** Completion or approval exposes a handoff action; it never creates the next module resource by itself.
6. **Module choice.** Users may begin in Assess, Studio, or Delivery. Monitor is view/baseline only.
7. **Planning-only direct paths.** Direct Studio or Delivery paths are visibly and durably marked `not_assessed` / `planning_only`.
8. **Humans resolve meaning.** AI may propose fields, document content, or work items; it cannot decide deterministic scores, approvals, risk gates, or regulated decisions.
9. **Manual facts remain authoritative until explicitly changed.** Transcript-derived values never silently replace a human-entered value.
10. **Delivery owns work editing.** Work-item editing and approval belong to Delivery; Monitor consumes approved results read-only.
11. **Governed custom templates.** Tenant-authored templates require server persistence, immutable versions, review, and approval. Legacy local Template Studio state is not canonical.
12. **Unified server-side BYOK.** All AI-backed capabilities use one server-only provider registry, secret boundary, route policy, budget authority, audit contract, and provider adapter interface.
13. **Mocks first.** Exhaustive verification uses deterministic provider mocks and synthetic sources. Any real-provider smoke test is separately authorized, explicitly enabled, and hard-capped.

## 5. Current-state gap classification

| ID | Classification | Current gap |
| --- | --- | --- |
| `GAP-SOURCESET-001` | confirmed source defect/gap | No canonical one-or-many transcript-set aggregate or module-target binding exists. |
| `GAP-INTAKE-001` | confirmed quality gap | Existing synthetic transcript fixtures are scored from separate oracle inputs, not extracted through the real transcript path. |
| `GAP-ASSESS-001` | confirmed source gap | Transcript promotion appends unvalidated evidence and does not populate structured Assess fields. |
| `GAP-ASSESS-002` | confirmed source gap | Candidate edit exists server-side but is absent from the Candidate Review UI. |
| `GAP-ASSESS-003` | confirmed source/authority mismatch | Current authority describes reviewable manual conflicts, but the current promotion path does not provide that conflict workflow. |
| `GAP-STUDIO-001` | confirmed source gap | Canonical Studio accepts only Assess-derived ancestry and fixed system BRD/FRD/PDD templates. |
| `GAP-STUDIO-002` | confirmed UX gap | Canonical editing is strict structured JSON rather than a business-friendly structured editor. |
| `GAP-DELIVERY-001` | confirmed source/UX gap | Generated canonical work items are not exposed as an editable item list. |
| `GAP-DELIVERY-002` | confirmed source/UX gap | Item edit/accept/reject and package request-changes/reject behavior are incomplete in the Enterprise UI. |
| `GAP-MONITOR-001` | confirmed integration gap | The Enterprise baseline and the main Monitor application surface are not one causally proven projection. |
| `GAP-BYOK-001` | confirmed architecture gap | Enterprise and legacy Studio/document generation use fragmented provider paths. |
| `GAP-BYOK-002` | confirmed provider gap | Groq is not a first-class Enterprise provider identity. |
| `GAP-BUDGET-001` | confirmed concurrency gap | Provider budget checks use read-then-compare behavior rather than atomic reservation/settlement. |
| `GAP-FLOW-001` | confirmed quality gap | No single causal test proves selected transcripts through Assess/Studio, Delivery, and Monitor. |

## 6. In scope

- Workspace-scoped reusable text-source library.
- Immutable source versions and safe source reuse.
- Module-owned Assess and Studio source sets and immutable source-set versions.
- One-or-many ordered transcript membership with explicit semantic roles.
- Exact input-bundle locking for every extraction or generation run.
- Assess extraction, candidate review/edit/reject, explicit apply targets, manual conflict resolution, claim binding, and unchanged deterministic scoring.
- Direct Studio entry, Assess-derived Studio entry, and hybrid Studio entry using independent supplemental transcripts.
- Server-owned BRD/FRD/PDD templates plus governed tenant-authored templates.
- Business-friendly structured Studio editing backed by immutable JSON revisions.
- Optional Assess-to-Studio and Studio-to-Delivery handoffs.
- Direct/manual Delivery entry with `not_assessed` / `planning_only` lineage.
- Delivery work-item list, edit/accept/reject, version diff, review, changes requested, approval, and rejection.
- Exact approved Delivery-to-Monitor baseline creation.
- Unified BYOK for OpenAI, Azure OpenAI, Anthropic/Claude, Gemini, Groq, and allowlisted OpenAI-compatible providers.
- Atomic budget reservation/settlement.
- Complete responsive, accessible, failure-truthful UI states.
- Deterministic synthetic fixtures, provider mocks, PostgreSQL tests, browser tests, adversarial tests, and commit-bound evidence.

## 7. Explicitly out of scope

- Audio or video transcription.
- Live meeting capture or conferencing integrations.
- OCR or scanned-document recognition.
- Remote URL fetch, cloud-drive fetch, or archive expansion.
- Browser-held provider keys or browser-side AI execution.
- AI-determined scores, approvals, risk gates, completion, or regulated decisions.
- Jira replacement behavior, external issue-tracker sync, task execution, autonomous agents, MCP/A2A runtime, RPA, deployment, or infrastructure mutation.
- Live telemetry, automatic task completion, due-date mutation, or status inference in Monitor.
- KlarityFlow Health changes.
- Hosted deployment, production cutover, live provider validation, or customer-data testing without separate approval.

## 8. Route and module-entry contract

### 8.1 Route matrix

| Entry or edge | Required input | Required source lifecycle | Result | Durable lineage label |
| --- | --- | --- | --- | --- |
| Start Assess | manual facts, selected Assess source sets, or both | selected sources parsed before extraction | Assess draft | `manual_only`, `transcript_assisted`, or `hybrid` |
| Assess -> Studio | exact approved Assess decision and explicit handoff | approved, current, non-stale | Studio input package | `assess_approved` |
| Start Studio | Studio source sets and/or manual brief | selected sources parsed; candidates reviewed according to policy | Studio draft | `not_assessed`, `planning_only` |
| Assess + Studio supplements -> Studio | approved Assess handoff plus independently selected Studio sets | exact Assess approval and locked Studio bundle | Studio draft | `assess_approved_with_supplements` |
| Studio -> Delivery | exact approved Studio artifact and explicit handoff | approved, current, non-stale | Delivery proposal package | inherits assessed or `not_assessed` lineage |
| Start Delivery | manual package | no transcript input in this milestone | Delivery proposal package | `manual`, `not_assessed`, `planning_only` |
| Delivery -> Monitor | exact approved package version and accepted item set | approved, current, zero unresolved blockers | read-only Monitor baseline | exact package lineage |
| Start Monitor | existing authorized baselines only | no creation from sources | read-only projection | existing baseline lineage |

Assess-to-Delivery, Assess-to-Monitor, and Studio-to-Monitor shortcuts are not supported. Users who do not need intermediate modules can start directly in the desired authoring module instead.

### 8.2 Route policy

The server owns a versioned route policy per organization/workspace. The policy may:

- enable or disable direct Studio and direct Delivery entry;
- require an approved Assess decision before Studio-to-Delivery handoff;
- require target acceptance only or independent handoff review plus approval;
- limit template types and provider capabilities; and
- require separation of duties for selected handoffs.

The platform default permits direct Studio and Delivery for planning-only work, while preventing every automation/execution readiness claim. Client state and hidden controls cannot relax route policy.

### 8.3 Stop, resume, and exit behavior

- A user may stop after any committed module state without creating downstream records.
- A stopped journey remains readable and may be resumed only by a freshly authorized actor.
- Changing the desired exit module changes navigation intent only; it does not create or mutate domain resources.
- A user may withdraw an unconsumed handoff request.
- Rejected handoffs remain immutable history and may be replaced only by a new handoff version/request.

## 9. Trust boundaries and non-negotiable invariants

1. The browser supplies only safe selected identities, user-authored values, rationale, and expected versions.
2. The server derives organization, workspace, current versions, source hashes, route policy, capabilities, provider configuration, model, budget, approval eligibility, and downstream resource identity.
3. Every privileged request revalidates active membership, exact workspace, role/capability, authorization version, resource ownership, and current lifecycle.
4. Service role is a database transport authority, never a substitute for application authorization.
5. Every source, set, bundle, run, handoff, template, artifact, package, item, and baseline is tenant/workspace bound with composite foreign keys and forced RLS.
6. Authenticated users receive capability-scoped projections only; mutation RPCs remain service-only.
7. Source text and tenant-authored templates are untrusted data. Neither may issue instructions, select tools/providers/routes, access secrets, or relax policy.
8. Every provider key remains server-side and tenant-bound. Secrets never enter URLs, logs, receipts, browser storage, projections, evidence, or built assets.
9. Deterministic scoring law, weights, thresholds, hard stops, and rule versions remain unchanged.
10. No aggregate suite result may synthesize individual Test-ID PASS results.

## 10. Data architecture

### 10.1 Reuse existing immutable source authority

Retain and extend:

- `enterprise_evidence_sources`; and
- `enterprise_evidence_source_versions`.

Existing per-file limits remain:

- maximum 12 MiB per source;
- maximum 500,000 extracted Unicode characters per source; and
- text-oriented supported formats only.

An exact content hash already identifies duplicate bytes within a workspace. The UI must offer reuse of the committed version instead of creating misleading duplicate authority. A user may deliberately reference one source version in multiple module source sets.

Soft deletion prevents new selection but must not erase a source version referenced by immutable decisions or artifacts. Retention, legal hold, and deletion behavior must continue to respect existing private-artifact authority.

### 10.2 Add module-owned source sets

Add:

`enterprise_source_sets`

- `id`, `org_id`, `workspace_id`;
- `owner_module` constrained to `assess | studio`;
- safe display label and description;
- `current_version`, `lifecycle_version`;
- `status`: `draft | locked | superseded | archived`;
- creator and timestamps.

`enterprise_source_set_versions`

- immutable version identity;
- source-set, tenant, and workspace identity;
- purpose;
- ordered-member manifest hash;
- parser/normalization contract version;
- aggregate source count and extracted-character count;
- status: `draft | locked | superseded`;
- actor and timestamp.

`enterprise_source_set_version_items`

- exact source-set version;
- exact source version;
- ordinal;
- role: `primary | supporting | contradictory | reference`;
- optional user note;
- source content hash and extracted-text hash copied only as immutable verification fields;
- unique membership and ordinal constraints.

Default limits:

- maximum 20 source versions in one source set;
- maximum 2,000,000 extracted Unicode characters across a locked set;
- no duplicate exact source version in one set; and
- reordering is meaningful and creates a new version.

Limits are server configuration with these values as fail-closed defaults. Increasing them requires performance and provider-cost evidence; the browser cannot override them.

The manifest hash is length-framed and covers ordered source-version IDs, source/content/extracted hashes, roles, ordinals, and contract version.

### 10.3 Add module input bundles

A module may consume one or more source sets plus an optional upstream handoff. Add:

`enterprise_module_input_bundles`

- aggregate identity, tenant/workspace, owner module, current version, creator.

`enterprise_module_input_bundle_versions`

- exact ordered source-set versions;
- optional exact upstream handoff version;
- optional manual-brief hash;
- exact bundle hash;
- status: `draft | locked | superseded`;
- actor and timestamp.

`enterprise_module_input_bundle_items`

- item kind: `source_set | upstream_handoff | manual_brief`;
- exact resource/version/hash;
- ordinal and declared purpose.

Every extraction, generation, promotion, document revision, and downstream proposal binds one exact locked bundle version. A bundle cannot change in place.

### 10.4 Add journey and module-run projections

Add:

`enterprise_governed_journeys`

- entry module and desired exit module;
- current module;
- lineage classification: `assessed | not_assessed | mixed`;
- planning-only boolean;
- route-policy version;
- status: `active | stopped | completed | blocked | archived`;
- aggregate version, creator, timestamps.

`enterprise_module_runs`

- journey, tenant/workspace, module;
- exact input-bundle version and hash;
- provider route/model/prompt/template versions where applicable;
- state: `requested | processing | review_required | draft_ready | completed | failed | blocked`;
- canonical output resource/version/hash;
- receipt/effect/audit identities;
- sanitized failure classification.

Journey records are navigation and lineage projections. They never replace module-owned authorization or lifecycle checks.

### 10.5 Add generic optional handoffs

Add:

`enterprise_module_handoffs`

- journey, tenant/workspace;
- `from_module`, `to_module` constrained to allowed adjacent edges;
- exact upstream resource/version/hash;
- exact target input-bundle version/hash;
- inherited lineage classification and planning-only state;
- route-policy version;
- status: `draft | requested | target_review | changes_requested | rejected | approved | consumed | withdrawn | stale`;
- current version and timestamps.

Append-only tables:

- `enterprise_module_handoff_review_events`;
- `enterprise_module_handoff_approval_events`; and
- `enterprise_module_handoff_consumptions`.

Approval binds the exact upstream output hash and target bundle hash. A changed upstream output or target bundle makes an unconsumed handoff stale. A consumed handoff remains valid historical ancestry; a newer upstream version is shown as available but never silently replaces it.

### 10.6 Generalize Studio source authority safely

Add `studio_artifact_source_packages` with an exact source-mode union:

- `assess_handoff`;
- `direct_transcript_bundle`;
- `assess_plus_transcript_bundle`; or
- `manual_brief`.

Each package stores the exact available identities/hashes and an overall package hash. Existing Studio artifacts are backfilled from their immutable Assess ancestry.

The Studio migration must not merely drop current non-null ancestry checks. It must:

1. add the generalized source package and populate every existing artifact;
2. add an exact exclusive-union check for each source mode;
3. preserve current Assess foreign keys for Assess-derived modes;
4. require a locked Studio input bundle for transcript modes;
5. cut query and command paths to the generalized package behind a server flag; and
6. remove or relax legacy not-null constraints only in the same transaction that installs stronger source-mode checks.

Direct-source Studio artifacts retain `not_assessed` / `planning_only` labels through every revision and handoff unless a separately approved Assess handoff is attached in a new source-package version.

### 10.7 Add governed tenant templates

Retain `studio_system_template_versions` and add:

- `studio_tenant_template_aggregates`;
- `studio_tenant_template_versions`;
- `studio_tenant_template_review_events`; and
- `studio_tenant_template_approval_events`.

A template defines document structure only:

- safe name and description;
- artifact class: `brd | frd | pdd | custom`;
- ordered section definitions;
- required/optional flags;
- field schema and validation rules;
- renderer compatibility version.

Tenant templates cannot supply system instructions, provider endpoints, tools, secrets, raw headers, or policy. The provider system instruction remains server-owned; template content is delimited as untrusted structure data.

Lifecycle:

```text
draft -> reviewer_ready -> in_review -> changes_requested | rejected | approval_ready -> approved -> retired
```

Only an exact approved version may be used for generation. Editing an approved template creates a new draft version and does not change existing artifacts.

### 10.8 Version Delivery items instead of mutating history

Retain existing work-package aggregates and versions. Add logical item and item-version authority:

- `enterprise_delivery_work_item_aggregates` for stable logical identity;
- `enterprise_delivery_work_item_versions` for proposed, edited, accepted, or rejected versions;
- `enterprise_delivery_work_item_review_events`; and
- package review/request-changes/approval/rejection events where not already canonical.

Each item version retains:

- package version;
- source artifact/version/hash and section locator when applicable;
- originating Studio source-package hash;
- item type, title, description, acceptance criteria, non-functional requirements;
- human edit ancestry and rationale;
- status: `proposed | edited | accepted | rejected | superseded`.

Editing creates a descendant version. Rejected proposals remain in history but are excluded from the approved canonical item set. Package approval requires every current proposal to have a terminal decision and at least one accepted item.

Direct/manual Delivery packages use a generalized `enterprise_delivery_source_packages` source-mode union. Existing Studio-derived packages are backfilled without losing current lineage.

### 10.9 Generalize Monitor lineage without weakening approval

Monitor continues to bind the exact approved work-package version and canonical accepted-item set. Existing Studio columns may become legacy optional fields only after a generalized package-source manifest is installed and backfilled.

A Monitor baseline from a direct/manual or not-assessed package must display that durable classification. It cannot imply Assess approval, automation readiness, live status, or execution.

## 11. Assess behavior

### 11.1 Extraction and source review

Extraction runs independently for every exact selected source version. Cross-source aggregation never erases source-specific anchors.

The Candidate Review UI groups candidates by:

- target Assess concept;
- source transcript and version;
- timestamp/normalized-text locator;
- confidence; and
- review status.

The user can:

- accept;
- edit with required rationale;
- reject;
- mark contradictory/supporting;
- select an allowlisted Apply target; and
- leave unresolved.

Provider locators are ignored. The server derives the normalized-text locator and excerpt-anchor hash from persisted extracted text.

### 11.2 Explicit application to Assess

Do not map broad transcript candidates blindly into the Assess schema. Add server-owned application intents such as:

- `set_case_field`;
- `create_primitive`;
- `create_application_asset`;
- `create_interaction`;
- `create_decision_point`;
- `create_exception_path`;
- `set_registered_fact`; and
- `link_evidence_only`.

The browser displays a preview of the exact proposed draft change. The user selects or edits the target. The server validates the target against the Assess field registry and current draft, then applies the selected batch atomically as a new immutable draft version.

Unsupported or ambiguous candidates remain evidence-only. No candidate changes a score directly.

### 11.3 Manual and cross-source conflicts

Add `enterprise_assess_evidence_conflicts` binding:

- exact field/application intent;
- candidate IDs, candidate versions, and source anchors;
- current manual value/version when present;
- resolution: `choose_candidate | retain_manual | authored_resolution | unresolved`;
- resolver, rationale, and immutable resolution version.

Neither AI confidence nor source order resolves a material conflict automatically. Unresolved material conflicts block Assess finalization. Non-material unresolved questions remain visible and follow existing deterministic completeness rules.

Scoring uses only committed, user-confirmed inputs and the existing locked score/rule versions.

## 12. Studio behavior

### 12.1 Studio input modes

Studio supports:

1. approved Assess handoff only;
2. Studio-specific transcript set(s) only;
3. approved Assess handoff plus Studio-specific supplements; or
4. manual brief only, when route policy allows.

Studio transcripts may be entirely different from Assess transcripts. The UI shows the two input families separately and never implies that Studio supplements were assessed.

Before generation, the user reviews a Source Coverage summary containing:

- exact selected source labels and versions;
- Assess ancestry, if any;
- accepted/rejected/unresolved Studio source suggestions;
- template version;
- planning-only/assessment label;
- provider route availability and bounded cost estimate; and
- blockers.

### 12.2 Multi-source generation

The generation pipeline uses two bounded stages:

1. per-source extraction into schema-constrained, grounded source facts; and
2. artifact generation from accepted facts, exact citations, optional Assess source package, approved template structure, and user manual brief.

Raw source text is never treated as instruction. When context exceeds a provider request budget, deterministic chunk planning records every included/excluded segment. Silent truncation is prohibited. If full selected-source coverage cannot be achieved within configured request/token budgets, generation blocks with an explicit source-coverage error or asks the user to reduce the bundle.

Every generated section records zero or more source anchors. Text without a source anchor is labelled `human_authored`, `template_required`, or `assumption`; it cannot masquerade as transcript-derived evidence.

### 12.3 Business-friendly editor

Replace raw JSON authoring as the primary UI with a structured section editor:

- outline and section navigation;
- section title and body fields;
- structured lists for requirements, rules, controls, risks, interfaces, and acceptance criteria;
- citations and source-coverage panel;
- add/remove/reorder actions allowed by the template schema;
- side-by-side preview;
- autosave indicator for local draft state, but durable success only after server commit;
- version history and revision diff; and
- accessible error summary.

Canonical storage remains validated structured JSON. Rendering continues through sanitized governed renderers. A revision creates an immutable artifact version.

## 13. Delivery and Monitor behavior

### 13.1 Delivery proposal creation

An approved Studio artifact may create a proposed Delivery package only after an explicit handoff request. The target preview shows:

- artifact/version/template;
- assessed, mixed, or not-assessed lineage;
- proposed item count and types;
- source coverage;
- known blockers; and
- target workspace.

The target user must accept the handoff before the Delivery package becomes an editable draft.

Direct Delivery entry creates a manual planning-only package with no fabricated Studio or Assess ancestry.

### 13.2 Work-item review UI

Delivery displays the actual canonical item list, not only a count. Each row/card includes:

- type: Epic, Story, Task, Milestone, Dependency, or Risk;
- title and description;
- acceptance criteria and non-functional requirements;
- source artifact/section citation where applicable;
- proposed/edited/accepted/rejected status; and
- reviewer rationale/history.

Users can edit, accept, or reject each proposal. Package submission is disabled until all current proposals are resolved. Independent review may request changes, approve the review, or reject it. Final approval and final rejection remain separate actions with separation of duties.

### 13.3 Monitor baseline

Monitor creates one idempotent baseline from one exact approved package version and exact accepted-item set. It displays:

- lineage classification;
- package and baseline versions;
- approved item counts by type;
- milestones, dependencies, blockers, and risks;
- assessment coverage label;
- readiness limited to `not_ready | review_required`; and
- `live telemetry disabled`.

Monitor has no transcript upload, item editor, task mutation, execution control, or inferred completion in this milestone.

## 14. Handoff lifecycle and user decisions

Default lifecycle:

```text
eligible -> requested -> target_review -> approved -> consumed
                          |              |
                          +-> changes_requested
                          +-> rejected
requested -> withdrawn
any unconsumed current state -> stale
```

Rules:

1. Source approval makes a handoff eligible but never creates it.
2. An authorized user explicitly selects `Request handoff`.
3. The server reloads and hashes the exact current source resource and route policy.
4. The browser shows a safe preview with no raw IDs/hashes.
5. The target user accepts, rejects, or requests changes.
6. If policy requires independent review/approval, creator, reviewer, and approver must be distinct.
7. Consumption creates the target draft, receipt, audit, handoff-consumption record, and safe effect journal atomically.
8. Response loss reconciles the exact committed target without another domain effect.
9. A changed source version or target bundle before consumption makes the request stale.
10. A user may stay in the current module indefinitely; no reminder or UI navigation implies completion.

## 15. Public command and query contracts

Exact command names may be namespaced during implementation, but the following behavior must exist.

### 15.1 Source and set commands

- `source.asset.create`
- `source.version.upload`
- `source.version.extract`
- `source_set.create`
- `source_set.version.commit`
- `source_set.lock`
- `module_input_bundle.version.commit`
- `module_input_bundle.lock`

### 15.2 Journey and handoff commands

- `journey.create`
- `journey.exit.change`
- `journey.stop`
- `journey.resume`
- `handoff.create`
- `handoff.review.resolve`
- `handoff.approval.resolve`
- `handoff.withdraw`
- `handoff.consume`

### 15.3 Assess commands

- `assess.evidence.extract`
- `assess.candidate.review`
- `assess.candidate.apply.preview`
- `assess.candidates.apply`
- `assess.conflict.resolve`
- existing Assess save/finalize/review/Govern commands

### 15.4 Studio and template commands

- `studio.template.create`
- `studio.template.revise`
- `studio.template.review.resolve`
- `studio.template.approval.resolve`
- `studio.generation.request`
- existing artifact revise/review/approval commands

### 15.5 Delivery and Monitor commands

- `delivery.package.create.manual`
- `delivery.item.review`
- `delivery.package.revision.commit`
- `delivery.package.review.resolve`
- `delivery.package.approval.resolve`
- `monitor.baseline.create`

Queries return safe labels, lifecycle states, version labels, counts, citations, eligibility, and actions. They do not expose raw storage paths, provider references, secret fingerprints, source hashes, or cross-tenant existence.

Stable client error classes include:

- `PERMISSION_DENIED`;
- `RESOURCE_NOT_FOUND` with non-disclosing behavior;
- `RESOURCE_STALE`;
- `SOURCE_SET_LIMIT_EXCEEDED`;
- `SOURCE_VERSION_NOT_READY`;
- `SOURCE_COVERAGE_INCOMPLETE`;
- `MODULE_ROUTE_NOT_ALLOWED`;
- `HANDOFF_NOT_ELIGIBLE`;
- `HANDOFF_STALE`;
- `CONFLICT_UNRESOLVED`;
- `TEMPLATE_NOT_APPROVED`;
- `PROVIDER_ROUTE_UNAVAILABLE`;
- `BUDGET_EXHAUSTED`;
- `COMMAND_IN_PROGRESS`; and
- `RECEIPT_FINALIZATION_FAILED`.

## 16. Transaction, concurrency, and idempotency law

- Source-set version creation and all member rows commit atomically.
- Bundle locking rejects any source version that is unparsed, failed, deleted for new use, cross-workspace, or changed from its manifest.
- Candidate batch application creates one Assess draft version or none.
- Conflict resolution and resulting draft update commit atomically.
- Handoff consumption creates exactly one target draft/package and effect record.
- Delivery package revision and its item versions commit atomically.
- Monitor baseline creation validates the exact current approved package and canonical accepted-item set in one transaction.
- Every aggregate mutation requires `expectedVersion` and actor-scoped idempotency.
- Same action/same binding replays one result. Same key/changed binding conflicts.
- Reordering source members, changing provider/model/template, changing route policy, or changing any source version changes the request hash.
- Current authorization is rechecked before new effects and before replay disclosure.
- External provider calls remain non-atomic, surrounded by durable job/receipt state, one execution plan, lease/fence recovery, safe effect evidence, and reconciliation.

## 17. Unified BYOK and cost control

### 17.1 Certified provider matrix

First-class adapters:

- OpenAI;
- Azure OpenAI;
- Anthropic/Claude;
- Google Gemini;
- Groq; and
- generic OpenAI-compatible, restricted to a server allowlist.

“Supported provider” means the provider has passed its complete lifecycle, request construction, response parsing, error, timeout, redirect, budget, response-loss, and secret-hygiene matrix. A type-union entry alone is not support evidence.

### 17.2 One gateway

Assess extraction, Studio generation/refinement, and any optional Delivery drafting route use the same server-only gateway for:

- tenant/workspace and actor authority;
- capability and model allowlist;
- exact provider configuration and endpoint;
- tenant-bound secret resolution;
- validation freshness;
- route-role authorization;
- prompt/template versions;
- budget reservation;
- provider attempt lifecycle;
- sanitized audit; and
- response-loss reconciliation.

Legacy DocsForge, Studio, or refinement paths may not bypass this gateway. Migration requires parity tests before the legacy provider path is disabled.

### 17.3 Atomic budget reservation

Replace read-then-compare budget checks with atomic reservation/settlement:

1. reserve request and maximum token allowance under a locked tenant/provider/capability budget row;
2. allow the provider effect only after reservation commits;
3. settle actual usage after a confirmed response;
4. release or expire unused reservation safely after deterministic pre-call failure;
5. retain uncertain reservations through response-loss reconciliation; and
6. make exact replay consume no second budget.

With one request remaining and two concurrent attempts, exactly one may call a provider.

### 17.4 Real-provider testing boundary

Automated and browser acceptance uses deterministic mocks. Optional real-provider smoke testing requires separate approval and must:

- be explicitly enabled per provider;
- use synthetic, non-sensitive input;
- make at most one bounded request per approved provider/capability;
- enforce a small input/output token cap and abort when cost cannot be predicted;
- record only sanitized usage and response hashes; and
- never persist or print a key.

## 18. Prompt-injection and unsafe-content containment

- Transcript content, filenames, manual briefs, and tenant template structures are untrusted data.
- System instructions and source content use separate structured fields and explicit delimiters.
- Source text cannot select provider, model, endpoint, capability, tool, route, secret, or approval outcome.
- Provider output must pass strict JSON/schema validation, Unicode scalar validation, size limits, allowed candidate fields, and server-side grounding.
- Embedded instructions, encoded text, hostile HTML/Markdown, secret requests, fake system messages, and cross-source poisoning are adversarial fixtures.
- Generated Markdown/HTML/SVG remains structurally sanitized before display or rendition.
- Provider output that cannot be grounded or validated fails truthfully; there is no fallback success.

## 19. Required UI and interaction design

### 19.1 Module chooser and Journey panel

The workspace home presents module cards rather than a forced wizard:

| Module | Start choices | Continue choices |
| --- | --- | --- |
| Assess | Manual, transcripts, or both | Continue draft, review, request Studio handoff |
| Studio | Own transcripts, approved Assess handoff, both, or manual brief | Continue document, review/approve, request Delivery handoff |
| Delivery | Approved Studio handoff or manual package | Review/edit package, request Monitor baseline |
| Monitor | No authoring start | View approved baselines |

A collapsible Journey panel shows chosen entry, desired exit, current module, lineage badge, optional next action, and completed handoffs. It never becomes domain authority.

### 19.2 Source Library

Required controls:

- Upload text source / Paste text;
- current and historical versions;
- safe filename, format, size, parser state, and created date;
- `Use in Assess` and `Use in Studio` actions;
- reuse-exact-version and upload-new-version choices;
- “Used by” counts limited to the authorized workspace;
- source detail with transcript preview, timestamp anchors, and no storage path; and
- archive/soft-delete behavior with dependency warning.

Required states:

- loading, empty, uploading, upload committed;
- extraction pending, extracted, partial failure;
- malformed, unsupported, OCR required;
- duplicate/reuse available;
- stale, permission denied, revoked, read-only, offline, expired session; and
- committed-but-projection-reload-failed.

### 19.3 Source-set composer

Assess and Studio each receive a separate composer with:

- multi-select source list;
- ordered selected list;
- primary/supporting/contradictory/reference role;
- extracted-character and source-count budget;
- add, remove, reorder, replace-version;
- dirty/unsaved indicator;
- manifest preview;
- `Lock source set` action; and
- version history.

The UI must make it obvious that changing the Studio set does not change the Assess set.

### 19.4 Candidate and conflict review

Candidate cards/table provide:

- source label/version and timestamp/locator;
- field/concept and proposed value;
- confidence as advisory only;
- Accept, Edit, Reject;
- Apply target and preview;
- supporting/contradicting source count;
- manual-value comparison; and
- resolution/rationale controls.

Bulk actions may select candidates, but every candidate must expose its assertion result and source anchor. Aggregate extraction success cannot imply candidate acceptance.

### 19.5 Studio Source Coverage and editor

The Studio screen separates:

- Assess-approved input;
- Studio-only transcript inputs;
- manual brief;
- approved template/version; and
- assumptions/unresolved sources.

Badges use both text and icon, not color alone:

- `Assessed`;
- `Assessed + Studio supplements`;
- `Not assessed - planning only`;
- `Source changed - regenerate or retain old version`; and
- `Provider unavailable`.

The structured editor, preview, revision history, review, approval, rejection, and rendition/download controls must be keyboard accessible and responsive.

### 19.6 Handoff Inbox and Outbox

Every module exposes:

- Outbox: eligible, requested, changes requested, rejected, approved, consumed, withdrawn, stale;
- Inbox: source module, safe resource/version label, lineage, target, requestor, approval requirements, blockers;
- Preview, Accept, Request changes, Reject, Withdraw, and Start target draft actions as authorized.

The confirmation dialog states exactly what will be created and that no automatic future handoff will occur.

### 19.7 Delivery and Monitor

Delivery uses a responsive list/table with item detail drawer, inline safe editing or modal editing, source citation, version diff, decision status, and package blockers. Monitor uses summary cards and drill-down only; no editable task controls are rendered.

### 19.8 Global UI quality requirements

- Complete keyboard operation and logical focus return.
- Visible focus and non-color status communication.
- Accessible labels, descriptions, error associations, and dialog semantics.
- Error summary moves focus without losing draft input.
- Zero serious/critical axe findings.
- No horizontal overflow on Pixel 7, 200% zoom, or supported desktop widths.
- Candidate and item lists use virtualization or pagination at high volume without hiding status or citations.
- Loading, empty, failed, offline, stale, revoked, blocked, read-only, expired, in-progress, replay, and committed/reload-failed states are distinct.
- Success appears only after durable server confirmation.

## 20. Deterministic mock-data design

Tracked fixtures, schemas, and expected oracles belong under:

```text
testing/process-lifecycle/
  fixtures/
    identities/
    sources/assess/
    sources/studio/
    templates/
    providers/
    expected/
  contracts/
  scenarios/
```

Run-specific sanitized evidence belongs only under an ignored path. For PR B the implemented contract is:

```text
output/process-lifecycle-pr-b/<base-sha>/<working-tree-digest>/<run-attempt>/
```

The local attempt name is generated with a `local-` prefix and binds the checked-out `headGitSha` plus the scoped working-tree digest. Exact-head CI uses the same path shape, binds the pull-request head as `PR_B_EXACT_HEAD_SHA`, and uses the GitHub workflow run attempt as the final path segment; the manifest also binds the workflow run ID. A local pre-commit run is not exact-head CI evidence.

### 20.1 Identity fixtures

- Organization A with Workspace A1 and A2.
- Organization B with Workspace B1 and B2.
- Creator/author.
- Source reviewer/editor.
- Independent reviewer.
- Final approver.
- Delivery owner.
- Read-only viewer.
- Organization administrator.
- Cross-workspace adversary.
- Cross-tenant adversary.
- Revoked actor and stale authorization versions.

Creator, independent reviewer, and final approver remain distinct where separation of duties applies.

### 20.2 Transcript fixtures

| Fixture | Module use | Expected behavior |
| --- | --- | --- |
| `ASSESS-CLEAN-01.vtt` | Assess only | grounded normal discovery candidates |
| `ASSESS-CONTROLS-02.srt` | Assess supplement | additional controls and approval facts |
| `ASSESS-INCOMPLETE-03.txt` | Assess | missing systems/exceptions require manual completion |
| `ASSESS-CONFLICT-04.vtt` | Assess | contradicts volume/control facts and creates explicit conflict |
| `STUDIO-REQ-01.vtt` | Studio only | requirements workshop not used by Assess |
| `STUDIO-CORRECTION-02.txt` | Studio supplement | corrects one document requirement with source-specific lineage |
| `SHARED-CONTEXT-01.vtt` | both by explicit selection | exact source version reused in independent sets |
| `PROMPT-INJECTION-01.vtt` | Assess/Studio adversarial | embedded instructions treated only as data |
| `MALFORMED-01.bin.txt` | intake adversarial | deterministic malformed/unsupported rejection |
| `DUPLICATE-01-copy.vtt` | intake | exact hash produces reuse decision, not hidden duplicate authority |

### 20.3 Source-set scenarios

- single transcript;
- multiple ordered transcripts;
- Assess and Studio disjoint sets;
- partially overlapping sets;
- exact same versions selected independently;
- duplicate bytes under different filenames;
- one failed member in a multi-source set;
- conflicting sources;
- source membership changed after a locked run;
- one source upgraded while an older artifact remains valid;
- unselected source proving zero influence; and
- cross-tenant/cross-workspace substitution.

### 20.4 Template fixtures

- system BRD, FRD, and PDD;
- approved custom requirements template;
- approved custom process template;
- draft/unapproved template;
- retired template;
- cross-workspace template;
- malicious template fields/instructions; and
- incompatible renderer/schema version.

### 20.5 Provider fixtures

For each certified provider:

- validation success;
- normal structured response;
- timeout/abort;
- HTTP 429;
- HTTP 5xx;
- malformed JSON;
- missing/extra fields;
- model substitution;
- token/usage mismatch;
- response loss before and after effect evidence;
- unsafe redirect;
- endpoint/config substitution;
- revoked/rotated secret reference; and
- atomic budget exhaustion.

## 21. Acceptance matrix

### 21.1 Paths and user choice

- `PATH-001`: Assess-only journey creates zero Studio, Delivery, or Monitor resources.
- `PATH-002`: Studio-only journey uses only its selected Studio set and is labelled not assessed/planning only.
- `PATH-003`: Studio-only approved artifact can hand off to Delivery only when route policy permits; lineage remains not assessed.
- `PATH-004`: Delivery-only manual package creates no fabricated Assess or Studio ancestry.
- `PATH-005`: Full Assess-to-Studio path may use completely different Studio transcripts.
- `PATH-006`: Full path may reuse a source only when that exact source version is explicitly selected in both sets.
- `PATH-007`: Omitting or rejecting a handoff produces zero downstream mutation.
- `PATH-008`: Changing desired exit changes no domain resource.

### 21.2 Source sets and causality

- `SRCSET-001`: one transcript creates one immutable set version.
- `SRCSET-002`: multiple transcripts retain declared order, roles, hashes, and anchors.
- `SRCSET-003`: duplicate and reordered members follow deterministic policy.
- `SRCSET-004`: membership change creates a new version and stales only unconsumed dependants.
- `SRCSET-005`: unselected sources have zero effect on provider request and downstream output.
- `SRCSET-006`: one exact source version may be reused safely by independent Assess and Studio sets.
- `SRCSET-007`: failed/missing member blocks locking until retried or explicitly removed.
- `SRCSET-008`: cross-tenant/workspace selectors are non-disclosing and create no effect.

### 21.3 Assess

- `ASSESS-TR-001`: VTT and SRT produce grounded, source-specific candidates.
- `ASSESS-TR-002`: multiple transcripts preserve distinct anchors and review states.
- `ASSESS-TR-003`: Accept/Edit/Reject is available in UI and persists immutable history.
- `ASSESS-TR-004`: user-selected Apply targets create the expected draft structures atomically.
- `ASSESS-TR-005`: ambiguous candidates remain evidence-only.
- `ASSESS-TR-006`: transcript/manual disagreement creates an explicit conflict; neither silently wins.
- `ASSESS-TR-007`: manual-only fields persist alongside transcript-applied structures.
- `ASSESS-TR-008`: scoring uses only committed user-confirmed values and the unchanged score version.
- `ASSESS-TR-009`: prompt injection cannot alter scoring, authority, route, or provider instructions.
- `ASSESS-TR-010`: incomplete sources cannot create false completion.

### 21.4 Studio and templates

- `STUDIO-TR-001`: Studio source set may be disjoint from the Assess source set.
- `STUDIO-TR-002`: exact approved Assess handoff plus selected Studio supplements creates one hashed source package.
- `STUDIO-TR-003`: direct Studio input has no fabricated Assess ancestry.
- `STUDIO-TR-004`: exact approved template ID/version/hash governs generation.
- `STUDIO-TR-005`: BRD, FRD, PDD, and approved custom outputs satisfy schema.
- `STUDIO-TR-006`: draft, retired, incompatible, or cross-workspace template fails before provider call.
- `STUDIO-TR-007`: user edit creates an immutable revision and survives reload.
- `STUDIO-TR-008`: every generated section has citations or an explicit non-source label.
- `STUDIO-TR-009`: source/bundle/template changes make an unapproved run stale without rewriting old artifacts.
- `STUDIO-TR-010`: review, request changes, reject, approve, and final reject enforce separation of duties.

### 21.5 Handoffs

- `HANDOFF-001`: approved source exposes but does not invoke Request handoff.
- `HANDOFF-002`: target preview binds exact upstream and destination versions.
- `HANDOFF-003`: target reject/request-changes creates no target draft.
- `HANDOFF-004`: approved consumption creates exactly one target draft and effect.
- `HANDOFF-005`: upstream change before consumption makes handoff stale.
- `HANDOFF-006`: source change after consumption preserves historical target and advertises a new version separately.
- `HANDOFF-007`: direct-path planning-only classification survives every handoff.
- `HANDOFF-008`: wrong target workspace and revoked actor are non-disclosing.

### 21.6 Delivery and Monitor

- `DELIVERY-TR-001`: exact approved Studio version creates a deterministic proposed item list.
- `DELIVERY-TR-002`: every generated item binds document version/hash and section locator.
- `DELIVERY-TR-003`: item edit creates a new version rather than mutating history.
- `DELIVERY-TR-004`: each proposal can be accepted or rejected with rationale.
- `DELIVERY-TR-005`: unresolved, rejected, changes-requested, stale, or blocked package cannot create Monitor baseline.
- `DELIVERY-TR-006`: direct/manual package retains planning-only/no-assessment lineage.
- `MONITOR-TR-001`: exact approved package and accepted canonical item set create one baseline.
- `MONITOR-TR-002`: baseline never implies live telemetry, completion, or execution.
- `MONITOR-TR-003`: Monitor renders no transcript or work-item mutation controls.
- `MONITOR-TR-004`: main Monitor surface and Enterprise projection show the same canonical baseline identity/status.

### 21.7 Authority, recovery, security, and providers

- `AUTH-001`: cross-tenant selectors return one non-disclosing unavailable result.
- `AUTH-002`: cross-workspace selectors create no receipt, audit, provider call, or domain effect.
- `AUTH-003`: stale authority permits only bounded authorized refresh using the same action identity.
- `AUTH-004`: revoked authority permits no mutation or terminal receipt disclosure.
- `IDEMP-001`: exact retry produces one receipt and one domain effect.
- `IDEMP-002`: response loss reconciles without duplicate generation, promotion, or handoff consumption.
- `IDEMP-003`: changed binding under the same key conflicts.
- `BUDGET-001`: with one request remaining and two concurrent attempts, exactly one provider call occurs.
- `BUDGET-002`: cancellation, timeout, settlement uncertainty, and replay do not double spend.
- `PROVIDER-001` through `PROVIDER-005`: OpenAI, Azure OpenAI, Anthropic, Gemini, and Groq pass complete adapter contracts.
- `PROVIDER-006`: allowlisted OpenAI-compatible endpoint passes; unsafe endpoint fails before network.
- `PROVIDER-007`: timeout, 429, 5xx, malformed output, model substitution, and invalid usage remain truthful failures.
- `PROVIDER-008`: no raw secret/source/provider payload enters evidence, projection, logs, storage, or built output.
- `PROVIDER-009`: Assess and Studio use the same tenant-bound provider registry and atomic budget authority.
- `INJECTION-001`: source prompt injection cannot alter system policy or access tools/secrets.

### 21.8 Accessibility and performance

- `A11Y-001`: full keyboard operation with visible focus and logical return.
- `A11Y-002`: inputs, conflicts, errors, statuses, citations, and dialogs have accessible relationships.
- `A11Y-003`: zero serious/critical axe findings on Desktop Chrome and Pixel 7.
- `A11Y-004`: no horizontal overflow at Pixel 7 or 200% zoom.
- `PERF-001`: cached module route is usable within 2.5 seconds in the controlled CI browser profile.
- `PERF-002`: 200 candidates and 250 work items retain interaction p95 below 200 ms in the controlled profile.
- `PERF-003`: 100-candidate batch application remains atomic within the approved CI budget.
- `PERF-004`: maximum permitted source sets remain bounded in memory, provider calls, reservations, and total tokens.

## 22. Test layers and proposed commands

Add:

```text
npm run test:transcript-source-sets
npm run test:transcript-flow:domain
npm run test:transcript-flow:api
npm run test:transcript-flow:providers
npm run test:transcript-flow:postgres
npm run test:transcript-flow:browser
npm run test:transcript-flow:adversarial
npm run test:transcript-flow:a11y
npm run test:transcript-flow:performance
npm run test:transcript-flow:evidence
```

Retained gates:

```text
npm run test:enterprise-intelligence
npm run test:migrations:enterprise-intelligence:postgres
npm run test:browser:enterprise-intelligence
npm run test:pr1d
npm run test:browser:pr1d
npm run test:studio-artifacts
npm run test:migrations:studio-artifacts
npm run test:browser:studio-artifacts
npm run test:full-platform:provider-mocked
npm run test:full-platform:campaign
npm run typecheck
npm run typecheck:edge
npm run test:ai-boundary-static
npm run test:secret-hygiene
npm run build
git diff --check
```

Each PR runs its focused suite plus every retained suite that owns a touched boundary. The final PR runs the complete matrix.

## 23. Evidence contract

Every individual Test-ID result records:

- exact Git SHA;
- workflow path, run ID, and run attempt;
- canonical execution command and controlled environment;
- assertion IDs and per-assertion result;
- fixture, persona, organization, and workspace;
- source-set ID/version and ordered source-version hashes;
- candidate IDs, versions, and locators;
- Assess case/version, confirmed inputs, score/rule versions;
- handoff edge and exact upstream/target resource versions/hashes;
- template, Studio artifact, and revision versions;
- Delivery package/version and exact canonical accepted-item set;
- Monitor baseline version;
- provider identity, adapter version, route, model, prompt version, and sanitized usage; and
- result: `passed | failed | blocked | not_run`.

Rules:

- A suite exit code cannot synthesize Test-ID PASS.
- A green provider mock cannot prove a real provider.
- Source/local/CI proof cannot prove hosted deployment.
- No evidence contains raw transcript text, keys, tokens, provider payloads, signed URLs, raw logs, storage paths, customer data, or infrastructure identifiers.

## 24. Implementation sequence and substantial PR boundaries

Use three substantial vertical PRs. Do not create plan/evidence/closure micro-PRs.

### PR A - Governed source sets, unified BYOK, and transcript-assisted Assess

Acceptance disposition (2026-08-28): PR #255 accepted final head `460c44864b9d240321e727945411ced51dd0fe30` and merged as accepted-main baseline `11e670003a73b0ab5a28650b70afac4b267760f4`. The accepted slice isolates source/source-set/input-bundle reads from Assess-owned collections; makes real selector derivation and conflict-candidate preclaim mandatory; binds exact historical source-set-version, bundle-version, extraction-job, binding, candidate, real preview-batch, and expected Assess-draft selectors; invalidates only unconsumed dependants; preserves consumed history and initial default-off legacy single-source review; and is bound through 33 exact commands, 194 passed assertion markers, six explicit `not_run` results, and 68 source-provenance entries. `AUTH-001` through `AUTH-004` are owned only by their exact API assertions, and executed evidence preserves assertion-emitted runtime context rather than attaching registry context. `AUTH-001` and `AUTH-002` additionally require exact request/authority and assertion-completion ledgers, with producer mutations proving that omitted completions or substituted traces cannot retain a green marker. Successive exact-head runs exposed PostgreSQL routine-identity normalization, stale hosted migration marker, and generic-browser-suite ownership defects; the accepted follow-ups normalize only visibility-dependent `public` composite types, preserve other schema qualifications, advance the fail-closed hosted marker through a new forward migration, and bind the transcript specification exclusively to its controlled dedicated harness. `IDEMP-002-A` and `PROVIDER-009-A` are accepted PR A assertions; `IDEMP-002-B` and `PROVIDER-009-B` are owned by active PR B. `PERF-001`, `PERF-002-B`, `PERF-003`, and `PERF-004` remained truthful `not_run` in PR A because no owned cached-route metric, 250-work-item execution, approved numeric PostgreSQL duration, or end-to-end memory/provider/token budget existed in that slice. All 15 applicable workflows, the Netlify preview, and a fresh independent review passed; hosted/live infrastructure, real providers, deployment, pilot, production, security certification, and compliance certification were not run.

Delivers:

- reusable Source Library and source-set/input-bundle authority;
- source-set and Candidate Review UI;
- unified provider gateway, first-class Groq, provider mocks, and atomic budgets;
- Assess application previews, batch apply, candidate Edit UI, and conflict resolution;
- journey entry/stop projection for Assess;
- feature flags, migrations, rollback, and exact evidence.

Acceptance boundary:

- all `SRCSET-*`, `ASSESS-TR-*`, `AUTH-*`, `IDEMP-*`, `BUDGET-*`, `PROVIDER-*`, and injection tests owned by this slice pass;
- scoring regression proves zero rule/formula drift;
- existing single-source records remain readable;
- direct provider/legacy bypass is unavailable for migrated capabilities.

Rollback:

- disable new extraction routes and source-set writes;
- retain read-only sources, set versions, candidates, conflicts, receipts, and Assess versions;
- preserve existing legacy single-source projection read-only;
- correct schema only by additive forward migration.

### PR B - Independent multi-source Studio, governed templates, and optional Assess handoff

Delivers:

- Studio generalized source package and safe migration/backfill;
- direct Studio, Assess-derived, and hybrid source modes;
- governed tenant-template lifecycle and Template Manager UI;
- source coverage review and business-friendly structured editor;
- optional Assess-to-Studio handoff Inbox/Outbox and target acceptance;
- Studio provider generation through the unified BYOK gateway;
- complete Studio review/approval/rejection, stale-source behavior, and evidence.

Acceptance boundary:

- all `PATH-*` relevant to Assess/Studio, `STUDIO-TR-*`, `HANDOFF-*` for Assess/Studio, accessibility, and migration tests pass;
- existing canonical Studio artifacts retain exact ancestry and projections;
- direct Studio artifacts remain durably not-assessed/planning-only;
- changed source/template versions cannot rewrite an approved artifact.

Rollback:

- disable direct/multi-source Studio and tenant-template writes;
- retain read-only generalized source packages, templates, artifacts, reviews, and approvals;
- keep existing Assess-derived artifacts operational through the accepted path;
- no destructive migration rollback.

### PR C - Editable Delivery proposals, optional Studio handoff, and canonical Monitor baseline

Delivers:

- generalized Delivery source packages and safe migration/backfill;
- direct/manual Delivery entry;
- optional Studio-to-Delivery handoff and target acceptance;
- canonical item list, edit/accept/reject versions, diffs, review, changes requested, approval, and rejection;
- canonical Monitor projection in the main Monitor surface;
- exact planning-only/assessment labels;
- complete causal browser, PostgreSQL, adversarial, evidence, and human-test seed.

Acceptance boundary:

- all `DELIVERY-TR-*`, `MONITOR-TR-*`, remaining `PATH-*`, `HANDOFF-*`, end-to-end, accessibility, and performance gates pass;
- a reviewer-blocked package exposes recovery only for its exact current package/version/aggregate identity; the production workspace loads the complete bounded descendant set, binds every current descendant selector, authors only explicitly selected materially changed descendants, and rejects unchanged, partial-knowledge, stale, foreign, replayed, or substituted input atomically;
- a committed recovery creates a new immutable package version and fresh descendant decision state; its canonical result contains exactly one unique new item-version identity per expected aggregate and reuses no predecessor item-version identity from the complete set, so package review and approval must be repeated before any new Monitor baseline becomes eligible;
- draft/rejected/stale/unresolved packages cannot affect Monitor;
- Monitor remains read-only and shows exact lineage;
- actor, organization, or workspace changes synchronously clear every secret, private-file byte, provider/source/route selector, candidate/draft selection, preview, pending action, status, and error before the new scope renders, and invalidate every in-flight file/mutation/Delivery/Monitor completion before it can repaint or mutate that scope; requested, outer, and nested Delivery/Monitor UUID scopes must match semantically;
- two lost command responses lock fresh-key mutation until an authoritative reload reconciles the possibly committed effect; and
- currently authorized exact committed receipt replay succeeds after mutable feature disablement or global read-only activation, while revoked authority still denies disclosure and new keys create no receipt or effect;
- the manifest, command results, every passed assertion, and every `not_run` record bind the independently derived canonical workflow path, run ID, attempt, accepted base, exact head, execution classification, canonical evidence path, command/source/fixture/persona/runtime identity, and relevant record digest; base-tracked deletion or rename fails scope collection closed, and local evidence cannot satisfy a hosted gate; and
- the full retained repository matrix passes.

Rollback:

- disable new handoff consumption, item revision, and baseline creation;
- retain committed packages, item history, approvals, receipts, and baselines read-only;
- retain existing Studio-to-Delivery projection read-only;
- use additive forward fixes only.

## 25. Migration and compatibility requirements

Every schema PR must prove:

- fresh full canonical migration chain;
- accepted-main-to-feature upgrade;
- populated upgrade with existing source, Assess, Studio, Delivery, and Monitor records;
- dirty/partial-state atomic rejection;
- exact composite tenant/workspace foreign keys;
- forced RLS and authenticated projection ACLs;
- service-only mutation RPCs;
- idempotent migration behavior where supported;
- query/client DTO compatibility;
- read-only feature-disabled behavior; and
- cleanup of disposable PostgreSQL resources.

Existing records are never relabelled as transcript-derived or assessed. Backfills derive only facts already proven by current immutable ancestry.

## 26. Feature flags, rollout, and rollback

Server-controlled tenant/workspace flags:

- `transcript_source_sets_enabled`;
- `assess_multisource_apply_enabled`;
- `unified_byok_gateway_enabled`;
- provider-specific enable flags;
- `studio_multisource_enabled`;
- `studio_tenant_templates_enabled`;
- `module_handoffs_enabled`;
- `direct_studio_planning_enabled`;
- `direct_delivery_planning_enabled`;
- `delivery_item_review_enabled`; and
- `monitor_approved_baseline_enabled`.

All new paths default off for existing tenants until migration and acceptance evidence pass. Client flags may hide UI but cannot grant authority.

Rollout order:

1. source/domain/unit and static security gates;
2. disposable PostgreSQL fresh/upgrade/dirty/adversarial gates;
3. deterministic mocked-provider API tests;
4. Desktop and Pixel browser tests;
5. exact-head CI evidence;
6. resettable synthetic non-live environment;
7. controlled human testing; and
8. any hosted/live or real-provider validation only after separate approval.

Global rollback is server mutation disablement or read-only maintenance. Preserve immutable history and in-flight reconciliation. Never restore browser AI, browser keys, silent mock fallback, or vulnerable authority.

## 27. Controlled-human-testing plan

### 27.1 Required seeded journeys

1. **Assess only:** two Assess transcripts plus manual completion; resolve a conflict; approve; decline Studio handoff.
2. **Studio only:** two different Studio transcripts; choose custom template; edit/review/approve; stop.
3. **Assess plus different Studio sources:** approve Assess, request/accept Studio handoff, add disjoint Studio supplements, generate and approve.
4. **Full governed journey:** Assess -> Studio -> Delivery -> Monitor with distinct author/reviewer/approver personas.
5. **Direct planning journey:** direct Studio -> Delivery -> Monitor, visibly not assessed/planning-only.
6. **Direct Delivery:** manual work package -> review/approval -> read-only Monitor baseline.
7. **Negative journey:** reject handoff and prove no downstream resource.
8. **Recovery journey:** simulate response loss, reload, stale authorization, source change, and read-only mode.

### 27.2 Human-test evidence

Use only synthetic identities and sources. Record:

- scenario/Test IDs;
- persona and workspace;
- start/end timestamps;
- exact build SHA and environment label;
- selected source/version labels;
- user decisions and sanitized result references;
- defects with reproduction steps; and
- final disposition.

Do not capture keys, raw transcript content, storage identities, signed URLs, raw logs, or provider payloads.

### 27.3 Ready-to-start gate

Controlled human testing may begin only when:

- every planned automated Test ID has an independently bound result;
- zero test failures and zero unexplained blocked cases remain;
- exact-head PostgreSQL, provider-mock, Desktop, Pixel, accessibility, performance, security, secret-hygiene, build, and diff gates pass;
- causality from selected source sets to every downstream result is machine-verifiable;
- unselected sources and omitted/rejected handoffs demonstrably create no downstream effect;
- tenant/workspace, stale/revoked authority, concurrency, prompt injection, and response-loss cases pass;
- unsupported providers are visibly unavailable;
- seed/reset tooling is repeatable;
- creator, reviewer, and approver accounts are distinct; and
- known limitations clearly state text-only ingestion, planning-only direct paths, no execution, no live telemetry, and no readiness claim.

The PR remains Draft until controlled users complete the approved script and material defects are fixed and retested.

## 28. Definition of done

This workstream is complete only when:

1. independent one-or-many Assess and Studio source sets are implemented and proven;
2. different/overlapping/shared source scenarios behave exactly as selected;
3. candidates can be edited, rejected, applied, and conflict-resolved in the UI;
4. manual Assess completion and unchanged deterministic scoring are proven together;
5. direct, Assess-derived, and hybrid Studio source modes are explicit and truthful;
6. governed user templates and the structured editor are complete;
7. optional handoffs never occur automatically and retain exact lineage;
8. Delivery exposes the canonical editable/approvable item list;
9. Monitor reads only exact approved package versions and remains read-only;
10. platform AI capabilities use the unified certified BYOK gateway and atomic budgets;
11. all feature and retained tests pass with exact per-assertion evidence;
12. rollback/read-only behavior is executed and recorded;
13. controlled human testing completes with synthetic data and all material defects retested; and
14. no hosted, deployment, production, security-certification, compliance, or automation-execution claim is made without separately executed evidence.

## 29. Known unknowns and separate approvals

- Exact provider/model choices and pricing are runtime configuration and require current verification before any real-provider smoke test.
- Hosted Storage, Vault, Edge, Supabase, Netlify, deployment, and domain behavior remain not run in this plan.
- Real provider calls, live secrets, deployment, hosted tenant isolation, and customer data require separate explicit approval.
- Audio/video transcription, remote meeting integration, external issue-tracker sync, live telemetry, and task execution require new scope approval and their own threat model.
- Any future execution path must require approved Assess ancestry even when planning-only direct Studio/Delivery paths exist.

No implementation, migration, provider call, secret inspection, deployment, commit, push, or PR action is authorized by this planning document alone.
