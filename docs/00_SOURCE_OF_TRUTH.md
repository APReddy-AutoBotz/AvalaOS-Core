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
- Rebaseline anchor: `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`
- Latest accepted repository baseline: PR #205, AvalaOS Enterprise Rebaseline, merged as `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`.
- Latest accepted source hardening before the rebaseline: PR #204, Server-Side Export Storage and Signed URL Guard Hardening Implementation Gate.
- PR 1A is accepted through PR #206 at `3ef9c9ae1b91881d12fab8d753ba152ec078c3fa`. PR 1B is accepted on `main` at `de87c86`. PR #208 / PR 1C is accepted; PR 1D is the active implementation boundary.

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

- One reproducible migration chain for the complete runtime-assumed schema. PR 1A adds executed fresh/upgrade evidence only for its minimum AI audit boundary.
- Uniform server-authoritative identity, RBAC, workspace authorization, and immediate revocation.
- Enterprise Assess persistence and server scoring parity.
- Complete RLS and two-tenant non-disclosure proof across pilot paths.
- Atomic privileged audit across all state changes.
- Safe private storage/export behavior in a deployed environment.
- Browser E2E, accessibility, responsive-state, and performance evidence. PR 1A adds candidate coverage and migration gates but does not supply browser execution evidence.
- Hosted, deployment, rollback, incident, backup/restore, operational, pilot, production, buyer, release-candidate, security, or compliance readiness.

## P0 Stop Gate

`P0-001` was a confirmed source defect in the service-role document-extraction Storage path. The AP manually inspected the intended Supabase project and classified the function as **NOT DEPLOYED**.

- The repository did not access live infrastructure and did not request or record a project reference, organization, URL, credential, screenshot, or infrastructure identifier.
- The isolated source remediation and negative tests remain the first logical PR 1A commit.
- The not-deployed decision permitted broader PR 1A implementation; it is not deployment, hosted, storage, security, pilot, or production readiness proof.
- Do not inspect or mutate live infrastructure, deploy, disable endpoints, review production logs, rotate credentials, or perform incident actions without separate explicit approval.
- Evidence excludes secrets, raw logs, signed URLs, customer data, object identifiers, and infrastructure identifiers.

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

1. PR #205, the one-time docs/config enterprise rebaseline, is accepted and merged.
2. PR 1A, Platform Safety and Fail-Closed Runtime Foundation, is accepted through PR #206.
3. PR 1B, Server-Authoritative Identity, RBAC, RLS, and Assess, is accepted on `main` at `de87c86`.
4. PR #208 / PR 1C, Enterprise Assess UI Cutover, Govern Resolution, and Studio Handoff, is accepted at the PR #208 merge baseline.
6. Continue through Studio/private artifacts, Delivery/lineage, Monitor/Admin/Trust, and deployment/pilot control as defined by the acceleration plan.

PR 1C remains one substantial vertical PR. It does not authorize deployment, live-system access, later workstreams, or a readiness claim. Routine plan-only, evidence-only, reconciliation-only, post-merge-only, and closure-only PRs remain prohibited.

## Evidence Authority

- Active status lives in this file, the acceleration plan, target architecture, risk register, implementation status, roadmap, task ledger, and readiness gates.
- Historical evidence and post-merge verification under `docs/quality/` are immutable records of what was checked at the time.
- Historical records never override current authority and are read only when task-specific evidence is required.
- Correct current drift in active documents; do not rewrite historical evidence.

## PR 1D Current Authority

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.
