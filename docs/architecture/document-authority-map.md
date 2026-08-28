# AvalaOS Core Document Authority Map

## Studio governed-artifact authority

The canonical Studio governed-artifact data, command, lifecycle, source-package, template, Assess-to-Studio handoff, trust, legacy, and rollback boundary is `docs/architecture/studio-governed-artifact-authority.md`. The accepted private-rendition, storage, brokered-download, retention, legal-hold, deletion, reconciliation, and rollback authority remains routed separately to `docs/architecture/studio-private-artifact-authority.md`. The active governed multi-source transcript implementation boundary and its PR A/PR B/PR C sequence are defined by `docs/planning/governed-multisource-transcript-module-handoff-plan.md`.


## Default Reading Route

Read only this sequence unless the active task requires more:

1. `docs/00_SOURCE_OF_TRUTH.md`
2. `AGENTS.md`
3. `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`
4. `docs/architecture/current-to-target-enterprise-architecture.md`
5. `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`
6. `PLANS.md` for substantial implementation
7. One or more domain documents from the routing table below

## Authority Precedence

- `AGENTS.md` governs agent execution, approval requirements, safety constraints, delegation, and delivery discipline.
- `docs/00_SOURCE_OF_TRUTH.md` governs product scope, maturity, readiness/proof boundaries, and the accepted implementation sequence.
- Each domain document governs only the questions assigned to it in the table below.
- No document has blanket precedence outside its assigned domain.
- If a genuine conflict crosses these boundaries and cannot be resolved safely, stop and request AP clarification.

## Active Authority

| Question | Authoritative document |
| --- | --- |
| Product identity, proof boundary, maturity, and current safe sequence | `docs/00_SOURCE_OF_TRUTH.md` |
| Durable agent and PR rules | `AGENTS.md` |
| Enterprise implementation sequence and PR boundaries | `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md` |
| Current and target trust/data/runtime architecture | `docs/architecture/current-to-target-enterprise-architecture.md` |
| Enterprise Intelligence BYOK, evidence ingestion, Studio handoff, Delivery/Monitor lineage, Modernization, and Assemble Phase 1 authority | `docs/architecture/enterprise-intelligence-authority.md` |
| Governed multi-source transcript PR sequence, cross-module handoffs, and acceptance gates | `docs/planning/governed-multisource-transcript-module-handoff-plan.md` |
| Studio source packages, tenant templates, structured editing, governed generation, and Assess-to-Studio handoff consumption | `docs/architecture/studio-governed-artifact-authority.md` |
| Active security, reliability, quality, and readiness risks | `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md` |
| Cross-layer execution-plan requirements | `PLANS.md` |
| Product strategy and boundaries | `docs/01_PRODUCT_STRATEGY.md`, then `docs/02_PRODUCT_REQUIREMENTS.md` |
| Architecture detail | `docs/03_TECHNICAL_ARCHITECTURE.md` |
| Active roadmap | `docs/04_MVP_ROADMAP.md`, then `docs/planning/milestone-roadmap.md` for chronology |
| Implemented, partial, and blocked status | `docs/05_IMPLEMENTATION_STATUS.md` |
| Security and governance policy | `docs/06_SECURITY_AND_GOVERNANCE.md` |
| Govern scope | `docs/07_AVALA_GOVERN_FRAMEWORK.md` |
| Historical prototype separation | `docs/08_MIGRATION_FROM_KLARITYPM.md` |
| Active task and accepted milestone ledger | `docs/task-ledger.md` |
| Readiness definitions | `docs/quality/readiness-gates.md` |
| Verification commands | `docs/quality/verification-command-matrix.md` |
| Accepted Studio private rendition, storage, download, retention, legal-hold, deletion, and rollback authority | `docs/architecture/studio-private-artifact-authority.md` |
| PR #217 post-merge projection, command-translation, crash-recovery, due-work, and hold/deletion serialization correction | `docs/architecture/pr217-post-merge-runtime-contract-forward-fix.md` |
| Canonical database migration authority | `supabase/migrations/`; `docs/schema/README.md` explains the legacy-reference boundary |

The Enterprise Intelligence implementation plan and acceptance gates are maintained in `docs/planning/enterprise-intelligence-byok-ingestion-delivery-assemble-plan.md`. It is an active execution plan, not a substitute for the authority documents above.

## PR Governance Boundary

PR #205 is the explicitly authorized one-time docs/config-only enterprise rebaseline. After it is accepted, routine plan-only, evidence-only, reconciliation-only, post-merge-only, and closure-only PRs are prohibited. This exception does not authorize another documentation-only control PR or weaken the requirement to keep implementation, tests, documentation, evidence, and rollback together.

## Historical Routing

- Files named `*-evidence.md`, `*-post-merge-verification.md`, reconciliation records, closed milestone plans, and historical review packs are immutable records.
- Historical records prove only what was executed or asserted at the time. They never override active authority.
- Read a historical file only when an active document links to it, a regression needs its exact prior contract, or a task explicitly requests an audit.
- Do not bulk-read or reconcile the historical corpus during ordinary implementation.
- Correct current drift in active authority; do not rewrite history.

## PR 1D Current Authority

PR 1D closure baseline `779a4801aa7c6660ad4581f8e334f5ad422519e7` remains retained and its decisions remain immutable. V1 `assess-core-2026-05` scoring remains unchanged. PR 1E review/approval and Studio-handoff authority, PR 1F economics/calibration, and PR 1G Application Portfolio Assessment are accepted. Hosted/live validation and deployment were not run.

## Current governed-transcript authority

Governed multi-source transcript PR A is accepted at source/CI level through PR #255 on `main` at `11e670003a73b0ab5a28650b70afac4b267760f4`. Governed multi-source transcript PR B is the active substantial Studio boundary. PR C Delivery/Monitor work remains excluded. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

| Avala Assess V2 domain, rule, command, persistence, compatibility, and rollback architecture | `docs/architecture/assess-v2-decision-intelligence-architecture.md` |

| Assess V2 economics, formula, calibration, realized-outcome, and portfolio-intelligence architecture | `docs/architecture/assess-v2-economics-calibration-architecture.md` |
| Application Portfolio & AI-Assisted Modernization Assessment architecture | `docs/architecture/application-portfolio-assessment-architecture.md` |

| Draft Trust Assurance Evidence Hub data, command, projection, UI targeting, migration, and rollback boundary | `docs/architecture/trust-assurance-evidence-hub.md` |
