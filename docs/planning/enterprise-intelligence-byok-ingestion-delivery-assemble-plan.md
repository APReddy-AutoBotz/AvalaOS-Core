# Enterprise Intelligence: BYOK, Ingestion, Delivery, and Assemble Plan

## Objective

Deliver one governed Enterprise Intelligence vertical that connects tenant-scoped provider routes, bounded document/transcript evidence, approved Studio artifacts, Delivery/Monitor projections, Modernization assessment, and Assemble Phase 1 blueprints without changing Assess scoring law or enabling autonomous execution.

Implementation branch: `codex/enterprise-intelligence-byok-ingestion-delivery-assemble`.

Required source baseline: `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5`.

## In scope

- Multi-provider BYOK configuration and capability routes for OpenAI, Azure OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints.
- Tenant-bound opaque secret references resolved only by server-side stores.
- Server endpoint allowlisting, provider validation freshness, role checks, and request/token budgets.
- Bounded private ingestion of supported text documents and transcript formats into Assess.
- Source-byte and extracted-text hashes, anchored candidate excerpts, human review, and immutable edit history.
- Deterministic Modernization disposition derived from approved PR1G records.
- Exact approved Studio handoff to Delivery, canonical work-item lineage, and Monitor baseline completeness.
- Draft-only Assemble Phase 1 blueprints with high-impact automation and Agent Tools disabled.
- Normalized server capabilities, authorization-version rechecks, independent review, three-person approval, idempotent receipts, atomic service-only persistence, RLS, tests, documentation, and rollback guidance.

## Out of scope

Assess scoring changes; OCR; audio transcription; remote URL or archive ingestion; browser-side AI or provider credentials; autonomous agents; MCP/A2A/Agent Tools execution; live telemetry; task execution; deployment; live infrastructure access; credential rotation; production or pilot readiness; and unsupported compliance or business-outcome claims.

## Acceptance criteria

1. A provider route cannot execute unless the server confirms tenant/workspace scope, normalized capability, model allowlist, opaque tenant-bound secret reference, first-party/server-allowlisted endpoint, validation freshness, actor role, and budget.
2. A source is size-bounded, stored privately under a canonical tenant path, hash-anchored, extracted without executing source instructions, and committed atomically with its first version.
3. An extracted candidate cannot be accepted unless its excerpt is anchored to the server-extracted source text; edits preserve provenance and append immutable history.
4. Modernization uses only current approved PR1G ancestry and server-derived factors; unknown high-impact factors hard-stop the disposition; Assess scoring remains unchanged.
5. Studio handoff rejects stale or non-approved artifacts and atomically creates the Delivery package, version, and canonical item rows.
6. Monitor reads canonical approved item rows and reports only the deterministic complete/incomplete baseline; it does not infer telemetry or execution.
7. Assemble creates only a draft Phase 1 blueprint with all high-impact execution/tool/agent/telemetry controls disabled.
8. High-impact approval requires an independent review event, distinct creator/reviewer/approver identities, current resource hash, and current authorization version.
9. Retried commands replay committed results or stable failures, while in-progress or raced requests do not duplicate external effects.
10. Browser clients cannot read provider key material or private source objects and cannot invoke service-only mutation RPCs directly.

## Feature quality gates

Executed in the isolated worktree:

- `node scripts/checkEnterpriseIntelligenceBoundaries.mjs` — executed evidence: passed.
- `node scripts/testEnterpriseIntelligenceMigration.mjs` — executed evidence: passed as a static PostgreSQL contract; live PostgreSQL execution remains not run.
- `npm.cmd run test:enterprise-intelligence` — executed evidence: passed domain, AI, ingestion, command, and migration-contract suites.
- `npm.cmd run typecheck` — executed evidence: passed.
- `npm.cmd run typecheck:edge` — executed evidence: passed.
- `npm.cmd run build` — executed evidence: passed; Vite reported only the existing stale Browserslist-data warning.
- `npm.cmd run test:ai-boundary-static` — executed evidence: passed with zero forbidden and zero stale allowlist entries.
- `npm.cmd run test:secret-hygiene` — executed evidence: passed.
- `npm.cmd run test:scoring` — executed evidence: passed; Assess scoring law remains unchanged.
- `git diff --check` — executed evidence: passed; Git reported only normal LF-to-CRLF working-copy warnings.
- `npm.cmd run test` — executed evidence: the bounded 10-minute run passed the early regression, buyer-acceptance, provider-resolver, required-supplemental, and PR1D source/domain stages, then timed out in the existing PR1D coverage stage without a product assertion failure.

Not run or requiring separate approved authority: fresh/upgrade PostgreSQL migration execution, RLS/two-tenant adversarial execution, real provider calls, environment/Vault validation, browser desktop/mobile/accessibility/performance validation, hosted deployment verification, live telemetry, and live infrastructure inspection.

## Evidence and rollback

Evidence may contain source paths, schema names, test commands, counts, hashes of code artifacts, and sanitized outcomes. It must not contain secrets, raw source text, raw logs, signed URLs, customer data, object identifiers, provider tokens, or production infrastructure identifiers.

Rollback is route disablement and command stop at the source boundary, followed by read-only projection of committed records. Preserve source versions, reviews, approvals, receipts, packages, and blueprint drafts. Correct schema or authorization defects with additive forward migration and focused regression tests; do not delete or rewrite historical evidence.
