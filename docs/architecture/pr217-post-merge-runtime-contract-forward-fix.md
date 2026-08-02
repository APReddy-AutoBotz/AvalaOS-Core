# PR #217 post-merge runtime-contract forward fix

Status: corrective draft-PR candidate over merged PR #217. PR #217 closure remains blocked. This document records source architecture and disposable-test evidence only; it is not hosted, deployment, pilot, production, readiness, certification, or compliance evidence.

## Scope and confirmed defects

The additive forward fix addresses the five unresolved PR #217 P1 findings without changing the accepted migration:

1. The production browser projection now calls `studio_private_artifact_projection` with exactly `p_org`, `p_workspace`, and `p_artifact_version`.
2. The effective PostgreSQL projection and production strict decoder share one exact public DTO.
3. The Edge handler validates a public command and deterministically translates it to the private SQL vocabulary instead of forwarding browser payloads.
4. Stale pre-render, post-render, completion, and deletion crash windows are discoverable and recoverable under bounded leases.
5. Hold placement, deletion approval, and the immediate provider-execution guard serialize on the same rendition authority.
6. Retention extension now shares that serialization boundary and cannot commit after deletion execution wins.
7. A canonical deleted rendition is terminal for the same artifact version, format, and governed renderer version.
8. Production rendition and deletion adapters preserve `reconciliation_required` without collapsing provider or completion uncertainty into terminal failure. The command boundary reports that durable state as reconciliation-pending with the original receipt, never as a pre-commit failure.
9. `deletion_failed` retains an append-only governed retry route without erasing prior request, resolution, attempt, or failure evidence.
10. Command-receipt replay is scoped by the canonical `(org_id, actor_id, command_type, idempotency_key)` tuple, so different command types may safely reuse one key while same-command payload or scope drift remains a conflict.
11. Hold placement and retention extension share one typed allowlist containing only `available`, `deletion_requested`, and `deletion_failed`. The browser suppresses both controls for all ten other public rendition states without emitting a blocked command request.
12. Fenced deletion completion, failure/uncertainty, and bounded reconciliation exhaustion insert one privileged audit event in the same transaction as the authoritative attempt and rendition transition. A stale fence, rejected authority, duplicate invocation, or rolled-back transition produces no additional event.
13. Deletion completion accepts the exact provider outcome through `studio_rendition_deletion_complete(uuid,bigint,text)`. Only `deleted` and `missing` are accepted; the completion audit records that outcome without a bucket, object key, credential, signed URL, or private claim.
14. One generation advisory-lock identity over organization, workspace, artifact version, format, and renderer version now serializes new claims with normal and reconciliation completion. New claims recheck both canonical renditions and active attempts under that lock before receipt creation.
15. Normal attempt RPCs no longer mutate `reconciling`; recovery rendered, completion, and failure use a separate exact-fence authority with fresh actor and approved-ancestry checks. Fenced recovery completion no longer delegates to the unfenced normal completion RPC.
16. Every committed rendition recovery claim now inserts one fence- and reconciliation-count-bound `studio.rendition.reconciliation.claim` audit event in the same transaction before executable authority is returned. The third bounded transition inserts one atomic terminal `studio.rendition.reconciliation.exhausted` event; audit failure rolls back the transition.
17. Rendition recovery persists a private `pre_render` or `verify_or_upload` phase when ownership is first claimed and preserves it across expired-lease reclaim, so a crashed worker cannot cause provider-effect authority to be inferred from lifecycle state alone.
18. Every successful nonterminal deletion-reconciliation claim inserts one atomic `studio.rendition.deletion.reconciliation.claim` event before executable authority is returned. The event is bound to the exact deletion attempt, request, accepted resolution, fence, previous/resulting lifecycle versions, and reconciliation counts without exposing Storage coordinates.
19. A new deletion-resolution command must bind its supplied request to the exact locked rendition, organization, and workspace and prove that the request remains unresolved before the accepted helper may create a resolution. Exact receipt replay remains available before these new-command validations.
20. Deletion-reconciliation ownership now locks and checks the singleton runtime control before consuming retry budget or mutating state, timestamps, fences, lifecycle, or audit evidence. A disabled feature, read-only mode, disabled provider, or disabled deletion path returns `STUDIO_READ_ONLY` with zero authoritative delta; repeated paused claims do not exhaust work.
21. Provider-effect execution claim is separately audited. The attempt update and one `studio.rendition.deletion.execution.claim` event commit atomically before the private binding is returned, and the event fence exactly matches the returned fence and the fence later required by completion or failure.
22. Rendition recovery rendered persistence, completion, and failure require the exact fence and an unexpired five-minute lease. Successful rendered persistence atomically renews the same-fence lease before provider work, including after a missing-object deterministic rerender; an expired or failed renewal reaches no provider probe or upload.

