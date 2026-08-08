# Trust and Assurance Evidence Hub architecture

## Objective and buyer outcome

The Hub is the normalized Prove bounded context for versioned claims, immutable evidence metadata, exact-version links, human review, immutable snapshots, and retained publication history. Internal users see evidence gaps and effective proof status. Buyer-safe consumers see only the current published snapshot with explicit limitations. Authored metadata and CI success never become a hosted, production, security, compliance, or certification claim.

## Trust boundaries

The browser is untrusted and has no table or mutation-RPC authority. Both Trust browser calls use the canonical configured Supabase client's authenticated `functions.invoke` transport and strict POST bodies; callers cannot inject bearer identity. A Trust-owned response helper composes the repository's canonical CORS headers onto every command/query success and error response, while preserving command `no-store` and authenticated query `private, no-store` plus `Vary: Authorization`. The command Edge boundary strictly decodes bounded requests, resolves fresh tenant authority, maps operations to normalized `trust.*` capabilities, hashes the logical request without `requestId`, and calls one private database transaction. The query Edge boundary strictly decodes organization/workspace/authorization-version selectors plus the exact `internal|buyer` view, authenticates, resolves fresh accepted-main tenant authority, requires `trust.read`, and invokes Trust-specific private internal or buyer-safe projection RPCs. A second-check `PR1B_AUTHORIZATION_STALE` is translated to bounded `AUTHORIZATION_STALE`; `PR1B_NOT_FOUND` becomes non-disclosing `ACCESS_DENIED`; only unknown transport or persistence failure becomes `PERSISTENCE_UNAVAILABLE`. The same law applies to commands. It never emits static fixtures or raw Supabase/PostgREST errors. PostgreSQL owns expected-version fencing, receipt replay, exact-hash review, separation of duty, publication pointer transition, immutable events, and audit. There are no Storage, provider, AI, deployment, or other external effects.

`OrganizationProvider` is the sole application authority for the selected tenant context. `TrustCenterPanel` passes that exact projection into the pure connected workspace; the workspace never enumerates memberships or substitutes another readable workspace. A context-generation fence clears the previous internal/buyer projection, notices, and pending presentation immediately and prevents late query or command completion from overwriting the newly selected scope. Null, loading, stale, revoked, expired, blocked, and missing-`trust.read` selections fail closed without fallback.

The current hard-coded Trust Center remains an explicit `local_demo`/`automated_test` compatibility fixture. Pilot/production mode renders a blocked governed Hub rather than verified demo claims when server configuration is absent.

## Schema and state machines

`trust_claims` and `trust_evidence` are scoped aggregates with optimistic versions and current immutable-version pointers. `trust_claim_versions` preserves claim text, proposed status, boundary, buyer wording, limitation, does-not-prove list, canonical hash, author, and ancestry. `trust_evidence_versions` preserves sanitized references, optional digest, summary, boundary, performed/blocked/not-run result, dates, canonical hash, and ancestry. `trust_claim_evidence_links` binds exact versions as `supports|contradicts|limits`.

`trust_review_events`, `trust_publication_events`, `trust_command_receipts`, and `trust_audit_events` are append-only. `trust_snapshots` contains an exact selection and deterministic hash. `trust_current_publications` atomically points to the one current publication for an organization/scope while old publication events and snapshots remain immutable.

Review history is ordered per exact organization/workspace/resource type/resource ID/resource hash. Review commands take an exact-scope advisory transaction lock and append the next monotonic `review_ordinal`. The private `trust_assurance_current_review_disposition` helper is the sole current-review law: the greatest ordinal is authoritative. A positive review followed by `changes_requested` is no longer positive; a later valid positive review restores approval without rewriting history. Evidence law, claim and snapshot publication checks, internal approval projection, buyer effective status, and queue counts all consume this helper.

