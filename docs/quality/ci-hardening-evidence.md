# CI Hardening Evidence

## Changed Files

- `.github/workflows/ci.yml`
- `docs/quality/ci-hardening-evidence.md`

## CI Changes

- Renamed workflow from `KlarityPM CI` to `AvalaOS Core CI`.
- Renamed the normal verify job display name to `AvalaOS Core Quality Gates`.
- Kept existing `pull_request` and `push` triggers.
- Kept Node 22, `npm ci`, and npm cache behavior.
- Added normal CI gates in the requested order: dependency audit, typecheck, static AI-boundary scan, secret-hygiene scan, aggregate test suite, and production build.
- Removed the standalone `npm run test:requirements` CI step because `npm run test` already includes it.

## Supabase Smoke Gating

Supabase smoke checks remain in the separate `supabase-smoke` job and continue to require `vars.RUN_SUPABASE_SMOKE == 'true'`. Supabase secrets remain scoped to that optional job only. Normal PR CI does not require live Supabase secrets.

## Risk

Branch protection or required-check settings may still reference the old workflow or job names (`KlarityPM CI` or `Build, Typecheck, and Deterministic Tests`) and may need repository settings updates after this PR merges.

## Scope Confirmation

No runtime code, product behavior, UI behavior, scoring, schema, migrations, Supabase functions, package files, dependencies, or Health implementation files were intentionally changed.

## Local Verification Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | `tsc --noEmit` completed successfully. |
| `npm run test:ai-boundary-static` | Pass | Static scan reported 0 forbidden hits and 0 stale allowlist entries. |
| `npm run test:secret-hygiene` | Pass | Static scan reported 0 forbidden hits and 0 tracked `.env*` files. |
| `npm run test` | Pass | Full aggregate suite completed successfully. Generated `.agent/provider-resolver-tests/` and `.agent/provider-resolver-integration-tests/` were removed after verification. |
| `npm run build` | Pass | Vite production build completed successfully. |
| `npm audit --audit-level=moderate` | Pass | Found 0 vulnerabilities. |
| `git diff --check` | Pass | No whitespace errors reported; Git emitted LF-to-CRLF working-copy warnings only. |
