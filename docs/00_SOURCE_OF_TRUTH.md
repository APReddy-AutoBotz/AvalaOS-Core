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
- `docs/07_AVALA_GOVERN_FRAMEWORK.md`: Avala Govern boundaries and future govern expansion.
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

- M0 through M4.5 are closed as migration, build-control, governance hardening, governed-delivery, server-side AI/BYOK hardening, and buyer-demo readiness milestones.
- M5 enterprise readiness is the active readiness track after buyer-demo closure.
- M5.0 enterprise Supabase readiness, M5.1 environment and secret hygiene, M5.2 auth/org/workspace planning, and M5.3 RLS policy design/test planning have evidence on main.
- M5.2 authority work continued after the M5.3 planning slice. M5.2a through M5.2g-a are treated as prerequisite authority and ownership groundwork for future RLS implementation, not as RLS proof.
- M5.2g-a created the `delivery_work_items` authority table with RLS enabled and no policies, and its post-merge verification is present on main. That is fail-closed readiness only. It does not prove tenant isolation and does not make Delivery runtime production-ready.
- M5.3 remains a design and test plan for RLS policy implementation. M5.3a through M5.3a-11 add docs-only planning, local-readiness boundary decisions, synthetic/non-executing boundary implementation, and reconciliation records. They do not prove local readiness, schema availability, RLS behavior, RLS helper behavior, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, or local startup success.
- M5.3a-9 implemented a synthetic/non-executing RLS and artifact evidence harness boundary validator with synthetic-only unit tests. M5.3a-10 closed the docs-only reconciliation gate for that synthetic boundary. No real assertion execution is approved, no DB/RLS/artifact execution is approved, and no readiness evidence exists.
- M5.3a-11 closed the docs-only M5.3 tracking reconciliation after synthetic boundary closure. It does not reopen local readiness, approve real assertions, or produce readiness evidence.
- M5.4a-M5.4f are closed as the enterprise planning evidence pack. They define audit/evidence, security/governance, hosted evidence planning, deployment/operations, product/buyer, and release-candidate planning boundaries only; they are not readiness proof.
- PR #161-#175 are accepted as the Premium Enterprise full-name and claim-safe naming, Trust Center proof-status, read-only Admin UI/Admin Workbench, Buyer Acceptance Pack, review gate, admin walkthrough, Browser Walkthrough, manual runbook, manual execution approval record, and manual browser pre-execution readiness approval-boundary track.
- Latest accepted Premium Enterprise baseline: PR #175; accepted/head commit `0d6af348336c4bda658de900b857aa5ad14b5081`; merge commit `1aaa83fd93ea115ec838cb97add9d717bad663c1`; post-merge verification commit/current main HEAD/tag target `27e1e7d25974cf9da809c98cfbb69df88afd94d4`; tag `avalaos-core-premium-enterprise-buyer-acceptance-manual-browser-walkthrough-pre-execution-readiness-check`.
- PR #175 is a pre-execution readiness check for AP go/no-go decision only. AP approval has not been granted; browser execution has not been approved or performed; no browser launched, automation ran, screenshots were captured, export/PDF/download artifacts were produced, browser/run evidence was created, approval workflow ran, or statuses changed.
- Real DB/RLS/artifact, hosted, deployment, schema, provider, classifier, and real assertion execution remain unperformed. Production, hosted, deployment, RLS, tenant-isolation, security, buyer, product, release-candidate, and compliance readiness remain unproven.
- The M5.3a local-readiness loop remains stopped. Local DB availability remains unresolved; schema, RLS, RLS helper behavior, artifact SELECT isolation, tenant isolation, hosted readiness, production readiness, and local startup success remain unproven until a later explicit AP approval gate authorizes exact real evidence scope.
- KlarityFlow Health remains separate from AvalaOS Core. Health proof-pack docs are historical or planning references unless a later approved Health milestone is explicitly opened.

## Non-Negotiables

- Deterministic scoring remains deterministic.
- AI must not decide final scores, gates, risk tiers, or recommendations.
- Browser-stored API keys and browser-side AI are not acceptable for pilot or production behavior.
- Server-side AI through Supabase Edge Functions remains the pilot and production direction.
- Avala Govern is a governance and control-plane surface, not runtime agent execution.
- Avala Delivery is a governed delivery workbench, not a full Jira replacement.
- No unsupported compliance claims are made.
- The product should feel like a calm enterprise workbench, not a flashy AI toy.

## AP Naming Decision And Proof Boundary

Avala Govern and Avala Delivery are the buyer-facing canonical product names for the premium enterprise baseline. Scope boundaries are enforced through claim controls, Trust Center proof statuses, evidence references, limitation disclosures, and acceptance gates rather than buyer-facing module names.

Avala Govern does not execute bots, agents, RPA jobs, external-system actions, MCP controls, A2A controls, or live runtime enforcement unless future AP-approved milestones implement and verify those capabilities.

Avala Delivery governs approved work items, owners, blockers, handoff lineage, delivery packs, evidence checklists, and downstream delivery handoff. It is not a Jira replacement.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Avala Govern -> Avala Studio Handoff -> Generated Document -> Work Items -> Avala Delivery Board -> Avala Monitor Dashboard.

## Build Control Pack

M0.2 established the internal build control pack: root agent instructions, `.agent` operating rules and skills, architecture boundaries, governance models, readiness gates, ADRs, planning docs, demo scripts, and final evidence review. These controls guide future milestones but do not change product behavior by themselves.

## Next Safe Sequence

1. Treat M5.2 authority through M5.2g-a as accepted prerequisite groundwork with the fail-closed caveat preserved.
2. Treat M5.3a through M5.3a-11 as accepted planning, boundary, synthetic-only, and reconciliation records, not RLS implementation, tenant-isolation proof, or readiness evidence.
3. Treat M5.4a-M5.4f as closed enterprise planning evidence-pack records, not production, hosted, deployment, security, buyer, product, release-candidate, compliance, RLS, or tenant-isolation readiness proof.
4. Treat PR #161-#175 as the accepted Premium Enterprise approval-boundary track through PR #175, with PR #175 limited to AP go/no-go pre-execution readiness review.
5. Pause for AP review before any next milestone. If further drift is found, use a docs-only reconciliation follow-up.
6. If AP wants to consider manual browser execution, open a separate AP-approved manual browser go/no-go decision gate that defines exact scope, run count, output boundaries, prohibited artifacts, stop conditions, and proof boundaries before execution.
7. Do not recommend or start direct browser execution from this reconciliation. Browser execution remains unapproved until a separate AP approval gate grants it explicitly.
8. Keep the M5.3a local-readiness loop stopped unless AP approves a new docs-only gate that explicitly reopens a bounded path.
9. Require a new explicit AP approval milestone before any real DB/RLS/artifact evidence run, with exact assertion scope, run count, output boundaries, stop conditions, and proof boundaries defined before execution.
