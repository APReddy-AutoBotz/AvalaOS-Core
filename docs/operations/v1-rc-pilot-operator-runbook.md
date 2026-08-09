# V1 RC Pilot Operator Runbook

## Boundary and canonical journey

This runbook verifies the main-derived V1 release candidate with local, disposable, synthetic data. It never authorizes deployment, live Supabase/Vault/provider access, real credentials, customer data, production operations, or security/compliance claims. GitHub Actions is authoritative for disposable PostgreSQL/Supabase and Chromium/Playwright runtime gates.

The displayed `Assess (assess-proc-ap-invoice-exception) → Govern → Studio (docgen-ap-invoice-exception) → Delivery (proj-ap-invoice-exception) → Monitor (pack-ap-invoice-exception)` lineage is a **synthetic presentation fixture only**. Its IDs come from demo data. In particular, `docgen-ap-invoice-exception` is a legacy `DocumentGeneration`, not a canonical governed Studio aggregate or revision. Server-committed Assess decisions, Govern approvals, Studio aggregate/revision records, Enterprise Delivery packages/work items, receipts, effects, and exact versions remain authoritative; this RC surface does not bind or mint them.

## Configuration matrix

| Mode | Data/infrastructure | Provider/BYOK | Evidence status | Permitted use |
| --- | --- | --- | --- | --- |
| Demo | Repository synthetic fixture and demo adapters | No real key or live call | Synthetic presentation only | Controlled demonstration |
| CI/local synthetic | Local Node; disposable PostgreSQL/Supabase and Chromium where workflows supply them | Mock responses and secret references | Exact-command/workflow evidence only | RC verification |
| Pilot | Server-authoritative identity, tenant/workspace, HTTPS Edge routes, private secret adapter, read-only/feature controls required | Customer key through server boundary only | Configured but not live-verified | Not authorized by this PR |
| Production | Approved environment, operations, backup/restore and incident controls required | Separately approved live validation required | Not proven / hosted / live | Prohibited here |

`VITE_RC_COMMIT_SHA` may contain the exact 40-character candidate commit. Never store keys, tokens, signed URLs, customer records, project references, or infrastructure identifiers in examples or evidence.

## Install and exact-head verification

1. Start at the exact PR head with a clean worktree; run `npm ci` and `npm run test:v1-rc`.
2. Run all available source suites. Unavailable database/browser services are `not run`, never a pass.
3. Require Core CI, Enterprise Intelligence, Trust Assurance, Studio Governed Artifacts, PR1F, PR1G, and V1 Release Candidate Evidence at the same SHA. A workflow file existing in the repository is not execution evidence.
4. Inspect the safe `v1-rc-evidence-<sha>` artifact: `commit`, checkout identity, generator workflow/run identity, plan digest, and `liveHostedValidation: not_run` must be explicit. Every positive composed check must contain the exact workflow name and ID, run ID, candidate head SHA, `success` conclusion, and provenance. A missing exact-SHA run is `missing` / `not_run`, and the aggregate remains `incomplete_exact_sha_evidence`.
5. Exercise the canonical path with Desktop Chrome and Pixel 7. Pass requires no horizontal overflow, visible focus, keyboard operation, meaningful names/ARIA, understandable bounded errors/read-only copy, and applicable axe gates.

No paid hosted dependency is required for source verification.

## Recovery evidence matrix

| Scenario | Required observation |
| --- | --- |
| Maintenance/read-only or feature disable | Mutations fail closed; authorized evidence reads remain available. |
| Stale/revoked then restored authority | Denial occurs before receipt disclosure; newly authorized retry obeys exact replay law. |
| Response loss | Same receipt returns the committed effect without duplication. |
| Provider disable/BYOK failure | Stable sanitized error; no browser secret, raw payload, or fallback success. |
| Studio/Delivery handoff failure | Retry preserves source/version/receipt/effect identity and creates no duplicate governed artifact. |
| Monitor worker retry/reconciliation | Bounded processing converges or exposes a blocker; no unbounded retry loop. |
| Trust publication withdrawal | Publication withdraws while retained evidence remains readable under authority. |
| Governed rollback/read-only | No mutation, side effect, provider execution, or publication occurs. |

Each row requires a named executable exact-head result; a narrative or screenshot alone is insufficient.

## Rollback and troubleshooting

1. Enable global maintenance/read-only or server-authoritative feature disablement.
2. Stop mutations/provider routes. Preserve immutable receipts, approvals, evidence, artifacts, audits, and Trust history.
3. Confirm authorized reads work and writes fail with stable non-disclosing errors.
4. Reconcile bounded due work/response-loss receipts without issuing a new effect identity.
5. Forward-fix additively; never rewrite accepted migrations or destructive history.
6. Re-run the exact-head workflow matrix before controls are lifted. Deployment or hosted access requires separate approval.

If build SHA is `not injected`, rebuild with `VITE_RC_COMMIT_SHA=$(git rev-parse HEAD)`. If database/Playwright is unavailable, record `not run` and rely on exact-head Actions. If any test asks for a real provider key, stop and use mocks. Duplicate effects require read-only/disablement and systemic correction. Overflow or inaccessible controls fail the viewport gate.

## Pilot acceptance checklist

- [ ] The candidate SHA matches every workflow and manifest.
- [ ] Synthetic presentation lineage is explicitly distinguished from canonical server-authoritative resources; independently executed server tests prove the actual process/evidence/resource/version contracts.
- [ ] Deterministic scores, risk/approval law, tenant/RLS/capability/version authority, Trust separation, and BYOK boundaries are unchanged.
- [ ] Every recovery row has named executable exact-head evidence.
- [ ] Desktop Chrome and Pixel 7 accessibility/responsive checks pass without horizontal overflow.
- [ ] Deterministic performance measurements meet repository budgets; otherwise record `not run` or fail.
- [ ] Pilot configuration uses secret references only.
- [ ] Rollback/read-only preserves authorized reads and prevents mutation.
- [ ] No hosted/live, production, security-certification, or compliance-certification claim is made.

Any absent item blocks pilot acceptance. Passing remains internal pilot evidence, not production or certification proof.
