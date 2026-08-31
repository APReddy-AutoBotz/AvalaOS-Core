# Studio Governed Artifact Authority

Status: the foundational Studio aggregate boundary is accepted through PR #216; governed multi-source transcript PR A is accepted through PR #255 on `main` at `11e670003a73b0ab5a28650b70afac4b267760f4`; governed multi-source transcript PR B is the active additive implementation boundary. PR 1G remains accepted. This document is source architecture, not deployment or hosted-readiness evidence.

## Scope and trust boundary

PR A converts one accepted PR 1E Studio handoff into one canonical artifact aggregate for each `brd`, `frd`, or `pdd` type. Each aggregate has append-only structured-JSON versions, durable generation attempts, independent human review, separate human approval, and deterministic supersession. The browser is a strict projection and command client. It cannot supply source ancestry, provider instructions, templates, content schemas, renderer authority, approvals, or internal completion operations.

The server derives the exact organization, workspace, case, source case version and number, decision and decision version, approved review resolution, Govern resolution, Studio handoff, package hash, schema version, rule-set version, review schema version, and review sequence from accepted PR 1E relations. Composite keys retain that ancestry. Missing, stale, superseded, unresolved, unapproved, or tenant-mismatched ancestry fails closed without existence disclosure.

## Provider staging

Provider execution is an external effect and is never represented as part of a PostgreSQL transaction. A human command first reauthorizes, claims actor-scoped idempotency, selects an immutable system template, creates or locks the aggregate, and commits a `requested` attempt with receipt and audit. A service-only handler then loads the committed source and template, invokes the governed provider, and treats output as untrusted. Completion validates schema, type, size, and content before atomically appending one draft and marking the attempt completed. Failure records only a sanitized stable code and creates no artifact version. Provider retries cannot duplicate a committed version.

PR B replaces the legacy Studio-only provider path with the accepted Enterprise unified gateway. The exact provider set is derived from the canonical registry; tenant-bound secret resolution, endpoint/model allowlists, atomic reservation and settlement, framed untrusted source/template input, strict output/model/usage validation, cancellation/timeout handling, durable staging, execution fences, and response-loss reconciliation are mandatory. A claimed generation binds the exact source package, approved template version/hash, aggregate head, and approved head. Late or stale completion cannot move a newer human-controlled or approved head.

For a `manual_brief` package, the browser sends raw text only in the source-package creation command. An authorized generation command sends only the durable package and version selectors; the service-only generation handler retrieves the committed brief from its private forced-RLS relation and sends it to the governed provider inside the same framed untrusted input boundary as other source material. Authenticated source-package, artifact, workspace, generation-plan, attempt, receipt, and audit projections never return the raw brief.

An existing `reserved`, `uncertain`, or `settled` budget reservation is authoritative across Studio lease expiry and disables a second provider effect. Takeover may enter reconciliation only; a deterministic pre-effect `released` reservation may transfer ownership solely through an explicit atomic fence transition. Claim, reserve, stage, settle, release, and reconciliation paths use one lock order.

## PR B source packages, handoffs, and templates

Every new or backfilled canonical aggregate binds one immutable `studio_artifact_source_package` in exactly one mode: `assess_handoff`, `direct_transcript_bundle`, `assess_plus_transcript_bundle`, or `manual_brief`. Existing aggregates are backfilled only as `assess_handoff` from exact retained PR 1E ancestry; no legacy row is inferred to be transcript-derived or assessed. Direct Studio packages are durably `not_assessed` and `planning_only`. Manual packages expose zero selected and zero covered sources in both artifact-v2 and workspace projections; browser presentation must mirror that 0/0 truth. Every generation attempt and artifact version retains its exact package and template identities/hashes, so later source/template versions never relabel prior content.

An Assess handoff is optional and never auto-consumed. Request, target review, changes requested, rejection, withdrawal, approval when policy requires it, and one-time consumption are distinct server-authoritative states. Only current same-workspace accepted consumption may create the exact target source package and generation binding. Rejected, stale, expired, withdrawn, unauthorized, foreign, or mismatched handoffs create no document or provider effect.

Consumption serializes against the exact upstream Assess case before the final currentness decision. It re-reads currentness after acquiring that lock so a newer governed Assess commit cannot race a stale target package into existence. The lock order must not introduce an inverse edge with the Assess producer.

System BRD/FRD/PDD versions remain supported. Tenant templates add immutable draft/review/approval/deprecation/replacement history. Only an exact approved compatible version may govern generation. A template describes bounded section structure and validation only; it cannot contain provider endpoints, headers, credentials, tools, system instructions, policy overrides, or approval authority.

Every cited transcript anchor must be a member of the exact accepted extraction/candidate manifest bound to the package. Every cited Assess anchor must be a member of an immutable server-hashed Assess anchor manifest for the selected case version. A well-formed UUID, locator, or hash is not provenance authority. Hybrid coverage de-duplicates one immutable source version that is deliberately shared by Assess and Studio before cardinality and completeness checks. Soft deletion prevents new selection but never removes a source already retained by an immutable package projection.

## Lifecycle, recovery, and people

