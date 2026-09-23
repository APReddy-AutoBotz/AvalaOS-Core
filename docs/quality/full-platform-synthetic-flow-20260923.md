# Synthetic platform-flow continuation — 2026-09-23

Scope: the separately approved `avalaos-ai-synthetic` non-production project and a private local preview. No production, AvalaOS.com, customer data, real human approval, or provider calls were used in this continuation. The OpenAI campaign's six additional effects were already consumed before this run, so no paid retry was attempted.

## Executed business steps

- The synthetic author signed in, created a process, created and saved an Assess V2 case, supplied declared synthetic process/application/interaction facts, and finalized a reviewer-ready Decision Pack. The server retained the immutable decision; sign-out and the restricted network observer passed.
- A separate insufficient-evidence case had 21 material decision claims but submitted evidence for only one. An independent synthetic reviewer assignment and `changes_requested` resolution committed. Approval was not attempted on that case.
- A uniquely named second scenario finalized with all 21 material claim IDs attached to a synthetic `test` evidence link. Independent reviewer assignment committed. Attestation attempted but failed closed with HTTP 503 / `COMMAND_UNAVAILABLE`; server readback showed zero attestations and zero review resolutions.
- The initial author browser harness created three same-name disposable process records while the catalog was still loading. It was corrected to await settled catalog state, and the second scenario uses a unique name. No synthetic records were deleted or represented as business proof.
- Four project-only capabilities were granted with separate explicit user approvals to the existing synthetic roles: author `assess.v2.finalize`; reviewer `assess.v2.approve`; approver `assess.v2.govern.resolve` and `assess.v2.studio.handoff`. These grants do not change production or other projects and do not constitute human acceptance.

## Confirmed defects and bounded correction

1. The process-bound V2 client looked up only `draft` and `reviewer_ready`, making an existing case disappear from Assess after review assignment. It now discovers every non-deleted, non-superseded lifecycle state while preserving tenant/workspace/process predicates and stable latest-case ordering.
2. The case author with `assess.v2.draft.write` could not load the review projection to start a requested revision. The review component now permits that read and enables the revision control only for a draft writer. The server still enforces ownership and every command capability.
3. The private PR 1E attestation function's unparenthesized JSON containment operands parsed as `boolean -> unknown` (rollback-only diagnostic SQLSTATE `42883`). The append-only migration parenthesizes both operands in the exact existing function source, fails on source mismatch, and is reapply-safe. No review/approval rule or capability changes in this migration.

The server's stricter meaningful-interaction validator also rejected an incomplete draft while the browser left Finalize enabled and displayed a generic error. Supplying the four missing declared read-interaction facts allowed finalization. That UI validation mismatch remains a separate user-facing issue; server rejection was correct and no partial decision was written.

## Verification and remaining gates

The focused V2 client/review component tests, TypeScript typecheck, and private-preview build passed after the client/UI correction. The PostgreSQL PR 1E migration harness was extended to assert the exact corrected operator expression and reapply behavior, but local execution is `not run`: Docker's Linux engine and local PostgreSQL were unavailable, with low free space on D: and E:. Exact-head CI must run the migration chain and affected browser tests before deploying the correction to the synthetic project. The current private preview contains uncommitted source and must not be described as exact-head hosted proof.

The connected happy path is still **not complete**. The synthetic scenario has a reviewer assignment but no accepted attestation, approval, Govern resolution, Studio handoff, Studio-approved artifact, Delivery work package, or Monitor baseline. After the corrected migration and UI are verified and deployed only to the approved synthetic target, resume from the retained in-review case; verify each committed server record and negative permission boundary. Existing AI-generated PDD/BRD/FRD drafts are separate observations, not evidence of this case's downstream handoff. Do not mark PR #264 Ready or merge based on synthetic role simulation.

Rollback: leave the append-only review history intact. If the forward correction fails, use the existing Assess V2 read-only/disable fallback, retain receipts and audit, and forward-fix. Do not rewrite the prior PR 1E migration or approve an unattested decision.
