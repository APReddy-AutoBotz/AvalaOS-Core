# Legacy Delivery authority and acceptance

## Approval, source baseline and outcome

On 2026-10-10 AP explicitly approved the consolidated remaining-acceptance plan: preserve the original business scope, add server authority for legacy Delivery tasks/imports, add a separate authenticated synthetic acceptance profile, and correct seven read-only criteria to require zero writes. This approval covers repository implementation and verified merges. Hosted inspection, deployment, activation, production and paid effects remain excluded.

PR #281 merged as `2ea259e24d6ca27c95f69f7018fad970f6f4e581`, with the tested candidate tree unchanged. Its 49 passed checks, 15 intentional skips, independently verified connected artifacts and successful post-merge Core CI `38016322009` close that implementation boundary. Its 16 backend stages and four browser tests are local/disposable proof. The last separately executed stable acceptance result remains **58 PASS / 0 FAIL / 50 BLOCKED / 0 UNCOVERED**, bound to run `37891394223`, attempt 1. Neither approval nor new source changes alter that historical result.

This first substantial PR makes the existing legacy task/import workflow authoritative at the server. It preserves task creation, update-own permissions, status transitions, deletion/retention and Docs ancestry. PR C packages/items remain a separate authority model; testing them cannot satisfy these task requirements.

## Confirmed problem

The existing import creates browser identifiers, writes epics/tasks separately and then records a handoff. Task mutations and import/retention rules run in browser code before direct persistence; lineage is caller-supplied metadata. This cannot establish atomic import, exactly-once retry or immutable server-derived ancestry. Existing row policies do not by themselves prove those properties. Cross-tenant exploitability of every historical table policy is unconfirmed; this plan does not claim a hosted incident.

## Execution and ownership

All three read-only architecture, security and quality reviewers completed before implementation. The controller reconciled the proposed modern replacement with AP's original scope: retain the task requirements and implement their missing authority. Under the fixed managed workspace-write profile, three implementation workers own non-overlapping database/fixture, Edge/client, and application/browser tracks. No recursive delegation is permitted. The controller owns the contract, active canonical documentation, per-case evidence/report integration, migration-chain reconciliation, CI and the single PR.

## Runtime contract and invariants

- Resolve authenticated actor, organization, workspace, capabilities and authorization version through existing canonical server authority. Never accept browser personas, permissions or actor identifiers as authority.
- Server commands own task/import identities, expected versions, allowed transitions and ownership. Direct browser table writes cannot bypass them.
- Import receives source selectors and a version/hash precondition; it reads the actual persisted document source. It derives ancestry from authoritative records and freezes the accepted source binding. Browser-provided lineage, generated task IDs or a PR C package cannot substitute for that source.
- Commit imported work, source binding, command receipt and privileged audit atomically. Exact actor-scoped command replay returns the original result without another effect; changed payload under the same identity conflicts. Repeating the same source import with a fresh key must not duplicate imported work.
- Reauthorize replay and result disclosure against current authority. Denied, cross-scope, revoked or stale actions disclose no foreign resource and cause no domain effects.
- Own-task permissions apply to the persisted assignee and protect assignment, project, dependency and planning fields. Dependencies, transition rules and deletion/retention checks use persisted state under transaction locks.
- Preserve authored UI input through failure. Treat response loss as unknown outcome until the original command is reconciled; a retry must not invent a new identity or display false success.
- Keep public `/sandbox` browser-local. Server-connected task behavior uses authenticated command/query paths and fails closed when unavailable. Providers remain outside this feature.

## Storage, migration and compatibility

Use the existing canonical authority groundwork where it can represent the original Task behavior; do not conflate it with immutable PR C packages. New operational writes default off. Preserve historical rows and ancestry unchanged. Any migration requiring a new invariant must stop on incompatible historical data rather than silently backfill identities or fabricate lineage. Declare exact predecessor/current-chain requirements, explicit table and routine grants, RLS, safe search paths and current-authority checks. Validate the actual service role and denied browser roles in disposable PostgreSQL 16.

The detailed RPC/storage contract and verified migration behavior belong in the same PR's migration document. No migration is installed on a hosted target by this work.

## Acceptance and focused verification

The implementation must prove the real legacy task behavior, not isolated model objects: atomic Docs import, server-generated identifiers and ancestry, duplicate/replay rejection, update-own restrictions, allowed/invalid status transitions, foreign-tenant and revoked-authority denial, retained ancestry and no false success after a failed/unknown response. Use the actual production command handler and current migration chain, plus focused desktop/Pixel 7 browser execution against the disposable server fixture.

