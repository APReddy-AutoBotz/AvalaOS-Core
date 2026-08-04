# Enterprise Intelligence: BYOK, Ingestion, Delivery, and Assemble Plan

## Objective

Deliver one governed Enterprise Intelligence vertical that connects tenant-scoped provider routes, bounded document/transcript evidence, approved Studio artifacts, Delivery/Monitor projections, Modernization assessment, and Assemble Phase 1 blueprints without changing Assess scoring law or enabling autonomous execution.

Implementation branch: `codex/enterprise-intelligence-byok-ingestion-delivery-assemble`.

Required source baseline: `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5`.

## In scope

- Multi-provider BYOK registration, secret bind, validation, activation, route toggle, rotation, and revocation for OpenAI, Azure OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints.
- Tenant-bound opaque secret references resolved only by server-side stores; writable Vault-compatible storage or read-only pre-provisioned environment references.
- Server endpoint allowlisting, provider validation freshness, role checks, and request/token budgets.
- Bounded private ingestion of supported text documents and transcript formats into Assess.
- Source-byte and extracted-text hashes, anchored candidate excerpts, human review, immutable edit history, and selected-candidate promotion into a selected editable Assess draft.
- Deterministic Modernization disposition derived from approved PR1G records.
- Exact approved Studio handoff to Delivery, canonical work-item lineage, and Monitor baseline completeness.
- Draft-only Assemble Phase 1 blueprints with high-impact automation and Agent Tools disabled.
- Normalized server capabilities, authorization-version rechecks, independent review, three-person approval, idempotent receipts, atomic service-only persistence, RLS, tests, documentation, and rollback guidance.

## Out of scope

Assess scoring changes; OCR; audio transcription; remote URL or archive ingestion; browser-side AI or provider credentials; autonomous agents; MCP/A2A/Agent Tools execution; live telemetry; task execution; deployment; live infrastructure access; production or pilot readiness; and unsupported compliance or business-outcome claims.

## Acceptance criteria

1. A provider route cannot execute unless the server confirms tenant/workspace scope, capability, model allowlist, active tenant-bound key reference, allowed endpoint, fresh validation, actor role, and budget.
2. Raw key material is accepted only by the dedicated authenticated bind/rotate endpoint and never enters application tables, receipts, audit metadata, browser storage, URLs, logs, or evidence.
3. A source is size-bounded, stored privately under a canonical tenant path, hash-anchored, extracted without executing source instructions, and committed atomically with its first version.
4. A candidate cannot be accepted or promoted unless its excerpt and provenance are anchored to the current source version; edits and conflicts retain immutable history.
5. Promotion requires a server-projected editable Assess draft and explicitly selected accepted/edited candidates; the server derives current versions and never silently overwrites human values.
6. Modernization uses only current approved PR1G ancestry and server-derived factors; unknown high-impact factors hard-stop the disposition; Assess scoring remains unchanged.
7. Studio handoff rejects stale or non-approved artifacts and atomically creates the Delivery package, version, and canonical item rows.
8. Monitor reads the exact current approved package version and reports only a deterministic baseline; it does not infer telemetry or execution.
9. Assemble creates only structured documentation with execution, tool, agent, credential, infrastructure, deployment, and telemetry controls disabled.
10. High-impact approval requires distinct creator, reviewer, and approver identities plus current resource and authorization versions.
11. Retried commands replay committed results or stable failures; concurrent/raced requests do not duplicate canonical records.
12. Browser clients receive minimized selectors and cannot invoke service-only mutation RPCs directly.

## Feature quality gates

Executed in the isolated worktree:

- `node scripts/checkEnterpriseIntelligenceBoundaries.mjs` and the feature CI contract passed.
- `node scripts/testEnterpriseIntelligenceMigration.mjs` passed 79 strict assertions.
- Disposable PostgreSQL 16 passed fresh chain, accepted-main upgrade, populated upgrade, atomic dirty rejection, 12 Enterprise authority scenarios, read-only fallback, and cleanup.
- The retained Studio PostgreSQL 16 harness passed fresh/upgrade/populated/dirty paths, 20 membership scenarios, 16 Studio scenarios, and cleanup.
- `npm.cmd run test:enterprise-intelligence` passed 10 domain, 4 AI, 6 ingestion, 3 command, tenant-query, 4 mocked lifecycle, CI-contract, and migration-contract groups.
- `npm.cmd run typecheck` and `npm.cmd run typecheck:edge` passed.
- `npm.cmd run test:ai-boundary-static` passed with 0 forbidden and 0 stale allowlist entries.
- `npm.cmd run test:secret-hygiene` passed with 0 forbidden hits and 0 tracked `.env` files.
- `npm.cmd run test:scoring` passed; Assess scoring law remains unchanged.
- `npm.cmd run test:browser:enterprise-intelligence` passed 16/16 Desktop Chrome and Pixel 7 journeys, including axe, keyboard, responsive overflow, reload persistence, stale/denied/unavailable states, no-BYOK/provider-unavailable states, and sensitive-data absence.
- `npm.cmd run test` completed with exit 0 in 31m08s, including retained PR1A–PR1E coverage and the Enterprise Intelligence tail.
- `npm.cmd run build`, `npm.cmd audit --audit-level=moderate`, retained Studio lint, Enterprise lint, and `git diff --check` passed; audit reported 0 vulnerabilities.

Pending before publication: exact-head GitHub workflows. Real provider calls, live Vault, hosted Supabase/Storage, deployment, telemetry, and infrastructure inspection are not run because they require separate explicit authority.

## Evidence and rollback

Evidence may contain source paths, schema names, test commands, counts, code-artifact hashes, and sanitized outcomes. It must not contain secrets, raw source text, raw logs, signed URLs, customer data, storage object identifiers, provider tokens, or production infrastructure identifiers.

Rollback is route disablement and command stop at the source boundary, followed by read-only projection of committed records. Preserve source versions, reviews, approvals, receipts, packages, and blueprint drafts. Correct schema or authorization defects with additive forward migration and focused regression tests; do not delete or rewrite historical evidence.