The accepted `20260729163251_studio_private_artifact_authority.sql` remains immutable. The effective definitions are supplied only by `20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql`.

## Exact public projection

The top-level projection has exactly:

`artifactId`, `artifactVersionId`, `artifactVersion`, `artifactType`, `approved`, `readOnly`, and `renditions`.

Each rendition has exactly:

`id`, `version`, `format`, `state`, `mimeType`, `filename`, `byteLength`, `sha256`, `rendererVersion`, `retentionMode`, `retentionUntil`, `legalHoldActive`, `activeHolds`, `deletion`, `failureCode`, and `updatedAt`.

`activeHolds` contains only `{holdId, placedAt}`. `deletion`, when present, contains only `{requestId,state,requesterIsCurrentActor}`. Bucket, object key, provider data, private claims, signed URLs, hold rationale, actor identity, and internal audit identifiers are excluded.

Before availability, verified file metadata and retention mode may be null. Availability requires exact MIME, filename, byte length, SHA-256, renderer version, and a retention snapshot. Recovery states remain explicit:

- rendition: `requested`, `rendering`, `uploading`, `reconciliation_required`, `reconciling`, `available`, `failed`;
- deletion: `deletion_requested`, `deleting`, `deletion_reconciliation_required`, `deletion_reconciling`, `deleted`, `deletion_failed`.

No recovery state is projected as available or deleted.

## Public-to-private command boundary

The server supplies the authenticated actor. Exact public payloads map as follows:

| Public command | Private SQL mapping |
| --- | --- |
| retention policy `{artifactType,retentionDays,reason}` | `{artifactType,retentionDays,indefinite: retentionDays === null,rationale: reason}` |
| retention extension `{renditionId,retentionUntil,reason}` | `{renditionId,extendUntil: retentionUntil,indefinite: retentionUntil === null,rationale: reason}` |
| hold placement `{renditionId,reason}` | `{renditionId,rationale: reason}` |
| hold release `{renditionId,holdId,reason}` | `{renditionId,holdId,rationale: reason}` |
| deletion request `{renditionId,reason}` | `{renditionId,rationale: reason}` |
| deletion resolution `{renditionId,deletionRequestId,outcome,reason}` | `{renditionId,deletionRequestId,outcome,rationale: reason}` |

Generation preserves its exact artifact/version/format binding. SQL enforces the current approved artifact version for generation and the current rendition/deletion version for every rendition mutation. A stale caller receives `VERSION_CONFLICT`; browser values never replace database authority.

For a new deletion-resolution command, SQL locks and verifies the exact supplied deletion request only after the payload rendition and its serialization boundary have been established. The request must belong to that rendition, organization, and workspace and must have no existing resolution. A mismatched, cross-rendition, cross-tenant, or already-resolved request fails as `RESOURCE_NOT_AVAILABLE` before the accepted resolution helper can create any receipt, resolution, audit, or lifecycle change. Exact command-receipt replay is still evaluated first and remains deterministic.

Exact generation replay is evaluated before canonical-tombstone rejection. A new command derives the governed renderer and rejects an existing canonical `(artifact version, format, renderer version)` row before creating a receipt or attempt. The browser never offers generation for a deleted tombstone; a new approved artifact version, or a later separately governed renderer version, is required.

Once the atomic command RPC returns a committed receipt, missing private claims, adapter construction/configuration failures, provider exceptions, and downstream RPC failures return HTTP 202 with `committed_reconciliation_pending`. That response contains only `receiptId`, `resourceId`, and safe public `resource`. It is non-final and never includes a rendition/deletion claim or Storage binding. The client reloads committed projection state and blocks duplicate mutation until that reload succeeds.