Evidence lifecycle is `active|superseded|withdrawn|blocked|not_run`; freshness is independently derived as `current|review_due|expired`; assurance lifecycle is `draft|under_review|changes_requested|reviewed|approved|published|withdrawn`. Existing proof statuses, boundaries, and readiness domains are imported unchanged.

| Operation | Legal source state | Result | Fence/event |
| --- | --- | --- | --- |
| claim create | new | draft | immutable version, receipt, audit |
| claim revise | any non-withdrawn current aggregate | draft with new immutable version | required expected version |
| evidence register | new | active, blocked, or not_run from result | immutable version, receipt, audit |
| evidence supersede/withdraw | active, blocked, or not_run | superseded/withdrawn | required expected version |
| evidence link | current non-withdrawn claim and evidence | immutable exact-version link | claim then evidence lock |
| resource review | current non-withdrawn claim, or current active/performed evidence | append-only current disposition | independent reviewer and exact hash |
| snapshot create | current non-withdrawn claims | draft immutable selection/hash | server-derived selection |
| snapshot review | draft, under_review, changes_requested, or reviewed | reviewed or changes_requested | required expected version and append-only exact-hash review |
| snapshot publish | reviewed with current positive exact-hash disposition | published/current pointer | required expected version, three-person law, publication event |
| snapshot withdraw | exact current published snapshot | withdrawn/no current pointer | required expected version, withdrawal event |

Published and withdrawn snapshots are never reviewable or reopenable. An illegal review, stale fence, or invalid lifecycle commits no review event, receipt, audit, pointer, or aggregate mutation.

## Deterministic evidence law

A proposed verified claim is effectively `evidence_required` unless it has active/current/approved/performed supporting evidence, no unresolved active contradiction, a limitation disclosure, and at least one nonblank does-not-prove statement. Superseded, withdrawn, blocked, not-run, noncurrent, review-due, expired, or currently changes-requested evidence remains historical but cannot be silently presented as current passed proof. Buyer projection omits those invalidated snapshot-selected entries, never substitutes later unselected evidence, and applies their current lifecycle/review state when deriving the captured claim's effective status. A current claim-level `changes_requested` disposition likewise degrades a published verified claim until a later positive review restores it without changing immutable snapshot ancestry. Source/CI boundaries do not establish hosted/production behavior.

## Authorization and separation of duty

| Capability | Authority |
| --- | --- |
| `trust.read` | tenant/workspace-scoped internal and buyer-safe projection |
| `trust.manage` | create/revise/register/link/build |
| `trust.review` | exact-hash independent review |
| `trust.publish` | exact-hash publish/withdraw |

Every request requires an authenticated user, active organization and exact workspace membership, current authorization version, non-revoked normalized capability, matching ownership, valid lifecycle, and expected version. Cross-tenant/workspace responses do not disclose existence. Snapshot creator, reviewer, and publisher must be three distinct active humans. Publication locks the snapshot, then all selected claim aggregates by UUID, then all selected evidence aggregates by UUID, and only then revalidates and share-locks the stored creator's and reviewer's active profile, exact organization membership, exact workspace membership, organization, and workspace rows. Those locks remain held through the buyer-publication effects and transaction commit, so aggregate mutation or participant revocation cannot race validated truth into publication. Publisher capability remains a separate fresh PR1B authorization check. Review binds to the snapshot hash; selection or content changes invalidate it. A high-impact verified claim cannot be self-authored and self-approved.

## Command, idempotency, and concurrency contract

The typed operations cover claim create/revise, evidence register/supersede/withdraw/link, resource review, snapshot create/review/publish/withdraw. `(org, actor, operation, idempotencyKey)` is logical identity; the canonical payload hash excludes transport correlation. Exact replay returns the durable terminal body/resource/version. Changed payload conflicts. Receipt/aggregate locking creates one winner; stale expected versions fail before effects. `claim.revise`, `evidence.withdraw`, and `evidence.supersede` update the same aggregate rows publication share-locks. `evidence.link` follows claim-then-evidence order and locks current aggregate identity before creating lineage. A publication-first transaction therefore excludes mutations until commit; a mutation-first transaction makes publication reload and reject stale immutable selection with zero effects. State, immutable event, audit, and terminal receipt commit together, so audit failure rolls back and lost HTTP responses replay exactly.

