# Synthetic Assess–Studio AI workflow check — 2026-09-23

Status: executed synthetic evidence with open quality and human-approval boundaries. This is not production, pilot, deployment, semantic-correctness, or merge-readiness proof. PR #264 remains Draft.

## Scope and cost

- Target: the dedicated `avalaos-ai-synthetic` non-production project only. No production, AvalaOS.com, customer data, Groq call, or real-provider key in browser evidence.
- OpenAI campaign cap: USD 10. Six provider effects were consumed before this correction. The carried amount was USD 0.86932 and new effect debits totaled USD 2.8287552, for USD 3.6980752 aggregate. The FRD recovery added zero provider effects and zero debit. Both Assess and Studio provider runtimes were left disabled.
- Synthetic Assess meeting transcript, SOP, and process CSV are separate from the Studio document source package. The campaign did not claim an Assess-to-Studio approved handoff.

## Observed results and limits

| Area | Executed result | Boundary |
| --- | --- | --- |
| Assess intake | Three of three source extraction jobs completed; 43 catalog targets were available. | The one AI proposal repeated the existing case description. Useful field-by-field mapping was **not** demonstrated; no automated apply or correctness claim. |
| Studio PDD | Real-provider draft committed; a human-style synthetic edit committed as an immutable next version and reopened from the server. | The earlier false `human_authored` labels were a confirmed source defect and corrected in the provider output contract. Draft content still requires human review. |
| Studio BRD | Real-provider draft committed and reopened. | It called handling at or below USD 5,000 “out of scope” even though the source said it was *not specified*. That is a semantic-quality finding for human correction, not an approved requirement. |
| Studio FRD | A charged provider response was staged, then finalization failed because the trusted template's camelCase section IDs passed Edge validation but failed PostgreSQL's lowercase-only validator. Migration `20260923082000` aligned the database with the existing Edge/template contract; the **same** response then finalized as a non-stale draft without another provider call. The draft reopened in the browser. | No review, approval, export, or downstream handoff is claimed. |
| SDD and downstream | Not run. | No canonical SDD system template was in the exercised inventory; user-story/task extraction and governed handoff were not exercised in this campaign. |

The FRD migration was tested through the exact migration-tail and source-provenance contracts, a focused positive camelCase/negative invalid-ID PostgreSQL assertion, and the relevant exact-head Assess and Studio PostgreSQL CI suites. The isolated synthetic project's migration history advanced from 83 to 84; the same staged content changed from database-invalid to valid; browser-role helper execution remained denied. After claim/finalize, there was one FRD content version, no staged attempt, six effects, and unchanged spend. A provider-free browser readback reopened PDD, BRD, and FRD.

An unrelated but real preview-network failure on head `da30e81` captured two Google Fonts `/l/font` requests during Desktop Axe. The network safety contract intentionally rejects that endpoint and arbitrary query-bearing variants. The corrective source change bundles Inter and Outfit as same-origin, pinned, OFL-licensed assets and removes the remote stylesheet; it does **not** widen the request allowlist. The focused network contract, typecheck, dependency audit, and production build passed locally. Exact-head preview and full PR C evidence for this font change remain pending until its committed head completes CI.

## Rollback and safe fallback

Keep both AI provider runtimes disabled and the drafts unapproved if further checks fail. Do not delete or re-debit the charged FRD effect or staged-response history. The FRD database validator cannot be reverted safely after a committed camelCase FRD version without a separately reviewed forward migration and version compatibility check. The self-hosted fonts may be source-reverted only with a deliberate replacement for the external-font network dependency; the preview request allowlist must remain fail-closed.

Controlled-human acceptance still requires distinct real requester, reviewer, and approver participation. Synthetic account or agent actions do not satisfy that gate. No final merge or production decision follows from this document.