The production saga adapters map `available`, `deleted`, terminal `failed`, and `reconciliation_required` outcomes one-for-one. `UPLOAD_OUTCOME_UNKNOWN`, `AVAILABLE_COMPLETION_FAILED`, `DELETE_OUTCOME_UNKNOWN`, and `TOMBSTONE_COMPLETION_FAILED` therefore remain HTTP 202 committed recovery work. Only terminal rendition failure or bounded reconciliation exhaustion may produce `rendition_failed` or `deletion_failed`. A replay result in a newly committed side-effect path is rejected explicitly and falls back to the same receipt-preserving pending boundary.

## Recovery, due work, and provider-effect fencing

The service-only due-work RPC accepts one bounded `p_limit` and returns only work kind plus internal attempt ID. The worker accepts either an exact one-attempt request or exact `{limit}` batch request, rejects browser origins and user authorization headers, processes at most 50 items sequentially, and returns only aggregate sanitized counts.

Rendition claims cover stale `requested`, `rendering`, and `uploaded` work plus reconciliation states. Pre-render recovery reloads immutable approved content and deterministic renderer authority. Post-render recovery probes the exact binding: matching bytes complete without upload, absence permits one create-only upload after deterministic rerender, and mismatch fails without overwrite. Completion and failure are fenced to the current claim.

Deletion discovery first produces safe internal work. A separate execution guard reauthorizes the independent approver, takes the rendition serialization lock, rechecks lifecycle, retention, and holds, and establishes a short execution fence before returning the private binding inside the service boundary. Completion and failure accept only that fence. A provider-confirmed missing object completes the tombstone without another destructive effect.

Every committed fenced outcome has atomic privileged audit evidence. Completion uses `studio.rendition.deletion.complete`; failure or uncertainty uses `studio.rendition.deletion.fail`; bounded deletion-reconciliation exhaustion uses `studio.rendition.deletion.reconciliation.exhausted`. The event is bound to the organization, workspace, independent resolver, accepted resolution command request, deletion attempt/request/resolution, canonical rendition, execution fence, and resulting lifecycle version. Completion additionally records the exact `deleted` or `missing` provider result plus safe format, content hash, and byte length. No event carries Storage coordinates or executable private authority.

The database fence prevents stale workers from committing outcomes after lease supersession and tests prove one claim/effect in the exercised races. As with any non-transactional provider lacking a conditional idempotency primitive, the source boundary does not claim a universal exactly-once API invocation across an indefinitely paused process; the canonical object can undergo at most one present-to-absent transition, and ambiguous outcomes remain reconciliation work.

The effective rendition fence also separates original command workers from recovery ownership. Normal start accepts only `requested`; normal rendered persistence accepts only `rendering`; normal completion accepts only `uploaded` plus audit-neutral `available` replay; normal failure mutates only `requested`, `rendering`, or `uploaded`. Once a stale recovery claim commits `reconciling` with fence `N+1`, every normal mutation fails closed without state, receipt, version, or audit change. Recovery rendered, completion, and failure require the exact current fence, active reconciliation lease, current service-authorized actor, and current approved ancestry.

Rendition recovery ownership is itself privileged evidence. Each successful transition to `reconciling` inserts exactly one `studio.rendition.reconciliation.claim` event atomically with the new lease, reconciliation count, and execution fence. Its safe metadata carries only attempt/artifact-version/format identity, previous state, `pre_render` or `verify_or_upload` phase, previous/resulting counts, and previous/new fences. The bounded third transition instead commits `failed` with `RECONCILIATION_EXHAUSTED` and exactly one `studio.rendition.reconciliation.exhausted` event. A fresh attempt, losing concurrent worker, active-lease replay, rejected authority, or exhausted replay produces no event; a forced audit failure rolls back state, count, timestamp, fence, and terminal completion together. Neither audit returns an identifier or includes provider, approved-content, credential, or Storage-coordinate material.

The phase in that audit is durable private attempt state, not a value re-derived from `reconciling`. `requested` and `rendering` recovery enters `pre_render`; `uploaded` recovery enters `verify_or_upload`; a successful fenced rendered transition advances `pre_render` to `verify_or_upload`. Expired-lease reclaim preserves the stored phase exactly. Upgrade backfill classifies wholly empty Storage metadata as `pre_render` and complete valid metadata as `verify_or_upload`; partial or contradictory metadata rejects the additive migration atomically. The phase is excluded from public projection and worker HTTP responses.

