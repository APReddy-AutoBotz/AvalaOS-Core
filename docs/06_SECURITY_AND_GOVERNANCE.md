# AvalaOS Core Security And Governance

## Security Position

AvalaOS Core is appropriate for controlled demonstration and source-level development validation. It is not accepted as tenant-safe pilot or production software.

The active security and proof record is `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`.

## P0 Stop Gate

The document-extraction Storage path contains a confirmed source-level service-role URL escape. Deployment status is unknown. This blocks readiness claims and is the first PR 1A gate.

Do not inspect or mutate live infrastructure, disable endpoints, review production logs, rotate credentials, or perform incident actions without separate explicit approval. Evidence must exclude secrets, raw logs, signed URLs, customer content, object identifiers, and production infrastructure identifiers.

## Authority Controls

- The browser is a presentation projection, not an authorization boundary.
- Every privileged request must revalidate active identity, tenant membership, workspace access, permission, resource ownership/status, and revocation on the server.
- Membership, role, permission, module, and workspace changes invalidate authorization caches through a versioned authority contract.
- Revocation denies the next request; stale TenantContext or client claims cannot authorize behavior.
- Service-role data/storage access requires application authorization and tenant-scoped allowlists.
- Cross-tenant list, count, lookup, mutation, and error behavior must not reveal resource existence.

## Deterministic And AI Controls

- AI cannot decide deterministic scores, gates, risk tiers, recommendations, approvals, or regulated decisions.
- Scoring changes require an explicit score version and regression suite.
- AI-generated content remains editable and human-reviewed.
- Pilot and production AI runs server-side with governed provider configuration and no browser-held provider keys.
- Missing configuration in pilot/production fails closed; demo/browser fallbacks are local-demo/test only.

## Audit And Evidence

- Privileged state and required audit records commit atomically.
- Audit failure blocks the privileged change unless the event is explicitly low-risk telemetry and the primary operation already fails closed.
- Evidence distinguishes confirmed source defect, suspected defect, deployment status unknown, executed evidence, planned verification, blocked, and not run.
- Historical evidence is immutable but does not override the active risk/status documents.

## Data, RLS, Storage, And Export

- `supabase/migrations/` is the canonical migration chain; `docs/schema/` is legacy reference until reconciled.
- Schema PRs require fresh/upgrade migration, RLS/policy, failure, and rollback/read-only tests.
- Storage bucket authority is server-derived and allowlisted; user-controlled bucket names never enter service-role URLs.
- Exports require fresh permission, workspace, resource ownership/status, evidence/lineage, storage, and audit checks.

## Governance Boundary

Avala Govern records risk, autonomy, approvals, evidence, allowed/blocked actions, review frequency, and audit posture. It does not execute agents, bots, RPA jobs, external-system actions, MCP controls, A2A controls, or live runtime enforcement in the current baseline.

KlarityFlow Health remains separate. No SOC 2, HIPAA, GDPR, GxP, ISO, or similar certification or compliance claim is made.
