# PR 1A Platform Safety And Fail-Closed Runtime Evidence

Status: implementation candidate on `codex/pr-1a-platform-safety-fail-closed-runtime`; acceptance and merge pending

Accepted starting point: rebaseline merge `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`

## Decision And Scope

The AP manually inspected the intended Supabase project and reported that the `extract-document-text` Edge Function was not present. The P0 deployment classification is therefore **NOT DEPLOYED**. This repository run did not inspect live infrastructure and did not request, record, or emit a project reference, organization, URL, credential, screenshot, or infrastructure identifier.

The isolated P0 remediation remains the first logical commit, `fa42a0ff78d3f8af448951031a97ed9e6a3c3d1a`. Broader PR 1A work followed only after the AP supplied the not-deployed decision.

This PR changes platform-safety source, tests, CI, one canonical migration, and the directly related active documentation. It does not change deterministic scoring, deploy anything, access another live system, rotate credentials, perform incident actions, or begin PR 1B or PR 1C.

## Implemented Boundary

| Area | Candidate behavior |
| --- | --- |
| Runtime modes | Adds exact `local_demo`, `automated_test`, `pilot`, and `production` modes with no implicit mode. Pilot and production require server configuration and reject mock persistence, demo identity authority, and browser AI fallback. |
| Identity projection | Removes email-based demo-persona role and permission merging from server-authenticated users. This does not claim completion of PR 1B server RBAC or revocation. |
| P0 Storage boundary | Derives the extraction bucket from strict server configuration and allowlist membership, validates canonical tenant paths and the Supabase origin, encodes path segments, refuses redirects, and returns stable sanitized failures. |
| Edge export boundary | Validates exact request schemas, organization/workspace membership, `docs.export`, requested organization binding, resource ownership/status/version, and stable non-disclosing errors before privileged access. Export remains disabled unless explicitly configured. |
| Privileged audit | Required AI job creation/completion and required usage logging fail closed. Supplemental telemetry remains best effort only where the primary denial or failure stays fail closed. |
| Unsafe rendering | Routes the three validated Markdown/HTML sinks through a structural allowlist sanitizer and hardens Mermaid with strict security and disabled HTML labels. |
| False success | Requires durable document persistence before entering the generated workspace and exposes persistence failure instead of substituting a transient artifact. |
| Migration authority | Adds the minimum canonical AI job/usage audit schema required by PR 1A, enables and forces RLS with no browser policies, validates constraints, and rejects invalid lifecycle transitions and negative token counts. |
| CI ownership | Adds Edge-compatible TypeScript validation, PR 1A source guards, focused regression suites, changed-critical-module coverage, and fresh/upgrade migration execution. The default test chain now includes the previously omitted evidence, product-action, workflow, artifact, and helper-guard suites. |

## Controlled Review And Implementation Waves

- Wave 1 was findings-only. `security_reviewer` and `quality_reviewer` completed read-only review tasks. `architecture_explorer` could not initialize a native Windows command because the sandbox helper returned `helper_unknown_error: apply deny-read ACLs`; the root controller performed the architecture synthesis from the authoritative files. All reviewers were closed before implementation began.
- Wave 2 used only implementation-worker tracks with exclusive scopes for runtime policy, Edge/export/audit, and UI rendering/false-success behavior. Native Windows helper failures blocked some child edits, so the root controller integrated and verified the complete change set. No unsupported child workspace-permission claim is made.
- No child delegated or spawned descendants. Per-agent execution model and reasoning metadata were not exposed, so execution model remains unverified rather than inferred from configuration compatibility.

## Executed Local Evidence

