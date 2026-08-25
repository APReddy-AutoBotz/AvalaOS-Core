# AvalaOS Full-Platform Verification Campaign

Status: `planned_verification`. No campaign run or provider call is represented as executed by this directory.

This directory defines the reusable, fail-closed verification campaign that precedes controlled human testing. It binds the 24 `View` values and all 108 canonical acceptance Test IDs without copying or reclassifying PR #255 evidence. The canonical catalog, provenance, proof-owner, and execution-binding files under `tests/acceptance/` remain authoritative.

## Scope

- public and Sandbox separation;
- seven synthetic personas and capability-positive/capability-negative paths;
- two synthetic organization/workspace pairs for non-disclosure checks;
- Assess, Govern, Studio, private artifacts, Delivery, Monitor, Intelligence/BYOK, Trust, Admin, and Pilot Operations relationships;
- deterministic scoring regression without any scoring-law change;
- simulated provider failures before explicitly budgeted OpenAI or Groq calls;
- Desktop Chrome and Pixel 7 browser journeys where the environment is runnable;
- PostgreSQL authority, RLS, idempotency, audit, recovery, and response-loss checks;
- adversarial evidence-integrity checks.

The broad Sandbox browser campaign and the disposable PostgreSQL/server suites are layered checks. Even in `connected` browser mode, the server preflight only binds the environment and synthetic scope; it does not turn the Sandbox persona journey into a browser-to-server end-to-end proof. That seamless boundary remains a controlled-human/hosted verification obligation and must be reported as such.

## Non-claims and prohibitions

Planning or executing this local/disposable campaign is not deployment, hosted-live validation, pilot or production readiness, buyer acceptance, security certification, compliance certification, or permission to merge or mark PR #255 Ready. AI never decides deterministic scores, risk gates, approvals, or regulated decisions. No runtime agent, MCP, A2A, autonomous execution, or external production action is introduced.

Never retain secrets, raw prompts or responses, raw logs, screenshots containing sensitive state, HAR files, signed URLs, real provider/account identifiers, customer data, PHI, storage object identifiers, or production infrastructure identifiers. Provider keys remain only in ignored local server environment files and are never copied into this directory.

## Files

- `campaign.json`: entry gates, evidence routing, and campaign invariants.
- `views.json`: all 24 visible `View` values and their source status.
- `personas.json`: the seven bounded personas and positive/negative capability obligations.
- `synthetic-world.json`: deterministic two-organization/two-workspace world.
- `relationships.json`: cross-module producer/consumer contracts.
- `provider-budget-policy.json`: disabled-by-default live-provider budget gate.
- `cases/*.json`: grouped references to every canonical acceptance Test ID exactly once.
- `schemas/*.json`: tracked campaign and sanitized run-evidence contracts.
- `cleanup-and-rollback.md`: teardown and fail-closed rollback.

Generated evidence is written only below the ignored root `output/full-platform/<run-id>/` path. It must not be written under `testing/full-platform/`.

A generated campaign summary is an index over canonical evidence, not a replacement for it. A partial Test-ID set must keep the campaign `blocked` (or `not run`); only an exact 108-Test-ID set may claim complete catalog coverage. Each Test ID records every canonical retained, oracle, hosted, or server binding as a separate `bindingResults` component. Composite server+hosted requirements fail closed when either component, canonical command, owner, or exact assertion set is missing.

## Validation

```powershell
node scripts/validateFullPlatformTesting.mjs
node --test scripts/validateFullPlatformTesting.test.mjs
```

The validator rejects incomplete catalog coverage, a missing view/persona, wrong tenant scope, stale run attempt, substituted command, fake source proof, suite-level green with a skipped assertion, partial persona coverage, provider traffic after the observer closes, and accepted-versus-denied Sandbox route confusion.
