# AvalaOS Agent Control Inventory

This inventory was created before editing existing `.agent` content for M0.2.

Canonical files are the new M0.2 operating rules, workflow templates, and Avala skill files. Existing files are supplemental only after they are updated to avoid conflicts with `docs/00_SOURCE_OF_TRUTH.md`.

| Path | Purpose | Decision | Status |
| --- | --- | --- | --- |
| `.agent/rules/01-rules-engine-decides-ai-narrates.md` | Protect deterministic logic from AI narrative drift. | Keep as supplemental. | Compatible. |
| `.agent/rules/02-no-formula-change-without-versioning.md` | Require versioning and regression checks for formula changes. | Keep as supplemental. | Compatible. |
| `.agent/rules/03-one-module-at-a-time.md` | Prevent scope creep across modules. | Keep as supplemental. | Compatible. |
| `.agent/rules/04-no-hidden-logic.md` | Require explainable recommendations and visible logic. | Keep as supplemental. | Compatible. |
| `.agent/rules/05-free-trial-gating-must-persist.md` | Preserve existing trial gating controls. | Keep as supplemental. | Compatible when product scope applies. |
| `.agent/rules/06-handoff-integrity-required.md` | Preserve handoff lineage from assessment to delivery. | Keep as supplemental. | Compatible. |
| `.agent/rules/core-lockdown.md.txt` | Legacy file protection guidance. | Keep as supplemental after updating references to AvalaOS source of truth. | Updated. |
| `.agent/workflows/build-module-from-spec.md` | Legacy module build workflow. | Keep as supplemental after updating naming and docs-only scope guard. | Updated. |
| `.agent/workflows/pre-release-quality-gate.md` | Legacy release gate workflow. | Keep as supplemental after cleanup. | Updated. |
| `.agent/workflows/promote-assessment-to-delivery.md` | Legacy governed handoff workflow. | Keep as supplemental. | Compatible. |
| `.agent/workflows/promote-assessment-to-docs.md` | Legacy docs handoff workflow. | Keep as supplemental. | Compatible. |
| `.agent/workflows/validate-scoring-change.md` | Legacy scoring-change validation workflow. | Keep as supplemental. | Compatible. |
| `.agent/skills/acceptance-criteria-enforcer/SKILLS.MD` | Legacy acceptance criteria review skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/assessment-form-architect/SKILLS.MD` | Legacy Assess form design skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/delivery-conversion-planner/SKILLS.MD` | Legacy delivery conversion planning skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/deterministic-scoring-guardian/SKILLS.MD` | Legacy deterministic scoring review skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/docs-seeding-generator/SKILLS.MD` | Legacy document seeding skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/executive-output-polisher/SKILLS.MD` | Legacy executive output polishing skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/module-spec-orchestrator/SKILLS.md` | Legacy module scope planning skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/process-template-pack-builder/SKILLS.MD` | Legacy template pack skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/recommendation-engine-enforcer/SKILLS.MD` | Legacy recommendation review skill. | Keep as supplemental after naming update. | Updated. |
| `.agent/skills/release-readiness-reviewer/SKILLS.MD` | Legacy release readiness review skill. | Keep as supplemental after naming update. | Updated. |

## Canonical M0.2 Additions

| Path | Purpose | Decision | Status |
| --- | --- | --- | --- |
| `.agent/README.md` | Entry point for the agent operating system. | Add as canonical. | Added. |
| `.agent/operating-rules.md` | Canonical operating rules for Codex work. | Add as canonical. | Added. |
| `.agent/workflows/milestone-execution-template.md` | Milestone execution template. | Add as canonical. | Added. |
| `.agent/workflows/final-evidence-review-template.md` | Final evidence review template. | Add as canonical. | Added. |
| `.agent/workflows/post-merge-verification-template.md` | Post-merge verification template. | Add as canonical. | Added. |
| `.agent/skills/avala-product-strategy/SKILL.md` | Product strategy guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-assess-scoring/SKILL.md` | Deterministic scoring boundary guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-studio-docs/SKILL.md` | Governed documentation guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-govern-ags/SKILL.md` | Govern and AGS control guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-security-byok/SKILL.md` | Security and BYOK boundary guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-ui-enterprise/SKILL.md` | Enterprise UI guardrail. | Add as canonical. | Added. |
| `.agent/skills/avala-quality-verification/SKILL.md` | Verification and evidence guardrail. | Add as canonical. | Added. |
