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
   in that one tenant/workspace. Provisioning is serialized with rollback, replaces broad
   organization authority with a capability-free identity role, and assigns the two permitted
   capabilities through an exact-workspace role. The repository role grants exactly
   `operations.read` and `release.promote`: it grants no approval, Owner/Admin, business,
   provider, production, or customer-data authority. Record its current authorization version
   after provisioning and verify the active operator record for the exact organization and workspace;
6. exercise canonical AP Invoice Exception Assess → Govern → Studio → Delivery → Monitor behavior and negative stale/revoked/cross-tenant cases;
7. exercise response loss/replay, stale promotion candidate, concurrent rollback, queues/reconciliation/recovery, maintenance/read-only/kill switches, backup/restore, corrupt/wrong-version backup rejection, and fake provider success/failure/timeout/revocation/rotation with zero provider egress;
8. deploy only the exact head to the explicitly linked preview/branch target;
9. verify release/environment response headers, then run Desktop Chrome and Pixel 7 functional acceptance and the separate repository-owned accessibility/performance assertion job;
10. assemble the sanitized hosted manifest and run the exact-head verifier.

Do not disable maintenance/read-only behavior merely because migrations completed. Release it only after all required hosted gates pass and the controller explicitly approves non-production pilot traffic.

## Web verification

The hosted application must return `x-avalaos-release: <exact-head>` and `x-avalaos-environment: hosted_nonproduction_pilot`. Verify without exposing target credentials:

```bash
EXPECTED_RELEASE_SHA=<exact-head> HOSTED_PILOT_URL=<https-origin> node scripts/verify-hosted-deployment.mjs
EXPECTED_RELEASE_SHA=<exact-head> HOSTED_PILOT_URL=<https-origin> npx playwright test --config=playwright.hosted-pilot.config.ts
EXPECTED_RELEASE_SHA=<exact-head> HOSTED_PILOT_URL=<https-origin> npx playwright test --config=playwright.hosted-accessibility-performance.config.ts
```

The browser may display server projections but cannot mint tenant, environment, release, approval, evidence, or provider authority. Backend/storage/simulated-provider failure must not render success. Hosted acceptance includes loading, error, offline, stale, revoked, blocked, accessibility, responsive overflow, and practical performance observations; missing coverage remains `blocked`.

The accessibility/performance gate is independent of generic hosted-browser success. It runs axe against the hosted application root on Desktop Chrome and Pixel 7 and rejects serious or critical findings. It also requires complete browser navigation metrics and enforces repository-owned ceilings of 15 seconds for navigation completion, 10 seconds for DOM content loaded, and 300 resource entries. Tooling, browser launch, navigation, metric, target, job, or artifact failure blocks the gate; caller input and the generic browser job cannot substitute a pass.

## Hosted evidence manifest

The sanitized `manifest.json` uses schema version 1 and binds:

- exact `gitCommit`, safe one-way target/deployment fingerprints, and safe deployment/workflow identities (never the hosted origin or site/project identifiers);
- the controller-selected activation run's numeric ID and attempt, repository-owned workflow path,
  repository, `workflow_dispatch` event, and successful conclusion. These values must match the
  single bounded GitHub Actions run lookup used to download the artifact; manifest self-claims are
  not activation-run authority and evidence cannot be substituted across runs or attempts;
- `environment: hosted_nonproduction_pilot`;
- SHA-256 target fingerprint and migration-chain hash (never their raw inputs);
- `migrationChainHash` must equal `sha256:` plus the digest computed from the exact checked-out
  canonical migration inventory; an arbitrary, stale, or merely well-formed digest is rejected;
- `hostedNonproductionVerified: true`, `productionAuthorized: false`, and `customerDataUsed: false`;
- every required gate with `result: passed`, the same Git commit/workflow run and run attempt, and a
  safe result ID.

Verify it from the exact checkout:

```bash
node scripts/verify-hosted-pilot-evidence.mjs \
  --manifest <sanitized-manifest.json> --expected-head <exact-head> \
  --activation-run-id <trusted-run-id> --activation-run-attempt <trusted-attempt> \
  --activation-workflow <trusted-workflow-path> --activation-repository <trusted-owner/repository> \
  --activation-event workflow_dispatch --activation-head <exact-head> \
  --activation-conclusion success
```

The manual GitHub workflow performs one exact-ID Actions API lookup before download, fails unless
the run belongs to the current repository and exact release and completed successfully as a manual
workflow, then binds the manifest and every gate to that immutable run identity. It composes hosted
deployment/browser checks and publishes only a sanitized verification record. Ordinary pull
requests and pushes cannot trigger it.

## Failure, rollback, and deprovision

