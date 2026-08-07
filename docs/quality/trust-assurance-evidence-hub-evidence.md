# Trust Assurance Evidence Hub implementation evidence

## Scope and start evidence

The branch began from supplied live/local baseline `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5`. The supplied PR #221 state was open/Draft/unmerged at `07d2cfee5a4116c0d2acbf71758f9f71636ae1df`. Local working directory, clean status, and Node 22 passed. Shell GitHub authentication was intentionally not used. This record contains sanitized source/test evidence only.

## Implemented candidate

The candidate adds deterministic proof/freshness/hash/publication law, strict internal/buyer decoders, capability-gated typed commands, a fail-closed Edge boundary, normalized PostgreSQL authority, Admin Hub states, feature boundary tests, dedicated CI, and architecture/migration/rollback documentation. Static Trust Center data is labeled noncanonical and visible only in explicit demo/test modes.

## Test matrix status

| Check | Status | Evidence |
| --- | --- | --- |
| Domain and strict decoder | executed evidence | `node scripts/runTrustAssuranceTest.mjs`: domain and decoder suites passed |
| Typed command/authority | executed evidence | `node scripts/runEdgeTypeScriptTest.mjs …trustAssuranceCommand.test.ts`: command suite passed |
| Boundary/migration scan | executed evidence | migration contract: 11 governed tables; boundary scan passed |
| Typecheck/default regression/build/static security/audit | executed evidence | `npm run typecheck`, `npm run typecheck:edge`, `npm test`, `npm run build`, AI-boundary, secret-hygiene, audit, and diff checks passed; build emitted only the retained Browserslist-age warning |
| Disposable PostgreSQL 16 | blocked / not run locally | `psql` is unavailable; dedicated GitHub Actions service job is final authority |
| Chromium desktop/Pixel 7/accessibility | blocked / not run locally | Required browser libraries unavailable; do not install OS packages. GitHub Actions final authority |
| Hosted/live Supabase, deployment, Storage, providers | not run | Explicitly outside authority |

## Failure modes and rollback

Malformed/stale/revoked/cross-tenant requests fail without existence disclosure. Feature-disabled/read-only mode blocks mutation, preserves durable history, and never falls back to static authority in pilot/production. Forward additive repair is required. No hosted rollback proof is claimed.

## PR #221 and deferred convergence

No PR #221-owned file is changed. The AP-supplied publication audit finds zero material changed-file overlap between PR #222 and PR #221 except the migration timestamp namespace: both currently use `20260807120000`, and PR #221 extends through at least `20260807130000`. The Trust migration rename is therefore a mandatory post-#221 convergence blocker. After PR #221 is human-merged, perform the single rebase, rename the Trust migration to a unique timestamp strictly later than the final accepted migration maximum, and complete the deferred shared package/default-chain, authority-map, status, risk, roadmap, task-ledger, source-of-truth, and navigation integrations. Rerun exact-head CI/review before Ready. This PR must remain Draft meanwhile.

## Unsupported boundaries

No cloud, product, security, compliance, hosted, production, pilot, buyer, release-candidate, certification, incident, backup/restore, or deployment readiness is asserted. No live operation occurred.

## Systemic hardening audit

The pre-correction audit found the same browser-authority defect family across command payloads, reviews, snapshots, and publication: callers supplied canonical hashes or arbitrary selection JSON; the query endpoint always failed; the Admin surface had no server journey; the PostgreSQL script lacked Supabase bootstrap and executable domain scenarios; concurrent receipt claim lacked a logical-action lock; PostgREST errors could escape as generic failures; and browser tests rendered hand-authored HTML rather than the bounded component/client.

The correction removes canonical/resource/snapshot hashes from accepted payloads, strictly decodes every operation, derives hashes/selections/review targets in PostgreSQL, re-resolves current evidence at publication, serializes receipt claims with an advisory transaction lock, exposes private fresh-authority internal and buyer projections, connects the Admin surface through strict clients, and replaces the static browser test with a real React/client harness. Deterministic pre-effect failures roll back and do not persist receipts; this is safe because no canonical effect occurred, current authority is rechecked before every attempt/replay, and a committed receipt remains the only replay authority.

The disposable PostgreSQL harness now bootstraps roles plus `auth.users`/`auth.uid()`, creates and cleans five databases, and covers the full chain, accepted-main upgrade, populated upgrade, dirty rollback, executable Trust authority, server hashes, exact reviews, publication, replay/conflict, revocation/staleness, buyer projection, and audit rollback. Local PostgreSQL and Chromium remain blocked/not run; GitHub Actions is execution authority.

## Exact-head focused correction

Snapshot withdrawal now locks the exact published tenant/workspace snapshot and compares its current version with `p_expected_version` before any withdrawal event, pointer, lifecycle, audit, or receipt effect. The executable matrix asserts stale rollback, exact-current withdrawal, and exact replay without duplicate events. Immediate revocation uses the accepted PR 1B workspace-membership transition `active -> disabled`; restoration uses `disabled -> active`, with the authorization-version bump reloaded before replay.

The Trust browser spec and harness moved to `tests/trust-assurance/browser/`, outside the retained default Playwright `tests/browser` directory. Its dedicated configuration uses a prebuilt feature harness, `vite preview` on fixed loopback port `4417`, a 180-second server timeout, CI-safe server reuse, and Desktop Chrome plus Pixel 7 projects.

**DEFERRED POST-#221 CONVERGENCE:** the accepted Studio PR #217 checker assumes its migration is the chronological repository tip, which the later Trust migration invalidates; the old-main dependency tree also retains the moderate `dompurify` advisory. Shared Studio/package files are collision-controlled and were not weakened or edited. The Trust migration timestamp collision also remains deferred until PR #221 is merged and the final migration maximum is known.
