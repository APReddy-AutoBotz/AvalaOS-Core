# Hosted Non-Production Pilot Activation Runbook

## Status and authority

This runbook operates only the controller-supplied, dedicated AvalaOS hosted non-production pilot. It does not authorize production, production DNS, customer or PHI data, external users, real provider calls, or security/compliance certification. The discovered `Avalaos-core-dev` project is foreign: its MockMate-shaped schema and users make it an unconditional deny target. Never link, migrate, reset, drop, repurpose, or deploy AvalaOS into it.

Production remains `production_not_authorized`; customer data remains `customer_data_not_used`. Until every hosted gate produces exact-head executed evidence, hosted verification is `blocked`, not inferred from source or disposable CI.

## Required controller inputs

Supply inputs only at execution time. Never commit or upload them as raw evidence.

- dedicated Supabase target connection through the approved secret store;
- safe target fingerprint emitted by the repository preflight (a SHA-256 digest of the connected PostgreSQL system, database, and execution role identities) and migration-chain hash;
- exact approved 40-character Git head;
- explicitly linked non-production Netlify site and credential-free HTTPS origin;
- safe deployment ID, workflow/run ID, and result IDs;
- synthetic owner-controlled identities only.

Project IDs, database URLs, tokens, service-role keys, Vault references, signed URLs, object identifiers, raw logs, and secret values must not enter Git, command echo, artifacts, screenshots, or browser storage.

## Stop gates before mutation

1. Check out the exact approved head and require `git rev-parse HEAD` to match it.
2. Run the repository database fingerprint/preflight in read-only mode. Stop on foreign tables, partial initialization, dirty or stale migration history, unexpected users/data, fingerprint mismatch, or any unknown state. An empty dedicated target or an exactly compatible AvalaOS target is the only acceptable result.
3. Confirm maintenance/read-only controls and a forward-repair owner. There is no destructive reset or migration-history rewrite fallback.
4. Confirm provider adapters are deterministic simulations with egress denied. Never supply a real provider credential or endpoint.
5. Confirm the Netlify target is preview/branch non-production. `netlify.toml` intentionally fails the production context. Do not create a site, invent an ID, promote DNS, or invoke a production deploy from this procedure.

A failed or ambiguous preflight is `blocked`. Disconnect without writes and preserve only sanitized failure identity/status.

## Additive activation sequence

After all stop gates pass, the controller may execute the repository-owned activation tooling in this order:

1. enable maintenance/read-only behavior;
2. re-run the target preflight immediately before mutation;
3. bind the sanitized inventory to the exact release, target fingerprint, chain digest, and single-use nonce, then apply the canonical additive migration chain without reset or history edits:

   ```bash
   npm run hosted-pilot:preflight -- <private-sanitized-inventory.json>
   npm run hosted-pilot:authorize -- <sanitized-inventory.json> <private-token-file>
   HOSTED_PILOT_ACTUAL_RELEASE_SHA="$(git rev-parse HEAD)" npm run hosted-pilot:apply -- <sanitized-inventory.json> <private-token-file>
   npm run hosted-pilot:verify-database
   ```

   The private token file must remain outside artifacts and be deleted after the attempt. Set `HOSTED_PILOT_ENVIRONMENT_FINGERPRINT` to the safe fingerprint emitted by the immediately preceding preflight; never derive it from a caller-supplied project label alone. The apply command uses only the repository migration chain, serializes application with a database advisory lock, re-inventories and reclassifies the actual connected catalogs, auth users, target identity, relations, and checksum ledger under that lock before any compatibility or migration write, creates any Supabase pgcrypto bridge and all of its ACLs in one rollback-safe transaction, commits one additive migration at a time, and emits only sanitized status. A partial failure stays in maintenance/read-only and requires an additive forward repair;
4. verify migration state, RLS, grants, `SECURITY DEFINER`/`EXECUTE` boundaries, service-only RPCs, Storage policies, cross-tenant list/count/existence non-disclosure, session revocation, and authorization versions;
5. run idempotent synthetic bootstrap for one organization/workspace and its bounded role matrix;
   provision a distinct synthetic Recovery Promotion Operator through
   `hosted_pilot_provision_recovery_operator` only after its `.invalid` identity has active authority
   in that one tenant/workspace. The repository role grants exactly `operations.read` and
   `release.promote`: it grants no approval, Owner/Admin, business, provider, production, or
   customer-data authority. Record its current authorization version after provisioning;
