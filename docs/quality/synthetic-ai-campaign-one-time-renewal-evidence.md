# Synthetic AI Campaign One-Time Renewal Evidence

## Boundary

This PR-owned forward migration permits one bounded continuation of the already
expired, separately approved synthetic AI campaign. It does not create a second
campaign, reset or refund any charge, change the original USD 10 cap, call a
provider, read a secret, enable either provider runtime, approve a document, or
perform a handoff.

The retained baseline is USD 1.3407792: the immutable USD 0.86932 carry plus one
consumed USD 0.4714592 validation debit. Renewal is available only when that exact
history remains present, the original campaign is expired but not disabled, both
provider runtimes are off, canonical `org.admin` authority is fresh, and every
synthetic target/server/provider/route binding matches. One append-only renewal
may reserve at most six further USD 0.4714592 effects: one validation, one Assess
mapping, one independent extraction, and three Studio generations. The resulting
maximum conservative aggregate is USD 4.1695344, still governed by the original
USD 10 aggregate cap.

## Fail-closed behavior

- Renewal rejects altered authority, tenant/workspace, target fingerprint,
  project host, campaign, provider, key, route, baseline, price, model or cap.
- Any unconsumed campaign debit or reserved/uncertain/pending-transfer token
  budget rejects renewal. Pre-provider failed mapping history without a token
  reservation or currency debit remains retained and is not misclassified as a
  paid effect.
- New debits bind immutably to the renewal row and reservation timestamp.
  Consume rechecks the active deadline and rejects an old permit.
- Exact replay returns the existing debit and cannot reset or inflate capacity.
- The existing irreversible campaign-disable RPC remains authoritative.

## Verification

- `node scripts/testSyntheticAiCampaignRenewalMigration.mjs`: **passed** — 51
  source assertions and eight adversarial mutations; no database, provider or
  secret access.
- `node --check scripts/testSyntheticAiCampaignRenewalPostgres.mjs`: **passed**.
- `node scripts/testSyntheticAiCampaignRenewalPostgres.mjs`: **passed** on the
  repository-owned loopback PostgreSQL 16 server — 35 assertions across eight
  independently emitted `MAP-PG-RENEWAL-001` through `008` scenarios. The
  focused harness owned and removed two named disposable databases. Fresh chain,
  populated upgrade, exact history preservation, wrong bindings/authority/charge,
  disabled and second renewal, missing/expired window, old replay, immutable
  rows, final-slot concurrency, aggregate cap, exact replay and failed reapply
  rollback all passed.
- Cleanup emitted a positive `dropped_and_absent` result for both owned
  disposable databases after querying `pg_database`; cleanup failure is fatal
  rather than silently ignored.

Two earlier harness attempts are retained as setup failures, not product passes:
the first stopped before migrations because the disposable cluster lacked the
standard `anon`, `authenticated` and `service_role` test roles; the second placed
a synthetic validation receipt after the provider runtime had deliberately been
disabled. The authorized standard roles were created on the owned loopback test
cluster, the fixture was corrected to claim before disable, and both attempts
removed their disposable databases. Neither crossed a provider or secret boundary.

No hosted database mutation, provider call, secret read, runtime enablement or
paid effect is evidence from these checks.

Controller integration also executed the retained production SQL-to-mocked-provider
budget pipeline against the new full migration chain: all 14 owned
`MAP-PG-BUDGET-*` scenarios passed. This checks that the renewal leaves the prior
Assess/Studio budget and recovery behavior intact; it is not real-provider proof.
Final command-binding, migration-tail and renewal static-file checks passed
20 TAP tests. All eight static/build commands passed with source digest
`24f75051a0c1af20b57b452211d09913084dcade31e32ebfa4469f3f822949c9`.
Independent read-only quality review found no commit-blocking defect.
The PostgreSQL final-slot race uses five directly seeded fixture debits; it
proves the aggregate ceiling and serialization, not runtime exhaustion of each
individual operation slot. Those per-kind limits have exact static anchors but
remain a focused runtime proof gap. New committed-head CI and security review
remain release gates; no previous full-suite result is promoted to this source.

## Rollback and recovery

Keep both provider runtimes off or invoke the existing campaign-disable RPC.
Disable is irreversible and never clears original disabled history. Preserve the
renewal, all original/new debits, failed attempts and token reservations for
reconciliation. Never delete, rewrite, refund or reset them; correct defects only
through an additive forward migration.
