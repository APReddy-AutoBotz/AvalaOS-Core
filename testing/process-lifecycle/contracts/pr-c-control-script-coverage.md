# PR C controlled-human control-script coverage contract

This feature-owned gate measures the ten changed production JavaScript control helpers with Node 22's built-in test coverage. It is additive to the existing controlled-human source command: the original Node test segment, including the optional local PostgreSQL integration test, remains intact. The measured runner then executes the non-optional helper suites and the real credential-preflight entrypoint fixture.

## Acceptance boundary

- The inventory contains exactly the ten source paths declared by `scripts/runPrCControlledHumanScriptCoverage.mjs`, each bound to its current SHA-256 digest.
- Node's built-in LCOV reporter must emit authentic non-empty coverage. Every inventory path remains visible; an unloaded helper is disclosed truthfully as `loaded: false` with zero measurement and is never silently excluded or force-imported.
- The test process must pass with zero failed, cancelled, skipped, or todo tests. A green process without TAP, LCOV, or both exact scenario reports fails closed.
- The actual production credential-preflight entrypoint runs in a clean isolated Git checkout with the accepted base as ancestor, exact source-before/source-after identity, Node 22, the fixed command, and one exclusive output file. External test-only modules replace only `pg.Client`, Supabase client construction, and `fetch`; no production injection surface is added and no network or real database is reachable.
- The isolated checkout overlays only the governed candidate inventory plus the five exact removed `pr264-controlled-human-{checkpoint,edge-deploy,prepare,quiesce,verify}.yml` workflows, and verifies byte-or-absence equivalence before its synthetic commit. `.agent/`, `output/`, `tools/`, `docs/marketing/`, `.env*`, and `scripts/testPilotOperationsRecoveryPostgres.mjs` remain expressly outside the overlay.
- Mandatory negatives cover wrong output path, dirty source, nonancestor source, source change during execution, output collision, signing-key whitespace and bounds, password type and maximum length, and the 16 KiB artifact limit.
- The report binds the accepted base, current HEAD, governed working-tree digest, exact source hashes, exact test inventory, exact scenario-report hashes, built-in line/branch/function measurements, and uncovered line/branch/function paths.

No new numeric percentage threshold or performance budget is defined. The gate requires authentic execution and complete measurement; percentages and uncovered paths are disclosed for review.

The built-in LCOV measurement covers execution in the parent Node test workers. The isolated production-entry child is a separately mandatory scenario contract and is not folded into the numeric LCOV counts. Its candidate source hashes are independently checked through the production source-identity result; the report must not imply that child-only entrypoint branches contributed to the percentages.

## Evidence and exclusions

The canonical command creates one fresh exclusive attempt beneath the resolved configured `output/pr-c-controlled-human-script-coverage/` boundary, writes only its sanitized JSON summary there, and emits the complete sanitized measurement plus report digest to the canonical command log. It preserves prior attempts. Raw TAP, raw LCOV, temporary scenario reports, temporary Git checkouts, transport traces, database values, URLs, credentials, and V8 dumps are deleted or remain outside retained evidence. The fixture environment is allowlisted and does not inherit hosted, provider, GitHub, Netlify, Supabase, controlled-human secret, `NODE_OPTIONS`, `NODE_V8_COVERAGE`, or arbitrary Git configuration. Its empty owned Git config disables system configuration and binds `safe.directory` only to the resolved governed root; wildcard trust, hooks, credential helpers, and extra inherited Git config are excluded.

This is local synthetic/source evidence. PostgreSQL, hosted credential delivery, deployment, service-credential authentication, temporary-token authentication, human testing, real providers, pilot, production, readiness, and certification remain separate `not_run`, planned, or prohibited boundaries.

## Rollback

Remove the measured runner, its self-test, the entrypoint fixture files, and this contract together; restore the prior controlled-human source command unchanged. Keep the protected workflow blocked and retain prior failed hosted attempts. Never roll back by adding production injection parameters, weakening TLS or source identity, allowing skips, excluding an inventory helper, relaxing Environment approval, or restoring secret relay.