6. exercise canonical AP Invoice Exception Assess → Govern → Studio → Delivery → Monitor behavior and negative stale/revoked/cross-tenant cases;
7. exercise response loss/replay, stale promotion candidate, concurrent rollback, queues/reconciliation/recovery, maintenance/read-only/kill switches, backup/restore, corrupt/wrong-version backup rejection, and fake provider success/failure/timeout/revocation/rotation with zero provider egress;
8. deploy only the exact head to the explicitly linked preview/branch target;
9. verify release/environment response headers, then run Desktop Chrome and Pixel 7 acceptance;
10. assemble the sanitized hosted manifest and run the exact-head verifier.

Do not disable maintenance/read-only behavior merely because migrations completed. Release it only after all required hosted gates pass and the controller explicitly approves non-production pilot traffic.

## Web verification

The hosted application must return `x-avalaos-release: <exact-head>` and `x-avalaos-environment: hosted_nonproduction_pilot`. Verify without exposing target credentials:

```bash
EXPECTED_RELEASE_SHA=<exact-head> HOSTED_PILOT_URL=<https-origin> node scripts/verify-hosted-deployment.mjs
EXPECTED_RELEASE_SHA=<exact-head> HOSTED_PILOT_URL=<https-origin> npx playwright test --config=playwright.hosted-pilot.config.ts
```

The browser may display server projections but cannot mint tenant, environment, release, approval, evidence, or provider authority. Backend/storage/simulated-provider failure must not render success. Hosted acceptance includes loading, error, offline, stale, revoked, blocked, accessibility, responsive overflow, and practical performance observations; missing coverage remains `blocked`.

## Hosted evidence manifest

The sanitized `manifest.json` uses schema version 1 and binds:

- exact `gitCommit`, safe one-way target/deployment fingerprints, and safe deployment/workflow identities (never the hosted origin or site/project identifiers);
- `environment: hosted_nonproduction_pilot`;
- SHA-256 target fingerprint and migration-chain hash (never their raw inputs);
- `migrationChainHash` must equal `sha256:` plus the digest computed from the exact checked-out
  canonical migration inventory; an arbitrary, stale, or merely well-formed digest is rejected;
- `hostedNonproductionVerified: true`, `productionAuthorized: false`, and `customerDataUsed: false`;
- every required gate with `result: passed`, the same Git commit/workflow run, and a safe result ID.

Verify it from the exact checkout:

```bash
node scripts/verify-hosted-pilot-evidence.mjs --manifest <sanitized-manifest.json> --expected-head <exact-head>
```

The manual GitHub workflow downloads this manifest from a controller-identified activation run, composes hosted deployment/browser checks, and publishes only a sanitized verification record. Ordinary pull requests and pushes cannot trigger it.

## Failure, rollback, and deprovision

- **Identity/preflight failure:** perform no writes; disconnect and classify `blocked`.
- **Migration failure:** retain maintenance/read-only behavior, stop additive application, capture sanitized migration/result identity, and forward-repair with a new additive migration after review. Never down-migrate destructively.
- **Bootstrap/replay failure:** keep the tenant disabled, use server-authoritative idempotent deprovision/replay, and verify audit/revocation before retry.
- **Rollback separation of duties:** use the dedicated active synthetic Recovery Promotion Operator,
  never the original promoter or independent approver. A same-promoter, approval-only, revoked,
  disabled, cross-tenant, or stale-authorization-version attempt must fail without a receipt or
  lifecycle mutation. Preserve the exact rollback target candidate/version and replay receipt.
- **Web mismatch or false success:** remove the non-production deploy from pilot traffic or retain its maintenance page; do not promote or substitute another release.
- **Backup rejection or recovery failure:** keep read-only, preserve the original target, reject corrupt/wrong-version material, and restore only into a separately verified dedicated non-production target.
- **Secret or provider-egress suspicion:** stop immediately. Do not print or copy the suspected value; revoke through the separately authorized operator process and invalidate the evidence run.

Deprovision synthetic identities server-side, revoke sessions, disable the pilot tenant, and retain only policy-approved sanitized audit/evidence. Database or site destruction requires separate controller authorization and is not a rollback step in this runbook.

## Acceptance boundary

Completion requires exact-head hosted database, simulation, deployment, desktop/mobile, accessibility/performance, recovery, and adversarial evidence. Source checks or disposable CI alone remain separate and cannot establish `hosted_nonproduction_verified`. Production cutover, external rollout, real-provider use, and readiness/certification claims remain prohibited after successful hosted verification.
