# Governed Delivery And Monitor PR C Controlled-Human Walkthrough

Status: `not_run`

This is a repeatable synthetic-data walkthrough seed for controlled human testing after the exact-head automated gate passes. It is not executed evidence. It does not authorize hosted access, a provider call, deployment, customer data, infrastructure mutation, or any pilot, production, security-readiness, or compliance-readiness promotion.

## Preconditions

- Use the exact Draft PR head and record its Git SHA, terminal GitHub run ID/attempt/artifact digest, and terminal Netlify Deploy Preview URL from PR #264's external evidence block. The preview's immutable deployment commit must equal that Git SHA.
- Use only `testing/process-lifecycle/fixtures/delivery-monitor-pr-c/` identities and synthetic content.
- Reset the synthetic workspace before and after the walkthrough.
- Keep requester, reviewer, and approver distinct.
- Confirm every automated Test ID has its own assertion-owned result before starting.
- Stop if the environment is hosted/live, contains a real provider secret, contains customer data, or requires deployment/infrastructure access.

## Execution-time handoff record

Do not write final values into this tracked document because doing so would change the source digest it is meant to identify. Immediately before a human session, copy the immutable values from PR #264 into the sanitized session record:

- exact commit SHA;
- GitHub workflow path, run ID, run attempt, job conclusion, artifact name, and artifact digest;
- exact terminal-success Netlify Deploy Preview URL and its immutable deployment commit;
- explicitly authorized non-live environment label;
- exact seed command and exact reset command; and
- scheduled distinct human mappings for requester, reviewer, and approver.

Any absent value is a stop condition. A branch name, latest-preview alias, local evidence bundle, prior workflow attempt, or commit-mismatched deployment is not a substitute.

## Seed and reset contract

The seed must create one approved assessed Studio artifact, one approved direct Studio planning artifact, one eligible Studio-to-Delivery handoff, one manual Delivery draft, deterministic proposed work items, and one exact approved-baseline fixture. Reset may delete only disposable synthetic fixture state in the explicitly selected non-live workspace. Canonical source migrations and historical evidence are never rolled back or rewritten.

The repository currently defines the synthetic fixture and reset safety contract but does not claim an authorized interactive non-live tenant or an executed seed/reset command. Do not adapt the disposable PostgreSQL or browser-test harness into hosted state. The AP must identify the authorized non-live workspace and approve its repository-owned seed/reset entry point before the walkthrough starts. The implementation PR does not claim seed/reset was run until a controller records the exact commands, build SHA, non-live environment label, start/end time, and sanitized result. Until then, the status above remains `not_run`, and if no authorized commands are present the walkthrough is `not ready` rather than passed.

## Personas

Run sequentially as the synthetic requester, Studio reviewer, Studio approver, Delivery target acceptor, Delivery consumer, Delivery author, Delivery reviewer, Delivery approver, Monitor viewer, revoked actor, same-organization other-workspace actor, and cross-organization actor. Their stable mappings are in `personas.json`.

## Walkthrough

1. As requester, preview and request the exact approved Studio artifact handoff. Verify request creates no Delivery package.
2. As target acceptor, request changes. Verify no target draft. Start a new exact request, review it, and reject it. Verify no target draft.
3. Start another exact request. As independent reviewer and approver, advance it. As Delivery consumer, explicitly consume it once. Verify response replay presents the same target and does not create another package.
4. As Delivery author, inspect deterministic item citations, edit one item with rationale, compare the immutable descendant diff/history, and accept or reject every current proposal.
5. Confirm the server projection reports the full bounded item set resolved; never submit an unchanged or partial page as a package revision. As Delivery reviewer, request changes and verify Monitor remains unchanged. Commit only explicitly edited descendants through the authorized server flow, review the complete current package again, and as Delivery approver perform the final exact approval.
6. Create one Monitor baseline using only the exact approved package ID, package version, and package-version ID selectors. Do not submit an accepted-set digest, approval identity, item selectors, or Monitor content; PostgreSQL derives them. Replay creation and verify the same baseline.
7. As Monitor viewer, compare the Enterprise and primary Monitor surfaces. Verify identical baseline ID, version, status, accepted count/type counts, and lineage classification. Confirm neither surface exposes hashes, approval identities, or raw source-package identities; exact hash binding belongs to the PostgreSQL evidence, not the browser walkthrough.
8. Verify Monitor has no upload, editor, item-decision, task mutation, execution, completion, due-date, or live-telemetry control. Confirm legacy project/task metrics are clearly non-authoritative.
9. Repeat the direct Studio and direct Delivery paths. Confirm both remain visibly `Not assessed · Planning only` through handoff, package approval, and Monitor.
10. As revoked, same-organization other-workspace, and cross-organization actors, attempt projection and mutation access. Record only the stable non-disclosing result; verify no receipt, audit, target, item version, approval, or baseline effect.
11. Exercise keyboard-only handoff, item edit, rationale error, and confirmation flows. Verify focused error summary, preserved input, logical focus return, non-color status/citation cues, and no horizontal overflow at Pixel 7 and 200% zoom.

## Evidence record

Record scenario/Test IDs, persona, organization/workspace labels, exact build SHA, timestamps, selected safe version labels, decisions, and sanitized result references. Never record raw source text, hashes not already approved for sanitized evidence, keys, tokens, provider payloads, storage paths, signed URLs, raw logs, object identifiers, or infrastructure identifiers.

## Exit disposition

An executed walkthrough may establish only controlled, synthetic, non-live usability evidence for this PR head. It cannot establish hosted behavior, real-provider behavior, deployment, pilot, production, security certification, compliance certification, or execution readiness. Material defects require a source fix and rerun; do not convert them into accepted limitations.

## Rollback and read-only fallback

Rollback the presentation by disabling `module_handoffs_enabled`, `direct_delivery_planning_enabled`, `delivery_item_review_enabled`, and `monitor_approved_baseline_enabled` through the separately authorized server configuration path. Preserve committed handoffs, immutable item versions, decisions, approvals, and baselines; do not delete or rewrite them. While mutations are disabled, authorized safe projections remain readable; while a capability, page, or projection is unavailable, the UI falls back to an explicit read-only/unavailable state and never substitutes legacy metrics, an empty baseline, package completeness, execution state, or live telemetry.
