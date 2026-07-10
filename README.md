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

The accepted source baseline is `main` at `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09`, including PR #204 source-level export/storage/signed-URL guard hardening. This does not prove deployment, tenant isolation, storage, export, hosted, pilot, production, security, buyer, release-candidate, or compliance readiness.

The active first implementation sequence is PR 1A → PR 1B → PR 1C. It begins only after the enterprise rebaseline PR is accepted and merged.

## P0 Readiness Stop

The source contains a service-role Storage URL escape in the document-extraction path. Deployment status is unknown. Do not claim readiness and do not inspect or mutate live infrastructure without separate approval. Follow `P0-001` in the active risk register.

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
