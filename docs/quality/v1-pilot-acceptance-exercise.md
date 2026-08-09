# V1 Pilot Acceptance Exercise

Status: Draft PR #226 executable candidate on accepted PR #225 merge `c0a6196b18a9725eb162e56e86435aa4d0e402d1`.

This work package is a disposable/local pilot-acceptance exercise only. It does not authorize production deployment, hosted/live infrastructure mutation, real provider calls, real credentials, customer data, compliance/security certification, or production cutover.

The implementation task must preserve all accepted server-authoritative, deterministic, tenant/RLS, BYOK, Trust, Studio, Delivery, Monitor, receipt/effect, rollback/read-only, and evidence-provenance laws. GitHub Actions remains authoritative for disposable PostgreSQL/Supabase/Playwright/runtime evidence.

## Executable package

The repository-owned `Pilot Acceptance` workflow uses only an ephemeral PostgreSQL 16 service, deterministic synthetic identities, retained provider stubs, and the existing Vite/Playwright runtime. It checks out the exact event head, installs from the lockfile, runs the canonical journey and retained authority suites, runs fresh/upgrade migration harnesses, exercises the accepted Desktop Chrome and Pixel 7 projections, generates a machine-readable manifest, and drops the disposable database even after failure. No developer-machine state is an input.

The versioned specification is `config/pilot-acceptance-spec.json`. `scripts/pilotAcceptanceJourney.mjs` binds deterministic Assess → Govern → Studio → Delivery → Monitor ancestry and explicitly exercises tenant non-disclosure, stale/revoked/restored authority, exact replay, changed-payload conflict, response loss, reconciliation, feature disablement, read-only/maintenance, Trust withdrawal, and additive-forward rollback. It composes rather than replaces the retained database, Edge, browser, storage, and rendering tests.

`scripts/verify-pilot-acceptance.mjs` emits `artifacts/pilot-acceptance/manifest.json`. Required gates are classified as `proven_disposable_pilot_evidence`, `configured_not_live_verified`, or `failed`; hosted/live is separately recorded as `not_proven_hosted_live`. Local generation remains truthfully pending unless gate results are supplied. Authoritative mode fails if any required gate is missing or failed.

## Acceptance and operational matrix

| Boundary | Executable evidence | Expected safety result |
| --- | --- | --- |
| Canonical path | Cross-domain journey plus retained PR 1B/1C/1E, Enterprise, Studio and Trust suites | Unique ancestry/resource/version/receipt/effect/evidence IDs; scoring and hard-stop law unchanged |
| Tenant authority | Wrong-tenant/workspace/ID, stale capability, revoke-between-read-and-mutate, service-role and browser-claim cases | Authorization-first non-disclosure and zero mutation |
| Recovery | Response-loss replay, payload conflict, Studio/Delivery retry, worker recovery, interrupted finalization | One receipt/effect; no duplicate version or intent; no stranded claimed/pending state |
| Controls | Feature disable, read-only, maintenance, revoked replay and Trust withdrawal | New mutation blocked; safe reads and required exact replay preserved; revocation not bypassed |
| Private artifacts | Retained Markdown/PDF/DOCX, private storage, brokered download, retention/hold/deletion/reconciliation suites | Synthetic bytes only, no raw URL, independent deletion approval, immutable retention snapshot |
| Browser | Existing canonical suites on Desktop Chrome and Pixel 7 | Overflow, false-success, keyboard/focus/ARIA and deterministic performance assertions enforced |
| Database | Existing fresh/upgrade/dirty/RLS/grant/concurrency/reconciliation harnesses on PostgreSQL 16 | Additive history, least privilege and exact replay enforced |

## Operator diagnostics, recovery, and completion

The generated manifest is the bounded machine-readable operator surface. It exposes candidate commit, workflow/run identity when available, required baseline, gate commands/results, disposable-versus-hosted classification, and limitations. It excludes credentials, raw logs, provider payloads, signed URLs, customer/object identifiers, and infrastructure identifiers.

On failure, keep the Draft unmerged and inspect only the named disposable job. Disable an affected feature for queue/reconciliation failure. Enter read-only/maintenance mode for cross-domain or schema failure, preserve immutable records, and use an additive forward correction. Never rewrite accepted migrations or evidence. Database teardown is unconditional; unsuccessful teardown is a failed exercise, not cleanup proof.

GitHub Actions is authoritative for PostgreSQL services, Chromium projects, exact workflow/run identity, and the global pass. Until the exact head passes, status is `configured_not_live_verified`. A pass establishes only `proven_disposable_pilot_evidence`; hosted Supabase/Vault/Storage, live providers, deployment, production, security certification, and compliance certification remain `not_proven_hosted_live`.
