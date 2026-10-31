# AvalaOS Core: remaining delivery plan

Snapshot: **2026-10-31**. The objective is controlled authenticated synthetic business UAT, followed by separately gated production readiness. [Current status](05_IMPLEMENTATION_STATUS.md) records executed evidence; [product guide](09_END_TO_END_PRODUCT_GUIDE.md) defines the intended journey. Earlier PR1A–PR1G and PR225/227 plans are historical milestones, not the active queue.

## Remaining gates, in order

Current authorized work extends draft PR #346 into a canonical AP Invoice Exception review candidate before the merge gate below. The documentation/CI correction and complete disposable Assess/Govern/edited Studio → canonical Delivery → Monitor journey pass locally, including persistence, lineage, replay and failure recovery. Publish this implementation with its evidence and verify fresh exact-candidate CI before independent review. The [completion plan](planning/hosted-acceptance-completion.md) owns the short plan and single blocker list. Repository fixes, local/disposable tests, commit/push and draft PR updates are authorized; merge and new hosted acceptance remain blocked.

| Gate | Work and owner | Exit evidence | Current state / dependency |
| --- | --- | --- | --- |
| 1. Publish current correction | Engineering: publish the locally verified downstream actor-transition correction with reconciled docs in one draft PR. | Exact candidate commit, focused local evidence and owned file diff; local/GitHub content match. | Publication authorized. No separate documentation-only PR. |
| 2. Verify candidate | Engineering: inspect original exact-head CI and independently validate sanitized evidence. | Required checks, fresh bound preparation archives, PR-C contracts and retained-only reconstruction; truthful failures preserved. | Planned verification; no blind workflow retry. Retained-only reconstruction is not full acceptance. |
| 3. Merge and verify release | Owner approves merge; engineering verifies the merged tree and original release checks. | Identical verified candidate/release tree plus fresh release evidence. | Pending explicit merge approval and candidate gates. |
| 4. Integrated synthetic acceptance | Owner approves one exact-release run; engineering performs authorized read-only preflight, result verification and independent cleanup. | All required integrated cases evidenced on that release, quiescence/revocation/residue checks, owned frontend/policy/handoff cleanup. | Blocked until approval; current result remains older run's 61 PASS / 47 BLOCKED. No additional grants assumed. |
| 5. Immutable nonproduction parity | Engineering/owner agree exact deployment identity, safe access and environment scope. | Same-release behavior on the immutable nonproduction target, with security/cleanup evidence. | Not run for the current correction; separate approval needed. No implicit Netlify authorization. |
| 6. Human business UAT | Named business owner, reviewer, approver, delivery owner and admin execute agreed scenarios. | Reviewed module outputs, explicit handoffs, negative/recovery cases, issue disposition and human sign-off. | Pending integrated/parity gates, named participants and agreed synthetic scenarios. |
| 7. Production decision | Owner and engineering separately review operational and security requirements. | Approved deployment/configuration, access/tenant checks, monitoring, recovery/restore/rollback evidence, incident ownership and scoped provider behavior where approved. | Not proven; UAT approval alone is not production authorization. |

The current correction fixes a confirmed harness sequencing defect. It does not prove the exclusive cause of the historical hosted failure. If a new failure occurs, preserve its exact evidence, classify it, reproduce locally and correct the demonstrated cause rather than automatically retrying.

## Business UAT must answer

- Can an author create a process and obtain an understandable, deterministic Decision Pack with evidence and limitations?
- Can independent humans review, approve/reject and enforce the correct Govern controls without crossing roles or tenants?
- Can Studio produce the supported artifact, preserve edits and exact lineage, and require the appropriate review/approval?
- Can Delivery accept only eligible exact versions and expose work ownership and blockers?
- Does Monitor show the approved baseline truthfully without inventing execution, completion or value?
- Do stale, revoked, unauthorized, failed, interrupted and replayed actions fail safely and recover without duplicate effects?
- Are all exercised temporary resources cleaned, and are remaining limitations accepted explicitly?

## Forecast and controls

The earlier provisional planning target was controlled UAT on **2026-11-11**, with a candidate-review window of **2026-11-18 to 2026-11-25**. These are historical planning estimates, not a confirmed commitment or a production date. Reforecast after the corrected integrated result and required human availability are known; documentation alone must not reset or guarantee the dates.

Keep **15,000 ms / providers OFF**. No new hosted acceptance/diagnostic, merge, deployment, provider activation or runtime execution follows automatically from a documentation update. Preserve current scoring law and immutable evidence. Roll back a correction together with its coupled tests/docs/current provenance; use the governed read-only fallback rather than rewriting history.
