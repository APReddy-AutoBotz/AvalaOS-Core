# AvalaOS Core Source Of Truth

AvalaOS Core is the governed AI and automation delivery platform.

Canonical tagline: Evaluate before you automate. Govern before you execute.

This documentation set is the active source of truth for product positioning, requirements, architecture, roadmap, implementation status, security, governance, readiness, and migration context.

## Canonical Docs

- `README.md`: repository entry point, run commands, module summary, and current baseline.
- `docs/01_PRODUCT_STRATEGY.md`: market position, product boundaries, modules, personas, and narrative.
- `docs/02_PRODUCT_REQUIREMENTS.md`: MVP and pilot requirements by module.
- `docs/03_TECHNICAL_ARCHITECTURE.md`: current and target architecture.
- `docs/04_MVP_ROADMAP.md`: roadmap and enterprise-readiness sequencing.
- `docs/05_IMPLEMENTATION_STATUS.md`: implemented, partial, blocked, and next-safe areas.
- `docs/06_SECURITY_AND_GOVERNANCE.md`: security posture, AI controls, audit, and governance minimums.
- `docs/07_AVALA_GOVERN_FRAMEWORK.md`: Avala Govern Lite and future govern expansion.
- `docs/08_MIGRATION_FROM_KLARITYPM.md`: historical prototype name and migration constraints.
- `docs/task-ledger.md`: milestone ledger, evidence links, and current decisions.
- `docs/governance/avala-product-law.md`: canonical product law for governed delivery.
- `docs/quality/readiness-gates.md`: readiness gates and evidence requirements.
- `docs/quality/verification-command-matrix.md`: quality commands and expected local verification scope.
- `docs/planning/milestone-roadmap.md`: milestone sequencing and next safe milestone path.
- `.agent/README.md`: Codex operating system for milestone execution.

## Evidence Authority

Historical evidence and post-merge verification files under `docs/quality/` are immutable records. They prove what was checked at the time they were written, but they do not supersede this source-of-truth file, the current roadmap, the current implementation status, or the current task ledger.

When a historical evidence file conflicts with current canonical docs, preserve the evidence file as history and update canonical docs instead. Do not rewrite closed evidence unless the user explicitly asks for a corrective evidence addendum.

## Current Accepted Baseline

- M0 through M4.5 are closed as migration, build-control, Govern Lite, governed-delivery, server-side AI/BYOK hardening, and buyer-demo readiness milestones.
- M5 enterprise readiness is the active readiness track after buyer-demo closure.
- M5.0 enterprise Supabase readiness, M5.1 environment and secret hygiene, M5.2 auth/org/workspace planning, and M5.3 RLS policy design/test planning have evidence on main.
- M5.2 authority work continued after the M5.3 planning slice. M5.2a through M5.2g-a are treated as prerequisite authority and ownership groundwork for future RLS implementation, not as RLS proof.
- M5.2g-a created the `delivery_work_items` authority table with RLS enabled and no policies, and its post-merge verification is present on main. That is fail-closed readiness only. It does not prove tenant isolation and does not make Delivery runtime production-ready.
- M5.3 remains a design and test plan for RLS policy implementation. M5.3a through M5.3a-10 add docs-only planning, local-readiness boundary decisions, synthetic/non-executing boundary implementation, and reconciliation records. They do not prove local readiness, schema availability, RLS behavior, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, or local startup success.
- M5.3a-9 implemented a synthetic/non-executing RLS and artifact evidence harness boundary validator with synthetic-only unit tests. M5.3a-10 closed the docs-only reconciliation gate for that synthetic boundary. No real assertion execution is approved, no DB/RLS/artifact execution is approved, and no readiness evidence exists.
- The M5.3a local-readiness loop remains stopped. Local DB availability remains unresolved; schema, RLS, RLS helper behavior, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, and local startup success remain unproven until a later explicit AP approval gate authorizes exact real evidence scope.
- KlarityFlow Health remains separate from AvalaOS Core. Health proof-pack docs are historical or planning references unless a later approved Health milestone is explicitly opened.

## Non-Negotiables

- Deterministic scoring remains deterministic.
- AI must not decide final scores, gates, risk tiers, or recommendations.
- Browser-stored API keys and browser-side AI are not acceptable for pilot or production behavior.
- Server-side AI through Supabase Edge Functions remains the pilot and production direction.
- Avala Govern Lite remains a scoped governance surface, not runtime agent execution.
- Avala Delivery Lite remains a governed handoff and work item surface, not a full Jira replacement.
- No unsupported compliance claims are made.
- The product should feel like a calm enterprise workbench, not a flashy AI toy.

## Lite Naming Boundary

Avala Govern Lite and Avala Delivery Lite are currently canonical product names. "Lite" means intentionally scoped governance and delivery surfaces for the current product baseline. It is not old branding and should not be removed unless AP approves a broader product-scope change.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Avala Govern Lite -> Avala Studio Handoff -> Generated Document -> Work Items -> Avala Delivery Lite Board -> Avala Monitor Dashboard.

## Build Control Pack

M0.2 established the internal build control pack: root agent instructions, `.agent` operating rules and skills, architecture boundaries, governance models, readiness gates, ADRs, planning docs, demo scripts, and final evidence review. These controls guide future milestones but do not change product behavior by themselves.

## Next Safe Sequence

1. Treat M5.2 authority through M5.2g-a as accepted prerequisite groundwork with the fail-closed caveat preserved.
2. Treat M5.3a through M5.3a-10 as accepted planning, boundary, synthetic-only, and reconciliation records, not RLS implementation, tenant-isolation proof, or readiness evidence.
3. Keep the M5.3a local-readiness loop stopped unless AP approves a new docs-only gate that explicitly reopens a bounded path.
4. Require a new explicit AP approval milestone before any real DB/RLS/artifact evidence run, with exact assertion scope, run count, output boundaries, stop conditions, and proof boundaries defined before execution.
5. Continue M5 enterprise readiness with audit, export, deployment, runbook, and pilot-evidence milestones only after their scope is approved.
