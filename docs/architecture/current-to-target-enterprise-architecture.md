# AvalaOS Core Current-To-Target Enterprise Architecture

Baseline: accepted `main` at `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`
Status: target contract with PR 1A accepted through PR #206 and a PR 1B implementation candidate pending migration CI, review, and merge

## Current Architecture

AvalaOS Core is a React/Vite TypeScript application with deterministic scoring, browser-side domain services, demo adapters, partial Supabase adapters, Supabase migration sources, and Edge Function sources for AI, extraction, export, storage, and provider governance.

The current browser is both presentation layer and, in several flows, effective policy and workflow authority:

```text
Browser UI
  ├─ demo/Supabase identity mapping
  ├─ client action and route policies
  ├─ client deterministic scoring
  ├─ direct Supabase table mutations
  ├─ local/mock fallback and transient state
  └─ selected Edge AI/export calls

Supabase
  ├─ partial canonical migration chain
  ├─ additional legacy SQL contracts under docs/schema
  ├─ incomplete enterprise RLS proof
  └─ Edge helpers using service-role authority
```

Material current boundaries are source-validated in the active risk register. They include demo-persona permission inheritance for matching Supabase emails, missing-config mock fallback, client policy authority, incomplete export authorization, service-role URL construction, best-effort audit, non-atomic persistence/UI transitions, and an unreconciled migration authority split.

Provider-governance code is stronger than the general application path: it checks active membership and fails closed when allowed-operation audit persistence fails. That control is not yet a uniform platform authorization layer.

## PR 1A Candidate Transition

PR 1A implements the first target slice without claiming the later server-authoritative platform is complete:

- exact explicit runtime modes with no implicit pilot/production fallback;
- server-required pilot/production data and AI paths, without demo-persona authorization or browser provider authority;
- server-derived allowlisted Storage authority and authenticated export checks before service-role operations;
- required AI audit persistence that fails closed;
- structural sanitization at the three validated rich-content sinks and durable-persistence-before-success UI behavior; and
- a minimum canonical AI-audit migration with isolated fresh and supported-upgrade execution.

This is branch evidence pending acceptance. It does not complete PR 1B identity/RBAC/RLS/Assess, prove tenant isolation, or establish a deployed environment.

## Target Architecture

The PR 1B candidate implements the server identity/RBAC/RLS and typed Assess portion of this target in source and canonical migration form. Hosted/deployed behavior and the PR 1C browser cutover remain unproven and out of scope.

```text
Browser projection
  │ authenticated request + command envelope
  ▼
Edge/API transport router
  │ typed dispatch only
  ▼
Command/query handler
  ├─ validate schema and stable error contract
  ├─ resolve fresh server identity
  ├─ revalidate tenant/workspace/resource authority
  ├─ check authorization version and revocation
  ├─ enforce deterministic domain policy
  ├─ enforce idempotency and expected version
  └─ execute one transaction
       ├─ domain state
       ├─ immutable audit/evidence reference
       └─ outbox/invalidation record when required
  │ sanitized non-disclosing result
  ▼
Browser state projection
```

### Trust boundaries

- The browser is untrusted input and a presentation projection.
- Server handlers are the authority for identity, permissions, tenant/workspace scope, lifecycle transitions, exports, and handoffs.
- PostgreSQL constraints, RLS, and transaction boundaries provide defense in depth; service-role access never substitutes for application authorization.
- Storage bucket and object authority is derived server-side from an allowlist and verified tenant context. User-controlled bucket names never enter privileged URLs.
- AI may draft or transform content but cannot determine scores, risk gates, approvals, or regulated decisions.

### Runtime modes

| Mode | Permitted authority |
| --- | --- |
| `local_demo` | Explicit demo identities, local/mock persistence, and labeled demo behavior. |
| `automated_test` | Deterministic fixtures and fakes scoped to tests. |
| `pilot` | Server configuration, identity, authorization, persistence, AI, audit, and storage required; missing authority fails closed. |
| `production` | Pilot controls plus production promotion, observability, secrets, rollback, and operator controls. |

There is no implicit mode. Pilot and production cannot fall back to demo identity, mock data, browser AI, local downloads, or success UI after failed persistence.

## Identity, Tenant, And Revocation Model

- Server identity begins with a validated session user ID.
- Active organization membership, tenant role grants, normalized permissions, workspace access, and resource ownership are loaded or revalidated for every privileged request.
- `TenantContext` is returned for UI projection with an `authorizationVersion`; it is not accepted as authorization evidence.
- Membership, role, permission, module, and workspace changes increment the authorization version and invalidate affected caches.
- Server mutations always perform an authoritative lookup inside the request/transaction. Cache is an optimization only.
- Revocation denies the next request. Stale TenantContext, stale sessions, email matching, client role claims, hidden controls, and routes cannot retain access.
- Queries and errors use stable non-disclosing results so cross-tenant resource existence, list sizes, and counts are not leaked.

## Assess Command Boundary

`assess-command` may be one Edge entry point but contains no domain workflow. It dispatches to typed handlers such as:

- `assessment.create`
- `assessment.response.upsert`
- `assessment.finalize`
- `govern.resolve`
- `studio_handoff.create`

Every handler owns validation, fresh authorization, expected-version and idempotency checks, deterministic policy, transaction boundaries, audit, and stable errors. State and required audit commit atomically. Denied-attempt telemetry may be best effort only when the denial itself remains fail closed.

Scoring remains deterministic and versioned. PR 1B proves server parity against the existing regression corpus before browser cutover.

## Data And Migration Authority

- `supabase/migrations/` is the only canonical ordered migration chain.
- `docs/schema/` is a legacy design and historical operational reference until required contracts are reconciled into canonical migrations.
- Fresh database, supported upgrade path, policy/RLS assertions, and failure/rollback behavior are CI gates for schema-changing PRs.
- PR 1A supplies those executed gates for its minimum AI-audit migration only; broader runtime schema and two-tenant RLS proof remain PR 1B work.
- Production rollback is normally flag disablement, read-only maintenance, or forward migration. Destructive down-migrations are not the default.

## Audit And Evidence

- Privileged state changes and their audit records commit atomically.
- Audit failure blocks the privileged change unless an explicitly documented low-risk telemetry event is best effort.
- Audit events use request/correlation IDs, actor and tenant references, action, resource reference, outcome, version, and sanitized metadata.
- Evidence records distinguish source inspection, executed tests, deployment status, planned checks, blocked checks, and unknowns.
- Secrets, raw logs, signed URLs, customer content, object identifiers, and production infrastructure identifiers are prohibited evidence.

## UI And Failure States

Enterprise UI must represent loading, empty, error, offline, stale, revoked, blocked, read-only maintenance, and expired-session states. It must not silently substitute demo data or transition to a success surface before durable server confirmation.

## Transition Boundaries

| PR | Architecture transition | Rollback boundary |
| --- | --- | --- |
| 1A | Fail-closed runtime and P0/P1 platform safety | Endpoint disablement and reversal of non-security refactors; never restore vulnerable behavior. |
| 1B | Server identity/RBAC/RLS and Assess command authority | Disable enterprise commands or enter read-only mode; preserve data/audit; forward-fix migrations. |
| 1C | Enterprise Assess UI, Govern resolution, atomic Studio handoff | Disable cutover/handoff flags and use read-only maintenance; never fall back to demo authority. |

Later Studio, Delivery, Monitor/Admin, and deployment work builds only on accepted Workstream 1 contracts.