| Check | Result | Material signal |
| --- | --- | --- |
| `npm run typecheck` | Passed | Browser/application TypeScript exited 0. |
| `npm run typecheck:edge` | Passed | Edge source and shared boundary types exited 0. |
| `npm run lint:pr1a` | Passed | PR 1A source-boundary invariants exited 0. |
| `npm run test:pr1a` | Passed | Runtime, export, audit, rendering, false-success, migration-contract, and coverage gates passed. Coverage was 95.98% lines, 93.33% branches, and 95.00% functions for the owned critical modules. |
| `npm run test:required-supplemental` | Passed | Evidence execution, product-action, delivery-workflow, artifact-export, and helper-guard suites passed: 13 product-action, 12 workflow, 7 artifact, and 5 helper-guard tests. |
| `npm test` | Passed | The complete default and supplemental chained regression path exited 0; locked deterministic scoring remained green. |
| `npm run test:migrations:pr1a` | Passed | A disposable PostgreSQL 15 harness passed fresh application of all canonical migrations, PR 1A reapplication, targeted legacy upgrade, RLS/constraint assertions, transition rejection, and invalid-token rejection. |
| `npm run build` | Passed with warning | 201 modules transformed; production bundle completed. Browserslist data was six months old; no dependency mutation was performed. |
| `npm audit --audit-level=moderate` | Passed | Zero vulnerabilities. |
| `npm run test:ai-boundary-static` | Passed | 15 patterns, 734 classified hits, zero forbidden hits, and zero stale allowlist entries. |
| `npm run test:secret-hygiene` | Passed | 5 rules, zero forbidden hits, and zero tracked environment files. |
| `codex app-server --strict-config --stdio` | Passed | Stable WSL Codex 0.144.1 loaded the disposable project with a session-only trust override and exited 0 with no unsupported-key error. The native Windows executable access denial and the untrusted WSL attempt are not counted as passes. |
| Changed-document Markdown link validation | Passed | 10 changed Markdown files were parsed offline; no local Markdown link targets were present and no broken target was reported. External links were not fetched. |
| `git diff --check` | Passed | Exit 0; line-ending notices were informational and no whitespace error was reported. |

The migration harness used only disposable local databases and a temporary local PostgreSQL container. It did not reset or inspect an existing application database, and all temporary databases, container state, and probe files were removed. An earlier ad hoc attempt using a broad legacy file encountered an unrelated legacy provider-policy conflict and is not counted as evidence; the committed targeted legacy fixture is the reproducible supported-upgrade proof for this PR's audit boundary.

## Blocked Or Not Run

| Check | Status | Reason |
| --- | --- | --- |
| Browser E2E, accessibility, responsive-state, and performance execution | Blocked | The repository did not contain an executable Playwright CLI. The managed approval service denied the required third-party package download, so no browser run occurred and no pass is claimed. Source-level rendering and false-success tests passed. |
| Live deployment, hosted schema, RLS/tenant isolation, Storage, Edge invocation, logs, secrets, incident, rotation, backup/restore, and production checks | Not run | Outside the authorized PR 1A boundary. The AP-provided P0 decision is recorded without repository-side live access. |
| Implementation-worker disposable write probe | Not run | The product implementation wave is not used as a Codex sandbox experiment; no runtime permission result is inferred. |

## Rollback And Read-Only Fallback

- Keep vulnerable or unverified endpoints disabled. Never restore request-controlled bucket authority, service-role URL construction, browser AI authority, or pilot/production fail-open behavior.
- Disable Edge exports by removing or setting the explicit export enable flag to false; missing strict bucket configuration already fails closed.
- Non-security UI and runtime refactors may be reverted if necessary, but the security boundaries must be preserved or forward-fixed.
- For the additive audit migration, prefer a forward fix or read-only maintenance mode. Preserve audit history; do not use a destructive down migration as the normal rollback.

## Readiness Decision

PR 1A is an implementation candidate with executed local source and migration evidence. It is not deployment, hosted-schema, tenant-isolation, pilot, production, buyer, release-candidate, security-certification, or compliance-readiness proof. PR 1B may begin only after PR 1A is accepted and merged with required CI green; it must still deliver server-authoritative identity/RBAC/RLS/Assess and its own two-tenant, revocation, migration, and deterministic-scoring evidence.