`DELIVERY-007` and `DELIVERY-008` already require disposable PostgreSQL and can gain canonical per-case evidence in this PR only when their original duplicate-import and retained-task-lineage requirements are executed. Bind measured target/receipt/audit/effect deltas, exact source hashes, case identity, run/head/attempt and verified cleanup. Reject missing or substituted evidence. A green aggregate suite is insufficient.

All remaining hosted-required cases stay blocked until their declared profile and actual execution are supplied. The approved second substantial integration boundary will add `hosted_authenticated_synthetic` for the 47 blocked hosted cases and explicitly version the seven zero-write corrections (`EI-003`, `ADMIN-001/003/004`, `MONITOR-001/002/003`). It will preserve exact recorded Monitor outcomes, tenant lineage, real privileged-command audits and all original case IDs. This sequencing keeps those changes with their executable profile rather than making an unrelated catalog-only PR.

Executed local verification:

- `node scripts/legacyDeliveryAuthorityPostgres.mjs` and `node scripts/verifyLegacyDeliveryAuthorityEvidence.mjs <retained-result>`: both original cases PASS, with measured effects, exact source/run binding and verified cleanup. Upgrade proof also applies Supabase-like explicit routine defaults and verifies every private helper is denied to browser and service roles; only the two RPCs remain service-executable. An actual authenticated SELECT also proves new rows cannot bypass the capability-checked query through the historical membership-only read policy.
- `node scripts/legacyDeliveryRolePolicyPostgres.mjs`: four create-capability paths, three administrative-equivalence paths, assignment/update-own restrictions, dependency and transition guards, stale/revoked authorization and archived-project zero-effect denials PASS; disposable cleanup verified.
- Focused contracts, actor-scoped client recovery, HTTP/command/query/database boundaries and adapter tests PASS. Product action policy: 20/20 PASS. Evidence validator: 4/4 PASS. The focused report-integration test accepts exactly the two original cases and exercises ten valid, missing, substituted and failure variants without promoting other cases.
- Missing CI database configuration produces two explicit BLOCKED records with no claimed product assertions; independent validation PASS.
- Application and Edge typechecks, migration-tail contract (9/9), migration source guard, PR C browser-config inventory, workflow YAML, PR 1A/1B/1E source boundaries, catalog metadata and traceability PASS.

- Actual product browser journey: **2/2 PASS** (Desktop Chrome and Pixel 7). Both execute unknown import response → exact replay → create → update → reload → retained delete → reload through real handlers and PostgreSQL. Each finishes with three task rows (two active, one retained), one import, four receipts, four audits and maximum version 3. Independent verification confirms all 26 source digests and database/server/preview cleanup at execution; final staging subsequently removed excess EOF blank lines only. Candidate CI regenerates source binding for the committed tree. The connected run exposed and corrected SQL timestamp decoding, missing-date rendering, mobile clipping and project-navigation startup timing. Secret hygiene and final diff checks also PASS.

A later candidate CI check exposed an unhandled runtime-authority exception in the globally mounted Delivery provider on blocked public/sign-in pages. Render now exposes no Delivery data in that state while commands retain strict authority checks. All eight existing desktop/Pixel 7 blocked-access browser cases PASS, including zero backend/provider traffic. The authenticated startup wait remains intact. Exact-candidate CI remains **planned verification** until the final commit results are recorded. The browser fixture uses synthetic local authentication and a persisted Docs generation as preconditions; it executes the production command/query handlers and actual PostgreSQL RPCs. It does not prove hosted authentication provisioning or document generation. Enforce existing required candidate CI; do not repeat unrelated broad local regressions.

## Rollback and remaining scope

Disable new operational writes and retain authorized read-only projections if the new authority is unavailable. Preserve committed receipts, audits and lineage. Correct an applied schema forward; never restore an unsafe browser-write path or rewrite history. Revert application/client/handler/evidence changes together only where the resulting UI remains read-only. Tear down only task-created disposable databases and loopback processes, and fail verification if cleanup is incomplete.

The remaining 50 requirements are still tracked in three groups: 16 Assess/Govern/Studio lifecycle cases, 20 Delivery/Monitor/end-to-end/recovery cases, and 14 V1 Assess/private-download/Admin/AI/EI cases. This PR advances the original Delivery authority prerequisites; it does not claim full product or production readiness. The approved later authenticated integration and exact-candidate synthetic rollout remain necessary. Any protected hosted approval is a separate execution boundary.
