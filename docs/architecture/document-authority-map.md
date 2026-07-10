# AvalaOS Core Document Authority Map

## Default Reading Route

Read only this sequence unless the active task requires more:

1. `docs/00_SOURCE_OF_TRUTH.md`
2. `AGENTS.md`
3. `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`
4. `docs/architecture/current-to-target-enterprise-architecture.md`
5. `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`
6. `PLANS.md` for substantial implementation
7. One or more domain documents from the routing table below

## Active Authority

| Question | Authoritative document |
| --- | --- |
| Product identity, proof boundary, maturity, and current safe sequence | `docs/00_SOURCE_OF_TRUTH.md` |
| Durable agent and PR rules | `AGENTS.md` |
| Enterprise implementation sequence and PR boundaries | `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md` |
| Current and target trust/data/runtime architecture | `docs/architecture/current-to-target-enterprise-architecture.md` |
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
| Canonical database migration authority | `supabase/migrations/`; `docs/schema/README.md` explains the legacy-reference boundary |

## Historical Routing

- Files named `*-evidence.md`, `*-post-merge-verification.md`, reconciliation records, closed milestone plans, and historical review packs are immutable records.
- Historical records prove only what was executed or asserted at the time. They never override active authority.
- Read a historical file only when an active document links to it, a regression needs its exact prior contract, or a task explicitly requests an audit.
- Do not bulk-read or reconcile the historical corpus during ordinary implementation.
- Correct current drift in active authority; do not rewrite history.