The browser creates one in-memory unresolved attempt per user/organization/workspace before dispatch and uses a synchronous in-flight guard. `PERSISTENCE_UNAVAILABLE` retains the same request ID, idempotency key, operation, expected version, and exact payload; unrelated mutations remain disabled until the explicit retry resolves it. A same-scope retry may overlay only a freshly selected authorization version because authorization version is deliberately excluded from the logical hash. Context changes cannot replay an attempt into another workspace or let late completion overwrite the selected scope, and Trust payloads are never persisted to local storage. Terminal success or bounded terminal failure clears the attempt so a later intentional action receives a new key. The browser exposes explicit claim and evidence targets when multiple records exist. Revise/review/link bind to the selected claim, and snapshot construction submits that exact selected claim ID. Active evidence alone is eligible for review/link; active, blocked, or not-run evidence is eligible for supersede/withdraw. Once a user explicitly selects retired or otherwise incompatible evidence, the affected action is disabled and never falls back to a different record. Snapshot review/publish targets are lifecycle-specific, while withdrawal always targets the current-publication pointer rather than array position.

## Projections and redaction

Internal projections include owners by display name, effective status, freshness, contradictions, blocked reasons, queue counts, snapshots, and publication state. Their decoder validates every top-level and nested field and binds organization, workspace, and authorization version exactly to the request before ready state. The buyer-safe decoder accepts only published-snapshot shape: approved wording/status/boundary, reviewed date, sanitized reference summary, limitations, does-not-prove statements, freshness, and publication identity/date. Unknown or malformed fields, UUIDs, hashes, versions, enums, arrays, and timestamps are rejected. Email, internal notes/IDs, infrastructure identifiers, audit rows, draft evidence, raw logs, secrets, signed URLs, customer documents, and object coordinates are excluded.

## Failure and rollback posture

Missing or malformed mandatory server configuration blocks the Hub before query or command dispatch. Offline state, revocation, stale authority, malformed projection, evidence insufficiency, contradiction, version conflict, hash drift, and separation violations fail closed. `TRUST_ASSURANCE_ENABLED` is a mutation-execution gate, not a read-visibility gate; when it is not true, freshly authenticated and authorized internal/history and buyer-safe current-publication queries remain available, while the internal projection is overlaid `readOnly=true`. `TRUST_ASSURANCE_READ_ONLY=true` has the same mutation-blocking/read-preserving posture. Application-wide `selectionState='read_only'` is an independent maintenance boundary: authorized projections remain visible, but controls, execution, and unresolved-command retry all block with zero dispatch if any applicable layer is read-only. A returned `FEATURE_DISABLED` latches the selected Trust view read-only until context reload. New effects are blocked, but an exact already-committed receipt can still replay after fresh authority and matching-hash checks; a changed request conflicts. An optional buyer-preview absence or transport/malformed-response outage never replaces an already-ready internal projection; absence is empty and outage is a bounded warning, while stale or revoked authority still replaces the privileged state and fails closed. Forward additive repair is the only schema rollback; destructive deletion is prohibited. Hosted rollback and incident readiness are not claimed.

## Post-Enterprise convergence boundary

PR #221 is accepted on the synchronized main parent. Its migrations and Enterprise Intelligence authority remain unchanged. The still-unaccepted Trust migration is now the unique `20260808190000` forward tip after accepted main's `20260808180000` maximum, with fresh/upgrade and uniqueness checks in the Trust and shared migration gates. Draft PR #222 remains unmerged; source verification is executable locally, while disposable PostgreSQL and full browser workflow results remain GitHub Actions acceptance evidence. Human merge only.
