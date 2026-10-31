# AvalaOS Core

AvalaOS Core is the governed AI and automation delivery platform. It owns the governed path from process assessment through deterministic decisioning, documentation, human approval, delivery handoff, and evidence-backed portfolio visibility.

Canonical tagline: **Evaluate before you automate. Govern before you execute.**

## Start Here

For product understanding, start with the [end-to-end product guide](docs/09_END_TO_END_PRODUCT_GUIDE.md), [current implementation status](docs/05_IMPLEMENTATION_STATUS.md), and [remaining delivery plan](docs/04_MVP_ROADMAP.md).

For agent execution, use the minimum authoritative route:

1. [Source of Truth](docs/00_SOURCE_OF_TRUTH.md)
2. [Agent Instructions](AGENTS.md)
3. [Enterprise Acceleration Plan](docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md)
4. [Current-to-Target Architecture](docs/architecture/current-to-target-enterprise-architecture.md)
5. [Risk and Evidence Register](docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md)
6. [Execution Plan Contract](PLANS.md)
7. [Document Authority Map](docs/architecture/document-authority-map.md)

Historical evidence under `docs/quality/` is immutable and is not the default reading path.

## Current position — 2026-10-31

PR345 release `80f6e97b6047718c15163e51df3e879bc6307668` is verified at its source/CI release boundary. The downstream actor-transition harness correction has passed focused local regressions and is being published with the current documentation; fresh candidate CI and release verification remain separate gates.

The last integrated result remains **61 PASS / 47 BLOCKED** on the earlier PR343 release, with cleanup verified. These are blocked requirements, not 47 confirmed product defects. Local regression and release-preparation success do not promote UAT, hosted, deployment or production readiness. See the [status table](docs/05_IMPLEMENTATION_STATUS.md) for exact evidence and limits.

## P0 Readiness Stop

`P0-001` was AP-classified NOT DEPLOYED and its source remediation is accepted through PR #206; this is not deployment or readiness proof. Do not claim readiness and do not inspect or mutate live infrastructure without separate approval. Follow `P0-001` in the active risk register.

## Platform Modules

- **Avala Assess:** process intake, deterministic scoring, recommendations, Decision Packs, and governed handoff preparation.
- **Avala Studio:** editable delivery documentation, diagrams, approvals, and work-item preparation.
- **Avala Govern:** governance/control-plane surfaces for risk, approvals, evidence, and allowed/blocked actions. It does not execute bots, agents, RPA jobs, or external-system actions in the current baseline.
- **Avala Delivery:** governed workbench for approved work, owners, blockers, lineage, and delivery packs. It is not a Jira replacement.
- **Avala Monitor:** value, risk, blocker, and portfolio visibility.
- **Avala Admin / AI Controls:** organization, users, providers, audit, evidence, and security settings.

## Supported product flow

Assess → human review/approval and Govern → explicit Studio handoff → reviewed/approved artifact → explicit Delivery handoff → approved Delivery package → read-only Monitor baseline.

Users may also start in Studio or Delivery. Direct starts retain `not_assessed` / `planning_only` status; no module automatically creates or approves the next resource. Current canonical Studio artifact types are BRD, FRD and PDD. Supporting capabilities include Enterprise Intelligence/source ingestion, Application Portfolio/Modernization, economics, Trust/Assurance and draft-only Assemble Phase 1. The [product guide](docs/09_END_TO_END_PRODUCT_GUIDE.md) defines each input, output and boundary.

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

## Publication and readiness

Published PR content and the corresponding local files must match. A PR branch is not `main`, a passing CI run is not integrated acceptance, and integrated acceptance is not production approval. Keep current documentation with its implementation PR; preserve historical evidence. No new hosted run or merge is authorized by this documentation update.
