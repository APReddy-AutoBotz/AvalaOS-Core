# AvalaOS Core

AvalaOS Core is the governed AI and automation delivery platform. It owns the governed path from process assessment through deterministic decisioning, documentation, human approval, delivery handoff, and evidence-backed portfolio visibility.

Canonical tagline: **Evaluate before you automate. Govern before you execute.**

## Start Here

Use the minimum authoritative route:

1. [Source of Truth](docs/00_SOURCE_OF_TRUTH.md)
2. [Agent Instructions](AGENTS.md)
3. [Enterprise Acceleration Plan](docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md)
4. [Current-to-Target Architecture](docs/architecture/current-to-target-enterprise-architecture.md)
5. [Risk and Evidence Register](docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md)
6. [Execution Plan Contract](PLANS.md)
7. [Document Authority Map](docs/architecture/document-authority-map.md)

Historical evidence under `docs/quality/` is immutable and is not the default reading path.

## Current Maturity

> AvalaOS Core is a credible deterministic enterprise demo with substantial source-level governance scaffolding, but not yet a coherent server-authoritative, tenant-safe pilot or production platform.

The accepted source baseline is PR #208 / PR 1C merged on `main` at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. This does not prove deployment, tenant isolation, storage, export, hosted, pilot, production, security, buyer, release-candidate, or compliance readiness.

PR 1D is the active substantial boundary; PR 1E review/approval/handoff and PR 1F calibration/economics follow before broader Studio/private-artifact expansion.

## P0 Readiness Stop

`P0-001` was AP-classified NOT DEPLOYED and its source remediation is accepted through PR #206; this is not deployment or readiness proof. Do not claim readiness and do not inspect or mutate live infrastructure without separate approval. Follow `P0-001` in the active risk register.

## Platform Modules

- **Avala Assess:** process intake, deterministic scoring, recommendations, Decision Packs, and governed handoff preparation.
- **Avala Studio:** editable delivery documentation, diagrams, approvals, and work-item preparation.
- **Avala Govern:** governance/control-plane surfaces for risk, approvals, evidence, and allowed/blocked actions. It does not execute bots, agents, RPA jobs, or external-system actions in the current baseline.
- **Avala Delivery:** governed workbench for approved work, owners, blockers, lineage, and delivery packs. It is not a Jira replacement.
- **Avala Monitor:** value, risk, blocker, and portfolio visibility.
- **Avala Admin / AI Controls:** organization, users, providers, audit, evidence, and security settings.

## Golden Path

Organization → Process Catalog → Guided Assessment → Deterministic Score → Recommendation → Decision Pack → Avala Govern → Avala Studio Handoff → Generated Document → Work Items → Avala Delivery → Avala Monitor

## Local Verification

```powershell
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm run test:ai-boundary-static
npm run test:secret-hygiene
npm run test
npm run test:evidence-execution-gate
npm run build
```

The active verification matrix lists required supplemental policy tests that are not yet included in the default `npm run test` chain.

Supabase-backed checks require separately authorized environment access. Missing authorization or infrastructure is recorded as blocked/not run, never as passed.

## Runtime Boundary

Local demo behavior is not pilot or production authority. Pilot and production must use server-authoritative identity, authorization, persistence, audit, AI, exports, and storage and must fail closed when required configuration is unavailable.

This workspace is `APReddy-AutoBotz/AvalaOS-Core`. Do not push to the historical prototype repository. KlarityFlow Health remains separate unless explicitly opened.

## PR 1D Current Authority

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

Avala Assess V2 decomposes processes into primitives and produces evidence-qualified hybrid operating models rather than one whole-process technology winner. PR 1D finalization ends reviewer-ready; V2 approval, Studio handoff, export, and sharing are not authorized.
