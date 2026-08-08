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
| Actual-response CORS | executed evidence | command/query response helper passed 200/400/403/404/409/503 plus canonical OPTIONS assertions with retained cache/Vary behavior |
| Disposable PostgreSQL 16 | executed evidence | 34/34 scenarios passed against a loopback-only disposable PostgreSQL 16 container, including six controlled selected-aggregate concurrency cases; the configured non-loopback `DATABASE_URL` was not used |
| Chromium Desktop Chrome/Pixel 7 | executed evidence | dedicated canonical-pilot Trust harness passed 6/6, including exact selected-workspace transport, deterministic B-to-A switch/late-completion fencing, denied-A no-fallback, real journey, revoked/version conflict, read-only, and horizontal-overflow assertions |
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

The disposable PostgreSQL harness now bootstraps roles plus `auth.users`/`auth.uid()`, creates and cleans five databases, and covers the full chain, accepted-main upgrade, populated upgrade, dirty rollback, executable Trust authority, server hashes, exact reviews, publication, replay/conflict, revocation/staleness, buyer projection, audit rollback, and controlled publication/aggregate mutation interleavings. Local PostgreSQL 16 passed 34/34 and the dedicated local Chromium matrix passed 6/6; exact-head GitHub Actions remains publication authority.

## Request-context and publication-atomicity closure

Both Edge handlers now build every actual response through one Trust-owned helper layered on the canonical shared CORS headers. Executable construction tests cover command and authenticated query responses at 200, 400, 403, 404, 409, and 503, plus OPTIONS, command `no-store`, query `private, no-store`, and `Vary: Authorization`. Existing authenticated `supabase.functions.invoke` client tests continue to prove typed envelopes reach the caller without caller-supplied bearer transport.

The connected workspace now accepts only the exact `OrganizationProvider` selection passed by `TrustCenterPanel`. The bounded browser harness holds A's query and B's command behind explicit release gates: B internal/buyer/mutation calls use B; switching to A immediately removes B and shows loading; releasing A displays only A; releasing the late B command cannot overwrite A; the next mutation uses A; and a selected A without `trust.read` shows revoked with an empty call log even though B is readable.

The private snapshot-selection helper locks the snapshot's exact claims and evidence in deterministic UUID order before hash, currentness, evidence-law, review, participant, pointer, event, lifecycle, receipt, and audit effects. Six multi-connection scenarios prove both directions for claim revision, evidence withdrawal, and evidence supersession: publication-first excludes mutation until commit, while mutation-first causes publication to wait and then reject with no pointer, publication-event, snapshot lifecycle/version, receipt, or audit delta.

## Exact-head focused correction

Snapshot withdrawal now locks the exact published tenant/workspace snapshot and compares its current version with `p_expected_version` before any withdrawal event, pointer, lifecycle, audit, or receipt effect. The executable matrix asserts stale rollback, exact-current withdrawal, and exact replay without duplicate events. Immediate revocation uses the accepted PR 1B workspace-membership transition `active -> disabled`; restoration uses `disabled -> active`, with the authorization-version bump reloaded before replay.

The Trust browser spec and harness moved to `tests/trust-assurance/browser/`, outside the retained default Playwright `tests/browser` directory. Its dedicated configuration uses a prebuilt feature harness, `vite preview` on fixed loopback port `4417`, a 180-second server timeout, CI-safe server reuse, and Desktop Chrome plus Pixel 7 projects.

**DEFERRED POST-#221 CONVERGENCE:** the accepted Studio PR #217 checker assumes its migration is the chronological repository tip, which the later Trust migration invalidates; the old-main dependency tree also retains the moderate `dompurify` advisory. Shared Studio/package files are collision-controlled and were not weakened or edited. The Trust migration timestamp collision also remains deferred until PR #221 is merged and the final migration maximum is known.

## Runtime, authenticated transport, and participant authority closure

Trust Center now consumes the single canonical `getRuntimeModeResolution()` authority. The feature workflow/config uses `VITE_AVALA_RUNTIME_MODE=pilot`, obsolete Trust-owned `VITE_RUNTIME_MODE` usage is rejected by the boundary scan, and the browser harness mounts `TrustCenterPanel` with component-layer injected transport. This proves the canonical pilot route selects the governed connected Hub without requiring live Supabase.

Both browser query and command defaults use the configured canonical Supabase client's authenticated `functions.invoke` transport. Query is a strict POST contract containing only organization, workspace, authorization version, and the exact `internal|buyer` view. The client recovers bounded Trust envelopes from Supabase HTTP error contexts, strictly decodes success, preserves `AUTHORIZATION_STALE`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `REVIEW_REQUIRED`, `PUBLICATION_BLOCKED`, `ACCESS_DENIED`, and buyer `NO_PUBLICATION`, and converts malformed/unavailable transport to `PERSISTENCE_UNAVAILABLE`. No relative fetch, caller bearer, localStorage token read, second Supabase client, or hard-coded URL exists.

Publication now calls one private Trust helper for each stored creator and reviewer inside the publishing transaction. The helper follows PR1B authority semantics exactly and share-locks active/non-deleted profile, exact organization membership, exact workspace membership, organization, and workspace rows. It grants no capability and does not mutate authorization state; publisher capability/version remain independently fenced. Six independent profile/membership revocations rejected with zero Trust effects, restoration yielded one exact publication, and a deterministic transaction-lock race proved revocation prevents buyer exposure. Resource and snapshot review continue to fresh-authorize the current reviewer; withdrawal intentionally does not revalidate historical participants.
