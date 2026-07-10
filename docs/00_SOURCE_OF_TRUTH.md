# AvalaOS Core Source Of Truth

AvalaOS Core is the governed AI and automation delivery platform.

Canonical tagline: **Evaluate before you automate. Govern before you execute.**

This file governs product scope, maturity, readiness/proof boundaries, and the accepted implementation sequence.

## Minimum Reading Sequence

1. This file
2. `AGENTS.md`
3. `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`
4. `docs/architecture/current-to-target-enterprise-architecture.md`
5. `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`
6. `PLANS.md` for substantial implementation
7. A task-specific document selected through `docs/architecture/document-authority-map.md`

Do not read the full historical planning/evidence corpus by default.

## Authority Precedence

- `AGENTS.md` governs agent execution, approval requirements, safety constraints, delegation, and delivery discipline.
- This file governs product scope, maturity, readiness/proof boundaries, and the accepted implementation sequence.
- Domain documents govern only the areas assigned by `docs/architecture/document-authority-map.md`.
- No document has blanket precedence outside its assigned domain.
- If a genuine conflict crosses these boundaries and cannot be resolved safely, stop and request AP clarification.

## Accepted Source Baseline

- Repository: `APReddy-AutoBotz/AvalaOS-Core`
- Branch: `main`
- Rebaseline anchor: `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09`
- Latest accepted source hardening: PR #204, Server-Side Export Storage and Signed URL Guard Hardening Implementation Gate
- PR #204 is source-level defense-in-depth only. It is not deployment, export, storage, signed-URL, tenant-isolation, hosted, pilot, production, security, buyer, release-candidate, or compliance proof.

## Maturity Verdict

> AvalaOS Core is a credible deterministic enterprise demo with substantial source-level governance scaffolding, but not yet a coherent server-authoritative, tenant-safe pilot or production platform.

## Accepted Capabilities

- React/Vite TypeScript product shell and role-aware demo journeys.
- Avala Assess process catalog, guided assessment, deterministic scoring, Decision Pack, review concepts, and handoff scaffolding.
- Locked deterministic scoring regression harness.
- Avala Studio document generation/review workspace and work-item preparation.
- Avala Govern governance/control-plane models and human approval concepts.
- Avala Delivery boards, policies, retained-lineage scaffolding, and delivery packs.
- Server-side AI/provider-governance sources and selected fail-closed provider controls.
- Canonical Supabase migration groundwork plus additional legacy schema contracts.
- Source-level product-action, workflow, artifact export, storage, and signed-URL guard hardening through PR #204.
- Extensive historical planning and evidence records, preserved as history.

## Not Accepted Or Proven

- One reproducible migration chain for the runtime-assumed schema.
- Uniform server-authoritative identity, RBAC, workspace authorization, and immediate revocation.
- Enterprise Assess persistence and server scoring parity.
- Complete RLS and two-tenant non-disclosure proof across pilot paths.
- Atomic privileged audit across all state changes.
- Safe private storage/export behavior in a deployed environment.
- Browser E2E, accessibility, performance, coverage, and migration gates as standard CI.
- Hosted, deployment, rollback, incident, backup/restore, operational, pilot, production, buyer, release-candidate, security, or compliance readiness.

## P0 Stop Gate

`P0-001` is a confirmed source defect in the service-role document-extraction Storage path. Deployment status is unknown.

- It is the first gate for PR 1A and all readiness claims.
- Do not inspect or mutate live infrastructure, disable endpoints, review production logs, rotate credentials, or perform incident actions without separate explicit approval.
- While deployment is unknown, treat the path as potentially deployed and block readiness claims.
- The full unknown/deployed/not-deployed decision tree is in the acceleration plan and active risk register.
- Evidence must exclude secrets, raw logs, signed URLs, customer data, object identifiers, and production infrastructure identifiers.

## Product And Security Law

- Deterministic scoring remains deterministic.
- Scoring formulas, weights, thresholds, hard stops, and recommendation logic require an explicit score version change and regression tests.
- AI cannot decide scores, risk gates, approvals, or regulated decisions.
- Pilot and production cannot use browser-held provider secrets, browser AI execution, demo identity, mock persistence, or silent fallback success.
- Client claims, email matching, demo personas, cached permissions, routes, and UI state are not server authorization.
- Humans approve material risk; privileged decisions require evidence and audit.
- No unsupported compliance claims are made.
- Avala Govern is a governance/control-plane surface, not runtime agent execution.
- Avala Delivery is a governed workbench, not a Jira replacement.
- Runtime AGS, MCP, A2A, autonomous agent execution, bot execution, RPA job execution, and external-system actions remain out of scope.
- KlarityFlow Health remains separate unless explicitly opened.

## Active Enterprise Sequence

1. Accept and merge the docs/config-only enterprise rebaseline PR.
2. Start PR 1A from a fresh current `main`; resolve the P0 gate before normal work.
3. PR 1A: Platform Safety and Fail-Closed Runtime Foundation.
4. PR 1B: Server-Authoritative Identity, RBAC, RLS, and Assess.
5. PR 1C: Enterprise Assess UI Cutover, Govern Resolution, and Studio Handoff.
6. Continue through Studio/private artifacts, Delivery/lineage, Monitor/Admin/Trust, and deployment/pilot control as defined by the acceleration plan.

PR #205 is the explicitly authorized one-time docs/config-only enterprise rebaseline. After it is accepted, each workstream uses one to three substantial vertical PRs only when security, schema, deployment, or rollback boundaries require it. Routine plan-only, evidence-only, reconciliation-only, post-merge-only, and closure-only PRs are prohibited; PR #205 does not weaken that future rule.

## Evidence Authority

- Active status lives in this file, the acceleration plan, target architecture, risk register, implementation status, roadmap, task ledger, and readiness gates.
- Historical evidence and post-merge verification under `docs/quality/` are immutable records of what was checked at the time.
- Historical records never override current authority and are read only when task-specific evidence is required.
- Correct current drift in active documents; do not rewrite historical evidence.
