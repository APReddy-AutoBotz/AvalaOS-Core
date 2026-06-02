# AvalaOS Core Source Of Truth

AvalaOS Core is the governed AI and automation delivery platform.

Canonical tagline: Evaluate before you automate. Govern before you execute.

This documentation set is the source of truth for product positioning, requirements, architecture, roadmap, implementation status, security, governance, and migration context.

## Canonical Docs

- `docs/01_PRODUCT_STRATEGY.md`: market position, product boundaries, modules, personas, and narrative.
- `docs/02_PRODUCT_REQUIREMENTS.md`: MVP and pilot requirements by module.
- `docs/03_TECHNICAL_ARCHITECTURE.md`: current and target architecture.
- `docs/04_MVP_ROADMAP.md`: MVP roadmap and sequencing.
- `docs/05_IMPLEMENTATION_STATUS.md`: implemented, partial, and blocked areas.
- `docs/06_SECURITY_AND_GOVERNANCE.md`: security posture, AI controls, audit, and governance minimums.
- `docs/07_AVALA_GOVERN_FRAMEWORK.md`: Avala Govern Lite and future govern expansion.
- `docs/08_MIGRATION_FROM_KLARITYPM.md`: historical prototype name and migration constraints.
- `docs/governance/avala-product-law.md`: canonical product law for governed delivery.
- `docs/quality/readiness-gates.md`: milestone readiness gates and evidence requirements.
- `.agent/README.md`: Codex operating system for milestone execution.

## Non-Negotiables

- Deterministic scoring remains deterministic.
- AI must not decide final scores, gates, risk tiers, or recommendations.
- Browser-stored API keys and browser-side AI are not acceptable for pilot or production behavior.
- Server-side AI through Supabase Edge Functions remains the pilot and production direction.
- Avala Delivery Lite remains a governed handoff and work item surface, not a full Jira replacement.
- No unsupported compliance claims are made.
- The product should feel like a calm enterprise workbench, not a flashy AI toy.

## Golden Path

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Avala Govern Lite -> Avala Studio Handoff -> Generated Document -> Work Items -> Avala Delivery Lite Board -> Avala Monitor Dashboard.

## Build Control Pack

M0.2 establishes the internal build control pack: root agent instructions, `.agent` operating rules and skills, architecture boundaries, governance models, readiness gates, ADRs, planning docs, demo scripts, and final evidence review. These controls guide future milestones but do not change product behavior by themselves.