Deletion reconciliation ownership has its own atomic evidence boundary and does not itself issue provider authority. Each successful nonterminal claim inserts exactly one `studio.rendition.deletion.reconciliation.claim` event before returning recovery ownership. Safe metadata contains only the deletion attempt/request/resolution IDs, previous state, previous/resulting reconciliation counts, current execution fence, resulting lifecycle version, `recoveryKind: deletion`, and `providerAuthorityIssued: false`. The event actor is the independent resolver and its command request is the durable accepted resolution request. Before any retry consumption or authoritative mutation, the function locks and checks the singleton runtime control and requires `enabled`, `provider_enabled`, and `deletion_enabled` with `read_only` false. A paused call returns `STUDIO_READ_ONLY` without state, count, fence, timestamp, lifecycle, audit, or provider delta, while rendition recovery remains independent of deletion disablement. Losing races, active-lease replay, rejected authority, terminal exhaustion, and audit failure cannot create a claim event without the matching authoritative transition; exhaustion remains represented only by its terminal event.

Deletion execution is the separate provider-authority boundary. `studio_rendition_deletion_execution_claim(uuid)` atomically updates the attempt and inserts one `studio.rendition.deletion.execution.claim` event before returning a private binding. That event binds the independent resolver and accepted resolution request to the deletion attempt/request/resolution and canonical rendition. Its exact safe metadata records previous state, previous/new execution fences, previous/resulting reconciliation counts, resulting lifecycle version, and `executionKind` (`initial` or `recovery`). The audited fence equals the returned private fence and the fence accepted by the subsequent completion or failure event. Concurrent claims create one binding/event, active-lease replay creates neither, expired reclaim advances both once, stale workers cannot record outcomes, and forced audit failure rolls the state, fence, lease timestamp, and count back with no returned binding. No execution-claim audit includes a bucket, object key, provider credential, signed URL, or other Storage coordinate.

## Hold/deletion invariant

Hold placement and deletion execution use the same rendition advisory and row locks. If a hold commits first, approval/execution fails before the provider call. If execution commits first, the rendition is `deleting`/`executing` and later hold placement fails. Hold release requires the exact safe projected `holdId` and SQL verifies active hold ownership within organization, workspace, and rendition scope.

Retention extension uses the same rendition row and advisory lock. It remains allowed for `available`, for `deletion_requested` before approval/execution wins, and for governed `deletion_failed` recovery. It is rejected with the stable non-disclosing `STUDIO_DELETION_BLOCKED` once lifecycle is `deleting` or `deleted`, or while an execution/reconciliation attempt is active. If extension commits first, approval/execution rechecks effective retention and performs no provider delete. If execution commits first, the later extension is rejected and the fenced delete/tombstone path may finish.

Deletion requests are append-only. The effective command function enforces at most one unresolved request under the rendition serialization lock instead of using unconditional rendition uniqueness. This permits one current-version retry from `deletion_failed`, preserves all earlier evidence, and rejects stale versions or a second pending request before receipt creation.

## Evidence boundary

Acceptance requires the focused unit/coverage suites, production decoder against real PostgreSQL output, fresh-chain and main-upgrade PostgreSQL 16 runs, dirty atomic rejection, two-connection races, desktop/mobile Chromium with axe/keyboard/responsive checks, repository build/audit/static guards, and exact-head GitHub workflows. Exact results belong to the draft PR body and workflow records.

Executed local evidence on the corrective branch:

- the PostgreSQL 16 migration harness passed `283/283` scenarios across a fresh ordered chain, accepted-main upgrade plus additive reapply, partial-metadata and dirty-state atomic rejection, conditional Storage behavior, the production-decoder bridge, real two-connection retention-versus-deletion and generation/completion races, terminal tombstone enforcement, append-only deletion retry, committed-pending recovery, independent exact replay for two command types sharing one idempotency key, 15 fenced deletion-audit scenarios, 26 rendition claim/exhaustion audit scenarios, 12 persisted-phase recovery scenarios, 27 deletion claim-audit scenarios, 30 deletion runtime-pause/execution-authority scenarios, and 11 deletion-request binding scenarios;
- after integration of current main `291c0f2d8c4861097743f29a8da5965d7899692e`, the PostgreSQL 16 migration harness passed `319/319` scenarios: all retained 283 plus 36 lease-expiry, renewal, reclaim, rollback, conditional-provider, and two-connection race scenarios;
- expired rendered, completion, and failure calls returned `AUTHORITY_STALE` with zero metadata, phase, count, fence, canonical, outcome-audit, or provider-upload delta. Successful rendered persistence advanced the claim timestamp while retaining fence 1 and `verify_or_upload`; immediate reclaim returned no authority, expiry reclaim advanced once to fence 2/count 2, and all old-fence operations were rejected;
- the exercised two-connection expiry/reclaim race produced one durable winner at fence 2, one provider probe, one create-only upload, one object, one canonical rendition, and zero orphan objects. Matching-object recovery added zero uploads, missing-object recovery added one, mismatch added zero, and a forced renewal transaction failure produced no provider effect;
- rendition recovery audit evidence observed one event for each exercised requested, rendering, uploaded, reconciliation-required, and expired-reconciling ownership transition; a two-worker race returned one executable claim and inserted one event; immediate lease replay inserted zero; the reclaim advanced to fence 5/count 2; terminal exhaustion inserted one failed event at count 3; exhausted replay inserted zero; forced claim-audit and exhaustion-audit failures each rolled back the complete state/count/timestamp/fence transition;
- persisted-phase evidence observed `pre_render` across repeated pre-render reclaim and bounded exhaustion, an exact advance to `verify_or_upload` after fenced rendered persistence, preservation of that phase across post-render reclaim, and zero state/audit delta after forced claim-audit failure;
- deletion claim-audit evidence observed five state-specific claim events, one executable claim and one event in the two-worker race, zero events for active-lease replay and forced audit failure, one terminal exhaustion event with no successful claim event, and exact independent-resolver plus accepted-resolution-request attribution;
- deletion runtime and execution-authority evidence observed zero state/count/fence/audit delta for each paused control, zero retry consumption across repeated paused calls, recovery of the same attempt at its original count after restore, and unaffected rendition recovery when only deletion was disabled. Initial execution, a two-worker race, and expired reclaim each produced one audit whose fence exactly matched its returned private binding; active-lease replay produced neither; stale completion/failure produced no event; forced execution-audit failure rolled back the complete claim transition; and deleted, missing, uncertain, and terminal outcomes preserved the same execution fence from claim audit through outcome audit;
- deletion-resolution adversarial evidence rejected seven mismatched, cross-tenant, stale-version, or separation-of-duty inputs before effects; two valid exact resolutions produced two receipts and two audits, exact replay preserved its receipt, and only the approved resolution produced one provider-effect claim;
- deletion-audit evidence observed one completion event for a `deleted` provider result, one for `missing`, three one-for-one nonterminal uncertainty transitions, one terminal provider failure, and one bounded exhaustion event; stale fence produced zero audit/state changes, completion and failure replays produced no second event, and a forced audit-insert failure rolled back the attempt and rendition transition;
- deterministic lifecycle assertions observed zero provider deletes when retention won, exactly one when deletion execution won, and zero new receipts, attempts, uploads, or objects for rejected tombstone regeneration; reconciliation assertions observed one rendition upload and one deletion provider call with three deletion presence probes;
- same-command replay with changed payload remained an idempotency conflict, while the same key used for retention-policy and hold-placement commands produced two correctly bound receipts and no arbitrary prior-receipt selection;
- the focused private-artifact suite and its `86/86` coverage run passed at `98.42%` lines, `85.71%` branches, and `100%` functions;
- TypeScript, Edge TypeScript, Studio lint/static boundaries, AI boundary, secret hygiene, unchanged PR 1G scoring, repository build, and dependency audit passed.

Exact-head GitHub workflow evidence, including the desktop Chromium and Pixel 7 projects, remains pending until the draft PR branch is published. The browser matrix covers all 13 public rendition states and requires hold/retention controls only for `available`, `deletion_requested`, and `deletion_failed`, with zero blocked command requests. Local and workflow evidence does not alter the non-claims below.

Hosted/live Supabase or Storage, deployment, scheduler configuration, release, pilot, production, backup/restore, incident response, readiness, security certification, and compliance validation were not performed.
