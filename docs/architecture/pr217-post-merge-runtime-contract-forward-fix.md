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

Exact generation replay is evaluated before canonical-tombstone rejection. A new command derives the governed renderer and rejects an existing canonical `(artifact version, format, renderer version)` row before creating a receipt or attempt. The browser never offers generation for a deleted tombstone; a new approved artifact version, or a later separately governed renderer version, is required.

Once the atomic command RPC returns a committed receipt, missing private claims, adapter construction/configuration failures, provider exceptions, and downstream RPC failures return HTTP 202 with `committed_reconciliation_pending`. That response contains only `receiptId`, `resourceId`, and safe public `resource`. It is non-final and never includes a rendition/deletion claim or Storage binding. The client reloads committed projection state and blocks duplicate mutation until that reload succeeds.

The production saga adapters map `available`, `deleted`, terminal `failed`, and `reconciliation_required` outcomes one-for-one. `UPLOAD_OUTCOME_UNKNOWN`, `AVAILABLE_COMPLETION_FAILED`, `DELETE_OUTCOME_UNKNOWN`, and `TOMBSTONE_COMPLETION_FAILED` therefore remain HTTP 202 committed recovery work. Only terminal rendition failure or bounded reconciliation exhaustion may produce `rendition_failed` or `deletion_failed`. A replay result in a newly committed side-effect path is rejected explicitly and falls back to the same receipt-preserving pending boundary.

## Recovery, due work, and provider-effect fencing

The service-only due-work RPC accepts one bounded `p_limit` and returns only work kind plus internal attempt ID. The worker accepts either an exact one-attempt request or exact `{limit}` batch request, rejects browser origins and user authorization headers, processes at most 50 items sequentially, and returns only aggregate sanitized counts.

Rendition claims cover stale `requested`, `rendering`, and `uploaded` work plus reconciliation states. Pre-render recovery reloads immutable approved content and deterministic renderer authority. Post-render recovery probes the exact binding: matching bytes complete without upload, absence permits one create-only upload after deterministic rerender, and mismatch fails without overwrite. Completion and failure are fenced to the current claim.

Deletion discovery first produces safe internal work. A separate execution guard reauthorizes the independent approver, takes the rendition serialization lock, rechecks lifecycle, retention, and holds, and establishes a short execution fence before returning the private binding inside the service boundary. Completion and failure accept only that fence. A provider-confirmed missing object completes the tombstone without another destructive effect.

Every committed fenced outcome has atomic privileged audit evidence. Completion uses `studio.rendition.deletion.complete`; failure or uncertainty uses `studio.rendition.deletion.fail`; bounded deletion-reconciliation exhaustion uses `studio.rendition.deletion.reconciliation.exhausted`. The event is bound to the organization, workspace, independent resolver, accepted resolution command request, deletion attempt/request/resolution, canonical rendition, execution fence, and resulting lifecycle version. Completion additionally records the exact `deleted` or `missing` provider result plus safe format, content hash, and byte length. No event carries Storage coordinates or executable private authority.

The database fence prevents stale workers from committing outcomes after lease supersession and tests prove one claim/effect in the exercised races. As with any non-transactional provider lacking a conditional idempotency primitive, the source boundary does not claim a universal exactly-once API invocation across an indefinitely paused process; the canonical object can undergo at most one present-to-absent transition, and ambiguous outcomes remain reconciliation work.

## Hold/deletion invariant

Hold placement and deletion execution use the same rendition advisory and row locks. If a hold commits first, approval/execution fails before the provider call. If execution commits first, the rendition is `deleting`/`executing` and later hold placement fails. Hold release requires the exact safe projected `holdId` and SQL verifies active hold ownership within organization, workspace, and rendition scope.

Retention extension uses the same rendition row and advisory lock. It remains allowed for `available`, for `deletion_requested` before approval/execution wins, and for governed `deletion_failed` recovery. It is rejected with the stable non-disclosing `STUDIO_DELETION_BLOCKED` once lifecycle is `deleting` or `deleted`, or while an execution/reconciliation attempt is active. If extension commits first, approval/execution rechecks effective retention and performs no provider delete. If execution commits first, the later extension is rejected and the fenced delete/tombstone path may finish.

Deletion requests are append-only. The effective command function enforces at most one unresolved request under the rendition serialization lock instead of using unconditional rendition uniqueness. This permits one current-version retry from `deletion_failed`, preserves all earlier evidence, and rejects stale versions or a second pending request before receipt creation.

## Evidence boundary

Acceptance requires the focused unit/coverage suites, production decoder against real PostgreSQL output, fresh-chain and main-upgrade PostgreSQL 16 runs, dirty atomic rejection, two-connection races, desktop/mobile Chromium with axe/keyboard/responsive checks, repository build/audit/static guards, and exact-head GitHub workflows. Exact results belong to the draft PR body and workflow records.

Executed local evidence on the corrective branch:

- the PostgreSQL 16 migration harness passed `149/149` scenarios across a fresh ordered chain, accepted-main upgrade plus additive reapply, dirty-state atomic rejection, conditional Storage behavior, the production-decoder bridge, real two-connection retention-versus-deletion races, terminal tombstone enforcement, append-only deletion retry, committed-pending recovery, independent exact replay for two command types sharing one idempotency key, and 15 fenced deletion-audit scenarios;
- deletion-audit evidence observed one completion event for a `deleted` provider result, one for `missing`, three one-for-one nonterminal uncertainty transitions, one terminal provider failure, and one bounded exhaustion event; stale fence produced zero audit/state changes, completion and failure replays produced no second event, and a forced audit-insert failure rolled back the attempt and rendition transition;
- deterministic lifecycle assertions observed zero provider deletes when retention won, exactly one when deletion execution won, and zero new receipts, attempts, uploads, or objects for rejected tombstone regeneration; reconciliation assertions observed one rendition upload and one deletion provider call with three deletion presence probes;
- same-command replay with changed payload remained an idempotency conflict, while the same key used for retention-policy and hold-placement commands produced two correctly bound receipts and no arbitrary prior-receipt selection;
- the focused private-artifact suite and its `84/84` coverage run passed at `98.42%` lines, `85.71%` branches, and `100%` functions;
- TypeScript, Edge TypeScript, Studio lint/static boundaries, AI boundary, secret hygiene, unchanged PR 1G scoring, repository build, and dependency audit passed.

Exact-head GitHub workflow evidence, including the desktop Chromium and Pixel 7 projects, remains pending until the draft PR branch is published. The browser matrix covers all 13 public rendition states and requires hold/retention controls only for `available`, `deletion_requested`, and `deletion_failed`, with zero blocked command requests. Local and workflow evidence does not alter the non-claims below.

Hosted/live Supabase or Storage, deployment, scheduler configuration, release, pilot, production, backup/restore, incident response, readiness, security certification, and compliance validation were not performed.