The public PR B generation-state vocabulary is `requested`, `claimed`, `generating`, `staged`, `reconciling`, `completed`, `failed`, `stale`, and `uncertain`. The durable database attempt states are the more exact `requested`, `generating`, `response_staged`, `reconciling`, `completed`, `stale_completed`, `failed`, `cancel_requested`, `cancelled`, and `timed_out`; the retained `claimed` value is compatibility-only in the database constraint, while actual v2 execution moves an authorized lease claim directly to `generating` or `reconciling`. Command receipts independently use `claimed`, `committed`, and `failed`. A request commits the immutable source-package, template, aggregate-head, approved-head, provider-plan, effect-key, authorization-version, and timeout bindings before an external effect. A claim reauthorizes the requester, obtains one expiring lease with an exact execution token and monotonically increasing fence, and permits a provider call only when no staged response already exists. An unexpired competing claim is `COMMAND_IN_PROGRESS`; takeover after lease expiry receives a new fence.

The provider result is strictly validated and durably written as `response_staged` before settlement/finalization. A staged or interrupted finalization is reclaimed only as `reconciling`, with provider execution disabled. Completion under unchanged heads advances the current draft; a changed source package, template, aggregate head, approved head, or requested cancellation records an immutable `stale_completed` version without moving the human-controlled current head. A replay of either completion is read-only and creates no second version or provider effect.

Before any provider effect, deterministic failures may become fenced terminal `failed`. Once an effect may have occurred, staging or finalization ambiguity is reported as `uncertain` to the command boundary and remains reconciliation-owned; it is never rewritten as terminal failure. The failure RPC requires the exact token, fence, unexpired lease, an allowlisted sanitized failure code, and a non-staged/non-reconciling state. It permits terminal failure only when no reservation exists or when the exact reservation is `released` for `before_provider_effect` with no transfer pending; `reserved`, `uncertain`, `settled`, and reconciled-no-effect released states remain nonterminal and produce no attempt, audit, or recovery mutation. The attempt-to-reservation lock order is preserved. Cancellation of `requested` becomes `cancelled`; cancellation of active work becomes `cancel_requested`, preventing a late result from advancing the current head. Only the service scheduler may mark a due `requested`, `generating`, or `cancel_requested` attempt `timed_out`; callers cannot supply a deadline. Terminal cancel and timeout replay without repeating effects.

Artifact versions are `draft`, `reviewer_ready`, `in_review`, `changes_requested`, `review_rejected`, `approval_ready`, `approved`, `approval_rejected`, or `superseded`. Human revision appends a descendant draft. Review and approval always target the exact current eligible version and expected aggregate version; historical matching states are non-actionable.

The author/requester, reviewer, and final approver must be three different active, freshly authorized humans in the same organization and workspace. Provider or service identities cannot review or approve. Approving a descendant atomically supersedes the previous approved version and advances the sole current-approved pointer; the previous version remains immutable and readable.

## Capabilities and access

| Capability | Authority |
| --- | --- |
| `studio.artifacts.read` | Tenant/workspace-scoped strict read projection only |
| `studio.artifacts.generate` | Request server-controlled generation |
| `studio.artifacts.edit` | Append a human-authored descendant draft |
| `studio.artifacts.review` | Submit, assign, and resolve independent review |
| `studio.artifacts.approve` | Resolve separate final approval |

Mutation RPCs are service-role-only and independently validate active profile, organization and workspace memberships, capability, authorization version, exact ancestry, expected versions, and separation of duty. Authorization precedes receipt or resource inspection. Only the intended forced-RLS read projection is client-executable; internal helpers revoke direct `PUBLIC`, `anon`, `authenticated`, and unnecessary service-role execution.

## Legacy and later work

Existing `document_generations` records remain durable **legacy/unverified** rows. They are not accepted PR 1E descendants and cannot be reviewed, approved, exported, delivered, or treated as canonical. Enterprise Studio paths cannot write them. Clearly labelled local-demo behavior remains isolated from enterprise authority.

The earlier private-artifact PR B boundary is separately accepted through PR #217 and corrective PR #218. Governed multi-source transcript PR B preserves its aggregate/version IDs, approved pointers, rendition ancestry, Storage authority, retention, holds, deletion, and reconciliation behavior. It does not edit accepted private-artifact migrations. Generalized Studio-to-Delivery lineage remains PR C; PR B blocks direct, hybrid, and manual packages from the existing Delivery command path.

## Rollback and non-claims

Rollback is feature disablement: disable mutations and provider generation, retain a read-only projection of every committed aggregate, version, attempt, staged response, recovery event, reservation, review, approval, receipt, and audit record, and apply additive forward fixes. In-flight `claimed`, `generating`, `response_staged`, `reconciling`, or `cancel_requested` work remains available for bounded reconciliation or timeout; rollback does not erase a possibly completed provider effect. Never restore browser authority or legacy enterprise writes. PR B makes no deployment, hosted/live Supabase, private-storage, export correctness, pilot, production, security-certification, or compliance claim and does not alter Assess scoring or decision law.

PR #216 also carries an additive forward correction for the accepted PR 1B shared membership trigger's row-type defect. Table-specific organization and workspace trigger functions preserve strict role scope, tenant, workspace, active-state, and soft-deletion checks without any normal-execution trigger bypass. This is source remediation only: no deployment or live migration has occurred.
