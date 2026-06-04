# M3 Slice Roadmap

M3 is approved as a roadmap, not as one implementation PR. Each implementation slice requires its own scoped approval, acceptance criteria, verification evidence, and review before merge.

## Slice Overview

| Slice | Name | Primary Outcome | Implementation Approval |
| --- | --- | --- | --- |
| M3.0 | AI Boundary Inventory & Mode Contract | Planning record, slice roadmap, mode matrix, and evidence only. | Approved for planning docs only. |
| M3.1 | Browser AI Boundary Lockdown | Pilot/production cannot use browser-stored raw API keys or browser-side provider execution. | Future AP approval required. |
| M3.2 | Edge Provider Config + Key Reference Resolution | Edge resolves tenant provider config and key references server-side. | Future AP approval required. |
| M3.3 | AI Job Lifecycle + Usage Audit | Generation/refinement jobs and usage records are enforced for pilot behavior. | Future AP approval required. |
| M3.4 | Prompt Registry + Source Safety | Prompt key/version constants and source safety gates are server-side. | Future AP approval required. |
| M3.5 | Read-only Avala AI Controls | Admin can view provider/key/model/job readiness without entering raw keys. | Future AP approval required. |
| M3.6 | Pilot-readiness Evidence Review | Gate 4 evidence pack proves server-side execution, key references, and usage audit. | Future AP approval required. |

## M3.0 AI Boundary Inventory & Mode Contract

Scope:

- Create the M3 implementation plan, slice roadmap, and evidence record.
- Supersede the older M3 planning stub.
- Define mode matrix and stop conditions.
- Record current AI architecture risks.

Acceptance:

- No product code changes.
- No AI behavior changes.
- No scoring, Health, schema, package, Supabase Function, dependency, Admin UI, runtime-agent, MCP/A2A, external execution, or compliance-claim changes.
- Verification commands and wording scan are recorded.

## M3.1 Browser AI Boundary Lockdown

Scope:

- Inventory all browser AI paths before changing behavior.
- Gate pilot/production so browser-side provider execution and browser-stored raw keys are forbidden.
- Keep or remove demo fallback only through explicit `local-demo` mode.
- Add tests or static scans for forbidden browser-key/provider paths.

Acceptance:

- Pilot/production mode cannot call browser provider classes.
- Pilot/production mode cannot read raw provider keys from browser state, local storage, or Vite-exposed provider env variables.
- `local-demo` remains prepared/synthetic only.
- Internal-dev fallback is labeled and not permitted for real customer data.

## M3.2 Edge Provider Config + Key Reference Resolution

Scope:

- Resolve provider config server-side by org and active status.
- Resolve `key_reference` through an allowlisted server-side resolver.
- Bind provider config to AI jobs and provider tests.
- Reject unsupported/inactive/missing provider configs in pilot/production.

Acceptance:

- No raw provider keys are passed from browser payloads.
- Provider secrets never appear in client env, browser state, logs, or database rows.
- Edge tenant provider config can be verified.
- Any schema/RLS migration need stops for AP approval.

## M3.3 AI Job Lifecycle + Usage Audit

Scope:

- Enforce AI job creation, status completion, and sanitized error capture.
- Record server-side usage/token/model data from provider responses.
- Review `ai-usage-log` so pilot usage is not client-spoofable.
- Define fail-closed pilot behavior when usage audit cannot be enforced.

Acceptance:

- Pilot generation/refinement cannot complete without job and usage evidence.
- Usage records avoid raw prompts, source bodies, provider payload secrets, and raw keys.
- Failures are sanitized and auditable.

## M3.4 Prompt Registry + Source Safety

Scope:

- Introduce server-side prompt key/version constants first.
- Record prompt key/version on jobs and usage events.
- Add source safety checks for type, size, missing source, tenant scope, and prompt-injection patterns.
- Restrict unsupported binary extraction in pilot.

Acceptance:

- DB-backed prompt admin is deferred unless separately approved.
- Prompt changes do not alter deterministic scoring or recommendation logic.
- PDF/DOCX production extraction remains out of scope unless separately approved.
- Unsupported binary extraction fails gracefully in pilot mode.

## M3.5 Read-only Avala AI Controls

Scope:

- Add a read-only Admin surface for AI readiness.
- Show provider status, key-reference status, model policy status, usage/job readiness, and pilot readiness.
- Do not add raw-key entry.

Acceptance:

- Admin AI Controls are observational only.
- No browser raw-key entry exists.
- Controls do not imply AI decides scores, approvals, risk gates, or compliance status.

## M3.6 Pilot-readiness Evidence Review

Scope:

- Produce Gate 4 evidence for server-side execution, key references, and usage audit.
- Run required verification commands, boundary scans, Supabase smoke checks when configured, and wording scans.
- Record open risks and stop conditions.

Acceptance:

- Gate 4 can be reviewed with evidence.
- No unsupported compliance claims.
- No scoring, Health, runtime-agent, MCP/A2A, or external execution expansion.

## Mode Matrix

| Mode | Purpose | AI Execution | Key Handling | Required Failure Behavior |
| --- | --- | --- | --- | --- |
| `local-demo` | Controlled demo and prepared walkthroughs. | Prepared demo data and synthetic-only fallback are allowed. | No real customer data and no pilot security promise. | Use prepared artifacts or synthetic fallback only when clearly local-demo. |
| `internal-dev` | Developer validation and transitional testing. | Transitional fallback may exist only when clearly labeled. | Must not be used for real customer data. | Warn or fail clearly when behavior is not pilot-safe. |
| `pilot` | Controlled enterprise pilot. | Server-side Edge AI only. | No browser raw keys or browser-side provider execution. | Fail closed if provider config, key reference, auth, org membership, prompt version, or usage audit is missing. |
| `production` | Production customer operation. | Server-side Edge AI only. | Same as pilot, with production deployment controls. | Fail closed on any missing required control or audit evidence. |

## Cross-Slice Stop Conditions

Stop implementation if:

- scoring changes are required
- Health changes are required
- schema/RLS migrations are required without AP approval
- browser raw keys are needed
- provider secrets would appear in client env, browser state, logs, or DB rows
- usage audit cannot be enforced for pilot behavior
- Edge tenant provider config cannot be verified
- copy implies AI decides scores, approvals, risk gates, or compliance status
