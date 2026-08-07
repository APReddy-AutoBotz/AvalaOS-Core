# Trust and Assurance Evidence Hub execution plan

## Start-gate task log — 2026-08-07 UTC

The AP-authorized continuation supplies these read-only GitHub facts: repository `APReddy-AutoBotz/AvalaOS-Core`; live `main` and local checkout `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5`; PR #221 is open, Draft, unmerged on `codex/enterprise-intelligence-byok-ingestion-delivery-assemble` at `07d2cfee5a4116c0d2acbf71758f9f71636ae1df`. Local execution confirmed `/workspace/AvalaOS-Core`, a clean worktree, Node `v22.22.2`, and no local branch named `codex/enterprise-trust-assurance-evidence-hub`. Shell GitHub authentication is intentionally absent and is not an authority gate. The PR #221 changed-file list and open-PR collision search require managed publishing review before publication; no PR #221 implementation is imported.

## Objective and buyer outcome

Replace static Trust Center authority in pilot/production with a normalized, server-authoritative evidence metadata, review, snapshot, and publication boundary. Authorized internal users receive honest effective proof states; buyer-safe consumers receive only the current published, sanitized snapshot. This source candidate proves neither hosted behavior nor readiness or certification.

## Decision-complete implementation sequence

1. Preserve the existing proof vocabulary and add independent relationship, freshness, lifecycle, and review axes.
2. Add deterministic canonical hashing, evidence sufficiency, publication validation, strict projections, and strict decoders.
3. Add private transactional PostgreSQL authority with immutable versions/events, receipts, forced RLS, ACL denial, tenant-safe reads, and three-person publication.
4. Add schema-validating Edge command/query boundaries using fresh tenant authority.
5. Cut the Admin Trust Center to a fail-closed governed workspace; retain static data only for explicit `local_demo`/`automated_test` fixtures.
6. Add feature-owned tests, migration/PostgreSQL contracts, browser journeys, CI, and boundary scans.
7. Run local checks, record exact evidence, and keep the PR Draft.

## Trust boundaries and ownership

The browser is presentation-only. Edge authenticates and resolves fresh organization/workspace capability authority. A private service-role-only PostgreSQL function owns receipt claim, expected-version fence, validation, mutation, audit, and terminal replay in one transaction. Canonical tables never accept browser mutation. No Storage, provider, AI, deployment, or external effects exist.

## State machines and evidence semantics

Claim/evidence aggregates point to immutable versions. Evidence lifecycle is `active|superseded|withdrawn|blocked|not_run`; freshness is derived as `current|review_due|expired`; relationships are `supports|contradicts|limits`. Review/publication lifecycle is `draft|under_review|changes_requested|reviewed|approved|published|withdrawn`. `proofStatus` retains its existing meaning and is never overloaded. Effective proof deterministically degrades when support is absent/expired, contradiction is current, limitations are absent, or evidence is blocked/not run.

## Authorization matrix

| Operation | Capability | Separation |
| --- | --- | --- |
| Internal/buyer-safe scoped query | `trust.read` | active organization and exact workspace membership |
| Create/revise/link/snapshot create | `trust.manage` | expected-version fence |
| Claim/evidence/snapshot review | `trust.review` | reviewer differs from author/creator; exact hash |
| Publish/withdraw | `trust.publish` | publisher differs from creator and reviewer; exact hash |

Fresh authorization version and revocation state are checked for every request. Cross-tenant/workspace failures use a non-disclosing not-found contract.

## Commands, idempotency, and concurrency

Typed operations cover claim create/revise, evidence register/supersede/withdraw, link, resource review, snapshot create/review/publish/withdraw. Canonical request hashing excludes transport `requestId`; `(organization, actor, operation, idempotencyKey)` is unique. Same hash replays the exact terminal status/body/resource; a changed hash conflicts. PostgreSQL locks the receipt and aggregate, validates expected versions, persists domain/event/audit state, then terminal response atomically. Audit failure rolls back all work.

## Failure modes and rollback

Feature disablement rejects new mutations while preserving authorized internal and buyer-safe reads. Read-only mode rejects mutations. Missing production configuration fails closed and never falls back to fixtures. Stale/revoked authority, malformed data, version conflict, contradiction, expired support, missing limitation, review mismatch, or separation breach return stable errors without success projection. Rollback is feature disable/read-only plus additive forward repair; history is never deleted.

## Test matrix and acceptance criteria

Feature tests cover deterministic status/freshness/hash/publication law, strict command/client decoders, redaction, idempotency semantics, separation, and UI states. Migration scans cover forced RLS, ACL, append-only guards, current uniqueness, private RPCs, atomic publication, and no seed data. Disposable PostgreSQL CI covers fresh/upgrade/populated application, two tenants, rollback, concurrency, immutability, replay, and review invalidation. Browser CI covers desktop, Pixel 7, accessibility, overflow, false success, and buyer preview isolation. Local Chromium is **blocked/not run** by the supplied container limitation; CI is final browser/PostgreSQL authority.

## PR #221 boundary and deferred convergence

This branch does not edit prohibited shared/Enterprise Intelligence files or depend on PR #221 migrations. Before managed publication, refresh PR #221 and compare changed files; any material overlap stops publication. After human merge of PR #221 only: verify new main, rebase once, recheck migration order/shared contracts, add deferred package/default-chain and global authority/status/roadmap/risk/task-ledger/navigation integrations, rerun exact-head CI/review, fix P1/P2 items, then and only then mark Ready. Human merge only.

## Unsupported claims

No production, hosted, deployment, pilot, buyer, security, compliance, certification, incident, backup/restore, or operational readiness is asserted. Live infrastructure and external customer publication remain not run.