- **Identity/preflight failure:** perform no writes; disconnect and classify `blocked`.
- **Migration failure:** retain maintenance/read-only behavior, stop additive application, capture sanitized migration/result identity, and forward-repair with a new additive migration after review. Never down-migrate destructively.
- **Bootstrap/replay failure:** keep the tenant disabled, use server-authoritative idempotent deprovision/replay, and verify audit/revocation before retry.
- **Rollback separation of duties:** use the dedicated active synthetic Recovery Promotion Operator,
  never the original promoter or independent approver. A same-promoter, approval-only, revoked,
  disabled, cross-tenant, or stale-authorization-version attempt must fail without a receipt or
  lifecycle mutation. Rollback validates and locks the active provisioned operator record for the
  exact organization and workspace before receipt lookup; generic `release.promote` authority is
  insufficient. Preserve the exact rollback target candidate/version and replay receipt.
- **Web mismatch or false success:** remove the non-production deploy from pilot traffic or retain its maintenance page; do not promote or substitute another release.
- **Backup rejection or recovery failure:** keep read-only, preserve the original target, reject corrupt/wrong-version material, and restore only into a separately verified dedicated non-production target.
- **Secret or provider-egress suspicion:** stop immediately. Do not print or copy the suspected value; revoke through the separately authorized operator process and invalidate the evidence run.

Deprovision synthetic identities server-side, revoke sessions, disable the pilot tenant, and retain only policy-approved sanitized audit/evidence. Database or site destruction requires separate controller authorization and is not a rollback step in this runbook.

## Acceptance boundary

Completion requires exact-head hosted database, simulation, deployment, desktop/mobile, accessibility/performance, recovery, and adversarial evidence. Source checks or disposable CI alone remain separate and cannot establish `hosted_nonproduction_verified`. Production cutover, external rollout, real-provider use, and readiness/certification claims remain prohibited after successful hosted verification.

## Final hosted-closure convergence

The applied checkout identity is derived from `git rev-parse HEAD`; operator-supplied values cannot attest a different checkout. Preflight and the locked re-inventory include public tables, partitioned/foreign tables, views, materialized views, sequences, functions, procedures, ownership, and ACL signals. Foreign or ahead-of-ledger objects keep the target in maintenance/read-only for additive forward repair.

Pgcrypto installation, both native `extensions.digest` overloads, both `public.digest` compatibility wrappers, browser-role revocation, service-role grant, and catalog verification form one transaction. Any interruption rolls back the entire repair. Recovery-operator rotation is serialized per organization and workspace, fences the prior active record and effective workspace role, and preserves immutable promoter/approval-history separation of duties before rollback receipt lookup.

Only `.github/workflows/hosted-pilot-activation-evidence-producer.yml` may produce the pinned `hosted-pilot-activation-manifest` artifact. The consumer binds its selected run, attempt, repository, exact head, canonical migration digest, and deployment-origin fingerprint. Production/live activation, customer-data authorization/use, external-user authorization/use, and real-provider authorization/use must all remain structurally false. Failure of any producer, consumer, deployment, browser, migration, recovery, or rollback gate leaves the target non-production and in maintenance/read-only; no localhost, stable-alias, production, or destructive fallback is permitted.

### Systemic hosted-closure verification order

Rollback first proves that the caller is the current active, synthetic, exact-workspace
provisioned recovery operator with the exact least-privilege role composition. Only after that
non-disclosing authority gate passes may the wrapper inspect immutable approval/promotion history
for the exact organization, workspace, and rollback candidate. Unprovisioned, rotated, disabled,
revoked, wrong-tenant, or wrong-workspace actors receive `PR1B_NOT_FOUND`; an otherwise authorized
operator who historically approved or promoted that candidate receives
`SEPARATION_OF_DUTY_REQUIRED`. Both checks precede receipt inspection and lifecycle mutation.

Database verification compares every ordered `avalaos_migrations.applied` filename and content
SHA-256 with the exact checkout-derived canonical chain. Missing, truncated, reordered,
checksum-mismatched, or ahead history fails closed even if the environment marker names the latest
tip. The verifier also checks the expected owner, `SECURITY DEFINER` flag, fixed `pg_catalog`
search path, service-role grant, and absence of `PUBLIC`, `anon`, and `authenticated` execution for
every repository-owned service-only hosted/pilot RPC. ACL drift retains maintenance/read-only.

The activation producer accepts no caller-declared gate-result IDs. Its database/provider,
recovery/operations, and real-hosted browser jobs must all succeed in the same exact-head workflow
run. Every emitted gate record is bound to that run, attempt, pinned workflow, hosted environment,
database fingerprint, and tested deployment fingerprint before the consumer can verify it.
