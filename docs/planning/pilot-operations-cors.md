# Pilot Operations browser response correction

## Objective and authority

Complete the existing synthetic operator path by allowing the browser to read the
Pilot Operations endpoints' governed responses. Baseline is merged PR #270,
`458c1f3044ceab814c9c1ffd1e52590c2532c196`, whose tree equals tested head
`82aca671716b333198c046168e6726f80b360a0c`. Candidate checks and post-merge Core CI
passed. AP separately approved that merge and the temporary read-only operator UI
verification.

That verification authenticated and issued one query but could not render the
panel. The existing API check succeeded; a read-only follow-up confirmed that
preflight allows the origin while the actual JSON response does not. Both Edge
entrypoints have this confirmed source defect. Temporary access was removed,
fresh-session denial passed, all 39 protected-table fingerprints were preserved,
and the preview/session were closed. Providers remained OFF and the mutation flag
absent/OFF. The campaign remains 11 consumed effects, USD 6.0553712 conservative
charges and zero unresolved reservations; this correction includes no paid call.

All three read-only architecture, security and quality reviews closed before
writes. Their shared recommendation is two imports and two header spreads using
the existing shared CORS contract. Under the fixed workspace-write profile,
Wave 2 uses one implementation worker for endpoints, focused tests and runbook;
the controller owns integration, active authority, source provenance and one PR.
No nested delegation. Existing worktrees and stash remain preserved.

## Scope and trust boundary

Import `corsHeaders` beside `handleOptions` in both Pilot Operations functions and
include it in each existing JSON response helper. Retain JSON content type and
`cache-control: no-store`. Preserve all status codes, sanitized bodies, bearer
authentication, current tenant/capability/authorization-version checks, command
decoding, feature flag, expected version, idempotency, RPC inputs and ordering.

Wildcard origin is the existing shared contract; no credential-sharing header,
origin reflection, new CORS framework, dependency change, schema or migration is
included. CORS permits reading an already-authorized response; it is not server
authorization. This does not grant operations capabilities or enable mutations.

## Acceptance and focused verification

1. Both actual entrypoints return the existing CORS contract on preflight and JSON
   success/denial/error responses; JSON responses retain `no-store`.
2. Success preserves tenant scope and authorization version. Denied and disabled
   cases issue no persistence request; sanitized error mappings stay unchanged.
3. A real browser on one loopback origin can read an actual query response and a
   disabled-command response from the second origin, including real preflight.
   Authentication/tenant/persistence dependencies are synthetic test doubles;
   the production entrypoints and response helpers execute. This is local
   transport evidence, not hosted authentication or database evidence.
4. Existing feature source and Desktop Chrome/Pixel 7 browser checks pass.

Commands: `npm run test:pilot-operations`, `npm run typecheck:edge`,
`npm run test:browser:pilot-operations`, `git diff --check`. Refresh generated
source bindings only after source/docs settle with
`node scripts/buildTranscriptFlowPrCRegistry.mjs --refresh-bindings`, then run
`npm run test:transcript-flow:delivery-monitor-evidence-contract`. This refresh
records source identity, not an executed acceptance pass. Existing CI stays intact;
no unrelated local regression, database or recovery rerun is warranted.

## Rollout, rollback and proof limits

Merge and deployment are separate approval boundaries. After approval, deploy and
source-verify only the two changed functions on the existing synthetic target,
then use the private pilot-mode UI with temporary `operations.read` to verify the
empty-release panel and zero command/provider requests. Remove access in `finally`,
confirm fresh-session denial and preserved protected state. Keep both providers
OFF and the operations mutation switch absent/OFF. Do not bypass browser CORS or
substitute headers to claim hosted success.

Rollback redeploys the prior two function sources, preserving all database state;
the browser then fails closed again. The PR #270 frontend fix can remain. No
production action, hosted-target restore or broader readiness claim is included.
Corrected hosted behavior remains **not run** until separately executed.

## Executed verification

- `npm run test:pilot-operations` — PASS, including 13 actual-entrypoint HTTP
  cases, retained command checks, 17 model cases, seven projection cases, ten
  panel assertions, 19 connected-control checks and the CI/manifest contracts.
- `npm run test:browser:pilot-operations` — PASS, 12/12 Desktop Chrome and Pixel 7
  cases including the production-mode build. Each cross-origin case observed
  actual OPTIONS/POST requests, readable query success and `FEATURE_DISABLED`,
  retained no-store, one mocked query RPC and zero command RPCs.
- Read-only replay against unchanged PR #270 source with the same entrypoint
  fixture — PASS: reproduced query 200/no-store with missing allow-origin.
- `npm run typecheck`, `npm run typecheck:edge`, `npm run test:secret-hygiene`
  and `git diff --check` — PASS. No forbidden secret-hygiene hits.

The first focused HTTP run passed 12/13; one assertion compared a VM object with
a host-realm object. Copying the captured primitive target fields into the host
realm corrected the fixture before the passing suite. Review also corrected the
fixture's Error realm and a browser assertion for an unexposed response header;
production behavior was not changed to accommodate tests. A worker test process
that stalled without a result was stopped before the passing controller run.

Refresh and verify the generated source bindings before publication; record that
command's result with the PR. Candidate CI and preview are pending at publication.
Corrected synthetic deployment and hosted UI verification are **not run**.
