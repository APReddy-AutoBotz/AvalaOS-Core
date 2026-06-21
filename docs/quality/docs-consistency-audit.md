# Docs Consistency Audit

## Metadata

- Date: 2026-06-21
- Scope: documentation and configuration review only.
- Edited file in this milestone: `docs/quality/docs-consistency-audit.md` only.
- Source authority: `docs/00_SOURCE_OF_TRUTH.md` wins on product, architecture, governance, roadmap, and migration conflicts.
- Non-scope confirmed: no product behavior, UI behavior, scoring behavior, schema, migrations, Supabase functions, package dependencies, runtime AI behavior, or Health implementation changes.
- Inventory coverage: 342 Markdown files under `docs/` and `.agent/`, including this audit file.

## Severity Rubric

| Severity | Definition |
| --- | --- |
| P0 | A contradiction or stale instruction could directly authorize forbidden behavior, unsupported compliance claims, scoring drift, browser-side secrets for pilot/production, or runtime agent execution outside an approved milestone. |
| P1 | A canonical doc, CI gate, milestone sequence, or operating rule conflict could mislead near-term implementation or release decisions. |
| P2 | Historical, archival, wording, navigation, or terminology drift that should be cleaned up but does not by itself authorize unsafe product behavior. |

## Summary Findings

### P0

No P0 finding was confirmed in this docs-only audit. The strongest control language still appears in `docs/00_SOURCE_OF_TRUTH.md`, `AGENTS.md`, `.agent/operating-rules.md`, `docs/06_SECURITY_AND_GOVERNANCE.md`, and `docs/quality/no-go-list.md`.

### P1

| ID | Finding | Evidence | Proposed later fix |
| --- | --- | --- | --- |
| P1-01 | Source-of-truth and roadmap drift: root roadmap/status docs still describe early MVP sequencing while later M4.5/M5 enterprise-readiness records exist. | `docs/04_MVP_ROADMAP.md`, `docs/05_IMPLEMENTATION_STATUS.md`, `docs/planning/milestone-roadmap.md`, M5 evidence under `docs/quality/`. | Refresh canonical roadmap/status docs to separate historical MVP milestones from current enterprise-readiness sequence. |
| P1-02 | Task ledger is stale: M1-M5 remain `Planned` with `TBD` evidence even though many M1-M5 evidence and post-merge records exist. | `docs/task-ledger.md` rows M1-M5; many matching evidence files under `docs/quality/`. | Replace coarse M1-M5 ledger rows with accepted evidence links, current status, and explicit next pending milestone. |
| P1-03 | CI branding still uses old product name. | `.github/workflows/ci.yml` line 1: `name: KlarityPM CI`. | Rename workflow to `AvalaOS Core CI` in a CI hardening milestone. |
| P1-04 | CI gate is narrower than package and quality documentation. | CI runs `npm run typecheck`, `npm run test:requirements`, and `npm run build`; `package.json` has a broad aggregate `npm run test`; `docs/quality/verification-command-matrix.md` requires full test and audit. | Decide whether main CI should run full `npm run test`, audit, AI-boundary static scan, and secret-hygiene scan. |
| P1-05 | M5.3 sequencing record is stale after later M5.2 evidence. | `docs/quality/m5.3-rls-policy-design-test-plan-post-merge-verification.md` recommends M5.2a next; M5.2a and later M5.2 evidence now exist. | Add a supersession note to M5.3 evidence or central roadmap, preserving original historical record. |
| P1-06 | M5.2g has planning evidence but no matching post-merge verification file in the current inventory. | `docs/quality/m5.2g-delivery-work-item-ownership-migration-planning-evidence.md` exists; no `m5.2g-...post-merge-verification.md` was found. | If M5.2g was merged, create its post-merge evidence; if not, mark it explicitly as pending AP/merge. |

### P2

| ID | Finding | Evidence | Proposed later fix |
| --- | --- | --- | --- |
| P2-01 | Allowed historical naming is scattered across migration, Health separation, no-go, and evidence-command contexts. | `docs/08_MIGRATION_FROM_KLARITYPM.md`, `AGENTS.md`, many quality evidence wording-scan records. | Maintain a controlled wording allowlist and document which hits are allowed historical/control references. |
| P2-02 | `Lite` naming is mostly consistent but lacks a single glossary/boundary note that distinguishes Avala Govern Lite and Avala Delivery Lite from future expanded Govern/Delivery surfaces. | `docs/01_PRODUCT_STRATEGY.md`, `docs/07_AVALA_GOVERN_FRAMEWORK.md`, delivery planning docs. | Add a short module glossary to source-of-truth or product requirements in a docs refresh. |
| P2-03 | Historical planning and evidence docs are mixed with current planning docs in the same folders, making authority hard to scan. | Large `docs/planning/` and `docs/quality/` milestone archives. | Add an enterprise docs index and archive policy; do not move files until a separate docs-structure milestone. |
| P2-04 | Agent operating system has canonical Avala skills plus supplemental legacy rules/skills; the split is documented but not easy to navigate. | `.agent/inventory.md`, `.agent/README.md`, `.agent/skills/**`. | Merge durable legacy guidance into canonical `.agent/skills/avala-*` files and archive legacy-only files later. |
| P2-05 | Quality evidence records often contain command transcripts and historical recommendations that can look current unless treated as immutable records. | `docs/quality/**evidence.md`, `docs/quality/**post-merge-verification.md`. | Add a standard banner: historical evidence is immutable and superseded only by newer canonical docs or later evidence. |

## Source-Of-Truth Drift Detail

| Area | Current state | Drift | Later proposed fix |
| --- | --- | --- | --- |
| Canonical source list | `docs/00_SOURCE_OF_TRUTH.md` lists root product docs, governance law, readiness gates, and `.agent/README.md`. | It does not point readers to the current enterprise-readiness M5 index, verification matrix, or this audit. | Add a current docs index or source-of-truth appendix after AP approval. |
| MVP roadmap | `docs/04_MVP_ROADMAP.md` has Phase 1-4 MVP framing. | Later M4.5 and M5 enterprise-readiness tracks are more granular and are not reflected. | Update roadmap to distinguish historical MVP phase view from active enterprise-readiness work. |
| Implementation status | `docs/05_IMPLEMENTATION_STATUS.md` says Supabase-backed production path and server-side AI remain partial. | Later M3/M5 evidence adds provider governance, static scans, environment hygiene, tenant authority, and RLS planning details. | Refresh with current evidence-backed status and open risks, without claiming pilot or production readiness. |
| Task ledger | `docs/task-ledger.md` has M1-M5 planned/TBD. | Evidence and post-merge records exist for many M1-M5 slices. | Replace planned/TBD rows with detailed milestone rows or link to an evidence index. |
| Readiness gates | `docs/quality/readiness-gates.md` has Gate 6 Health proof pack and Gate 7 pilot readiness. | M5 enterprise-readiness track now includes M5.0-M5.6 planning and M5.2 sub-slices. | Add a sub-gate table for M5 enterprise readiness and keep Health as separate proof vertical. |
| Agent OS | `.agent/README.md` and `.agent/inventory.md` define canonical and supplemental files. | Supplemental files remain intermingled with canonical skills. | Add stronger navigation and merge/archive decisions for legacy material. |

## CI Versus Package Quality Gates

| Gate | Package or docs source | Current CI coverage | Gap | Severity | Later proposed fix |
| --- | --- | --- | --- | --- | --- |
| Typecheck | `package.json` `typecheck`; verification matrix | Runs in main CI job. | None. | - | Keep. |
| Full regression/policy test | `package.json` `test`; verification matrix | CI runs only `npm run test:requirements`. | Full aggregate suite is not run in CI. | P1 | Replace or supplement scoring-only step with `npm run test` after timing review. |
| Scoring regression | `test:requirements` / `test:scoring` | Runs in CI. | Covered, but only one part of aggregate quality. | - | Keep as named scoring step if full test is also run. |
| Production build | `package.json` `build`; verification matrix | Runs in main CI job. | None. | - | Keep. |
| Dependency audit | README and verification matrix require `npm audit --audit-level=moderate`. | Not in CI. | Audit gate is local-only. | P1 | Add CI audit step or document why audit remains manual. |
| Static AI-boundary scan | `test:ai-boundary-static` | Not in CI and not in aggregate `npm run test`. | Boundary scan can be skipped by normal CI. | P1 | Add to CI or aggregate test after AP decision. |
| Secret hygiene scan | `test:secret-hygiene`; M5.1 says CI integration deferred. | Not in CI and not in aggregate `npm run test`. | Intentional deferred gap, but should be re-decided. | P1 | Make CI adoption an explicit AP decision in CI hardening milestone. |
| Supabase delivery smoke | `test:supabase:delivery` | Optional job behind `RUN_SUPABASE_SMOKE`. | Good conditional pattern; not a default gate. | P2 | Keep optional until environment ownership is approved. |
| Whitespace diff check | Requested verification command. | Not in CI. | Local-only check. | P2 | Consider adding `git diff --check` or equivalent in CI. |
| Wording scan | Verification matrix names wording scan. | No package script and not in CI. | Manual scan only. | P2 | Add a documented scan command before automating. |

## M5, M5.2, And M5.3 Sequencing Conflicts

| Conflict | Evidence | Current risk | Later proposed resolution |
| --- | --- | --- | --- |
| M5 meaning split | Early roadmap describes M5 as Health proof pack; later M4.5 gate defines M5 enterprise readiness. | Readers can interpret M5 as two different tracks. | Treat Health as a separate proof vertical and reserve M5.x for enterprise readiness, or rename one track in docs. |
| M5.3 recommends M5.2a next | M5.3 evidence and post-merge verification recommend M5.2a. | M5.2a and later M5.2 slices now exist, making the recommendation stale. | Add a supersession note in central roadmap/status docs; avoid rewriting historical evidence unless policy allows annotation. |
| M5.2g next step differs from old M5.3 recommendation | M5.2g evidence recommends M5.2g-a; M5.3 says M5.2a then M5.3a. | Next safe milestone is ambiguous. | Current safest sequence: close/verify M5.2g status, then M5.2g-a only after AP approval, then decide if M5.3a is sufficiently unblocked. |
| RLS readiness can be overstated | M5.2a enables RLS with no policies; M5.3 is design/test planning only. | Docs could imply tenant isolation proof exists when it does not. | Keep explicit language: fail-closed readiness is not tenant-isolation proof; M5.3a or later must implement and test policies. |

## Missing Post-Merge Evidence Findings

| Finding | Evidence | Later proposed fix |
| --- | --- | --- |
| M5.2g planning evidence has no matching post-merge verification in current inventory. | `docs/quality/m5.2g-delivery-work-item-ownership-migration-planning-evidence.md` exists; no same-slug post-merge file exists. | Add post-merge verification if merged; otherwise mark M5.2g as pending and keep it out of accepted baseline. |
| Task ledger evidence links are incomplete. | `docs/task-ledger.md` uses `TBD` for M1-M5. | Replace `TBD` with accepted evidence links or split rows into sub-milestones. |
| Historical final-evidence docs sometimes say merge pending even post-merge docs exist. | Examples include early M0.2/M1/M2 final evidence records. | Preserve as historical records, but add an evidence index that points to final accepted post-merge records. |

## Recommended Enterprise Documentation Structure

This audit does not move files. The structure below is the proposed later target.

| Future section | Purpose | Current docs to keep/update/merge/archive into it |
| --- | --- | --- |
| Canonical source-of-truth | Product law, strategy, requirements, architecture, status, roadmap, security, module framework. | Keep/update root `docs/00_*.md` through `docs/08_*.md`, `docs/task-ledger.md`. |
| Architecture reference | Durable boundaries, data/evidence/AI/control models, current enterprise maps. | Keep cross-cutting `docs/architecture/*.md`; archive old milestone maps. |
| Governance and security reference | Product law, HITL, evidence, risk, compliance claim boundary, RLS/security gates. | Keep `docs/governance/**` and active `docs/security/**`. |
| Planning current | Approved active milestone plans and next safe sequence. | Keep/update current M5 plans; archive completed M0-M4 and superseded M3 plans. |
| Quality gates | Standing readiness, no-go, verification matrix, architecture scorecard, current audits. | Keep/update `docs/quality/readiness-gates.md`, `verification-command-matrix.md`, `no-go-list.md`, `architecture-scorecard.md`, this audit. |
| Evidence archive | Immutable milestone evidence and post-merge verification. | Archive historical `docs/quality/*evidence.md` and `*post-merge-verification.md`; index accepted records. |
| Demo and review archive | Buyer demo scripts, review packs, external critique records. | Keep current demo narratives; archive milestone runbooks/checklists and review packs. |
| Agent operating system | Codex operating rules, canonical skills, reusable templates, legacy archive. | Keep `.agent/README.md`, `.agent/operating-rules.md`, `.agent/skills/avala-*`; merge/archive legacy supplemental files. |

## Exact Proposed Fixes For Later Milestone

1. Update `docs/00_SOURCE_OF_TRUTH.md` to add a current documentation map and clarify that historical evidence records are superseded by later canonical status docs.
2. Update `docs/04_MVP_ROADMAP.md` and `docs/planning/milestone-roadmap.md` to separate MVP history from the current M5 enterprise-readiness sequence.
3. Update `docs/05_IMPLEMENTATION_STATUS.md` with current M3/M4/M5 evidence-backed status, preserving caveats that hosted pilot readiness and tenant isolation proof are not complete.
4. Update `docs/task-ledger.md` with actual evidence links for M1-M5 sub-milestones, remove stale `TBD` where evidence exists, and mark M5.2g status explicitly.
5. Add or update an evidence index under `docs/quality/` that points to accepted final/post-merge records and marks historical records immutable.
6. Add a supersession note in a central roadmap/status doc for M5.3 sequencing: M5.2a has occurred; current next step depends on M5.2g acceptance and AP approval for M5.2g-a or M5.3a.
7. Add the missing M5.2g post-merge verification if M5.2g was merged; otherwise document it as pending.
8. In a CI hardening milestone, rename `.github/workflows/ci.yml` from `KlarityPM CI` to `AvalaOS Core CI`.
9. In that same CI milestone, decide whether to run full `npm run test`, `npm audit --audit-level=moderate`, `npm run test:ai-boundary-static`, and `npm run test:secret-hygiene` in CI.
10. Add a concise glossary note for Avala Govern Lite and Avala Delivery Lite so `Lite` names are read as intentional scoped surfaces, not stale MVP naming.
11. Merge durable supplemental `.agent/rules/**`, `.agent/workflows/**`, and legacy `.agent/skills/**` guidance into canonical Avala skills or archive it as historical operating-system material.
12. Keep Health proof documents separate from core platform docs and do not modify Health implementation unless AP explicitly approves Health work.

## Complete Markdown Inventory

| Path | Area | Current title | Decision | Rationale |
| --- | --- | --- | --- | --- |
| `.agent/inventory.md` | Agent control | AvalaOS Agent Control Inventory | Update | Useful control inventory, but should mark legacy/supplemental files against current source-of-truth state. |
| `.agent/operating-rules.md` | Agent control | AvalaOS Operating Rules | Keep | Canonical Codex operating-system entrypoint and rules. |
| `.agent/README.md` | Agent control | AvalaOS Agent Operating System | Keep | Canonical Codex operating-system entrypoint and rules. |
| `.agent/rules/01-rules-engine-decides-ai-narrates.md` | Agent supplemental rule | Rules Engine Decides, AI Narrates | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/rules/02-no-formula-change-without-versioning.md` | Agent supplemental rule | No Formula Change Without Versioning | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/rules/03-one-module-at-a-time.md` | Agent supplemental rule | One Module at a Time | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/rules/04-no-hidden-logic.md` | Agent supplemental rule | No Hidden Logic | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/rules/05-free-trial-gating-must-persist.md` | Agent supplemental rule | Free Trial Gating Must Persist | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/rules/06-handoff-integrity-required.md` | Agent supplemental rule | Handoff Integrity Required | Merge | Supplemental rule; keep concept but merge into operating rules or canonical skills where still current. |
| `.agent/skills/acceptance-criteria-enforcer/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/assessment-form-architect/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/avala-assess-scoring/SKILL.md` | Agent canonical skill | Avala Assess Scoring | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-govern-ags/SKILL.md` | Agent canonical skill | Avala Govern AGS | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-product-strategy/SKILL.md` | Agent canonical skill | Avala Product Strategy | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-quality-verification/SKILL.md` | Agent canonical skill | Avala Quality Verification | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-security-byok/SKILL.md` | Agent canonical skill | Avala Security BYOK | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-studio-docs/SKILL.md` | Agent canonical skill | Avala Studio Docs | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/avala-ui-enterprise/SKILL.md` | Agent canonical skill | Avala UI Enterprise | Keep | Canonical Avala agent skill guardrail. |
| `.agent/skills/delivery-conversion-planner/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/deterministic-scoring-guardian/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/docs-seeding-generator/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/executive-output-polisher/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/module-spec-orchestrator/SKILLS.md` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/process-template-pack-builder/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/recommendation-engine-enforcer/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/skills/release-readiness-reviewer/SKILLS.MD` | Agent supplemental skill | (no H1 found) | Merge | Supplemental legacy skill; fold durable guidance into canonical Avala skills or archive. |
| `.agent/workflows/build-module-from-spec.md` | Agent workflow | Build Module From Spec | Merge | Supplemental legacy workflow; merge current controls into canonical templates or archive. |
| `.agent/workflows/final-evidence-review-template.md` | Agent workflow | Final Evidence Review Template | Keep | Canonical reusable workflow template. |
| `.agent/workflows/milestone-execution-template.md` | Agent workflow | Milestone Execution Template | Keep | Canonical reusable workflow template. |
| `.agent/workflows/post-merge-verification-template.md` | Agent workflow | Post-Merge Verification Template | Keep | Canonical reusable workflow template. |
| `.agent/workflows/pre-release-quality-gate.md` | Agent workflow | Pre-Release Quality Gate | Merge | Supplemental legacy workflow; merge current controls into canonical templates or archive. |
| `.agent/workflows/promote-assessment-to-delivery.md` | Agent workflow | Promote Assessment To Delivery | Merge | Supplemental legacy workflow; merge current controls into canonical templates or archive. |
| `.agent/workflows/promote-assessment-to-docs.md` | Agent workflow | Promote Assessment To Docs | Merge | Supplemental legacy workflow; merge current controls into canonical templates or archive. |
| `.agent/workflows/validate-scoring-change.md` | Agent workflow | Validate Scoring Change | Merge | Supplemental legacy workflow; merge current controls into canonical templates or archive. |
| `docs/00_SOURCE_OF_TRUTH.md` | Canonical root | AvalaOS Core Source Of Truth | Update | Canonical authority, but should reference current enterprise-readiness track and docs index after this audit. |
| `docs/01_PRODUCT_STRATEGY.md` | Canonical root | AvalaOS Core Product Strategy | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/02_PRODUCT_REQUIREMENTS.md` | Canonical root | AvalaOS Core Product Requirements | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/03_TECHNICAL_ARCHITECTURE.md` | Canonical root | AvalaOS Core Technical Architecture | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/04_MVP_ROADMAP.md` | Canonical root | AvalaOS Core MVP Roadmap | Update | Roadmap is older than M4.5/M5 enterprise-readiness track and should be reconciled. |
| `docs/05_IMPLEMENTATION_STATUS.md` | Canonical root | AvalaOS Core Implementation Status | Update | Status is slice-oriented and should reflect later M3/M4/M5 evidence. |
| `docs/06_SECURITY_AND_GOVERNANCE.md` | Canonical root | AvalaOS Core Security And Governance | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/07_AVALA_GOVERN_FRAMEWORK.md` | Canonical root | Avala Govern Framework | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/08_MIGRATION_FROM_KLARITYPM.md` | Canonical root | Migration From KlarityPM | Keep | Canonical root document; keep, with only narrow drift notes where later milestones require clarification. |
| `docs/adr/0001-avalaos-product-law.md` | ADR | ADR 0001: AvalaOS Product Law | Keep | Architectural decision record; keep immutable unless superseded by a new ADR. |
| `docs/adr/0002-deterministic-scoring-boundary.md` | ADR | ADR 0002: Deterministic Scoring Boundary | Keep | Architectural decision record; keep immutable unless superseded by a new ADR. |
| `docs/adr/0003-avala-govern-as-control-layer.md` | ADR | ADR 0003: Avala Govern As Control Layer | Keep | Architectural decision record; keep immutable unless superseded by a new ADR. |
| `docs/adr/0004-server-side-ai-and-byok-boundary.md` | ADR | ADR 0004: Server-Side AI And BYOK Boundary | Keep | Architectural decision record; keep immutable unless superseded by a new ADR. |
| `docs/adr/0005-health-as-proof-vertical-not-core-platform.md` | ADR | ADR 0005: Health As Proof Vertical Not Core Platform | Keep | Architectural decision record; keep immutable unless superseded by a new ADR. |
| `docs/architecture/ai-boundary-model.md` | Architecture | AI Boundary Model | Keep | Cross-cutting architecture boundary/model. |
| `docs/architecture/data-boundary-model.md` | Architecture | Data Boundary Model | Keep | Cross-cutting architecture boundary/model. |
| `docs/architecture/evidence-architecture.md` | Architecture | Evidence Architecture | Keep | Cross-cutting architecture boundary/model. |
| `docs/architecture/integration-boundary.md` | Architecture | Integration Boundary | Keep | Cross-cutting architecture boundary/model. |
| `docs/architecture/m4.0a-codebase-module-inventory.md` | Architecture | M4.0a Codebase Module Inventory | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m4.0a-logic-data-flow-map.md` | Architecture | M4.0a Logic And Data Flow Map | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m4.1-critical-fix-dependency-map.md` | Architecture | M4.1 Critical Fix Dependency Map | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m4.1d-route-rbac-guard-matrix.md` | Architecture | M4.1d Central View/RBAC Guard Matrix | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m4.2-ui-screen-flow-map.md` | Architecture | M4.2 UI Screen Flow Map | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m4.2b-canonical-demo-data-map.md` | Architecture | M4.2b Canonical Demo Data Map | Archive | Historical milestone architecture map; preserve as evidence, not current authority. |
| `docs/architecture/m5.0-supabase-persistence-rls-audit-architecture-map.md` | Architecture | M5.0 Supabase Persistence, RLS, And Audit Architecture Map | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.1-environment-config-boundary-map.md` | Architecture | M5.1 Environment Config Boundary Map | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.2-auth-organization-workspace-entity-model.md` | Architecture | M5.2 Auth, Organization, And Workspace Entity Model | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.2b-artifact-ownership-domain-inventory.md` | Architecture | M5.2b Artifact Ownership Domain Inventory | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.2d-studio-docs-schema-inventory.md` | Architecture | M5.2d Studio Docs Schema Inventory | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.2e-delivery-schema-inventory.md` | Architecture | M5.2e Delivery Schema Inventory | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.2g-delivery-work-item-schema-inventory.md` | Architecture | M5.2g Delivery Work Item Schema Inventory | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/m5.3-tenant-isolation-test-map.md` | Architecture | M5.3 Tenant Isolation Test Map | Keep | Current enterprise-readiness architecture map. |
| `docs/architecture/module-boundary-matrix.md` | Architecture | Module Boundary Matrix | Keep | Cross-cutting architecture boundary/model. |
| `docs/architecture/side-effect-control-model.md` | Architecture | Side-Effect Control Model | Keep | Cross-cutting architecture boundary/model. |
| `docs/demo/avala-health-proof-story.md` | Demo | Avala Health Proof Story | Update | Useful demo narrative; update only if source-of-truth and M5 readiness language changes. |
| `docs/demo/m2.1-demo-polish-findings.md` | Demo | M2.1 Demo Polish Findings | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.2d-buyer-demo-golden-path-validation-runbook.md` | Demo | M4.2d Buyer-Demo Golden Path Validation Runbook | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.2g-buyer-demo-smoke-test-ui-readiness-checklist.md` | Demo | M4.2g Buyer-Demo Smoke Test And UI Readiness Checklist | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.3-buyer-demo-release-candidate-runbook.md` | Demo | M4.3 Buyer-Demo Release Candidate Runbook | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.4b-buyer-demo-visual-rehearsal-checklist.md` | Demo | M4.4b Buyer-Demo Visual Rehearsal Checklist | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.4d-buyer-demo-visual-rehearsal-recheck-checklist.md` | Demo | M4.4d Buyer-Demo Visual Rehearsal Recheck Checklist | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/m4.5-buyer-demo-rc-closure.md` | Demo | M4.5 Buyer-Demo RC Closure | Archive | Milestone demo checklist/runbook; historical evidence after acceptance. |
| `docs/demo/primary-demo-story.md` | Demo | Primary Demo Story | Update | Useful demo narrative; update only if source-of-truth and M5 readiness language changes. |
| `docs/demo/wow-demo-script.md` | Demo | Wow Demo Script | Update | Useful demo narrative; update only if source-of-truth and M5 readiness language changes. |
| `docs/governance/agent-autonomy-levels.md` | Governance | Agent Autonomy Levels | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/agent-registry-model.md` | Governance | Agent Registry Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/agent-risk-model.md` | Governance | Agent Risk Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/audit-event-model.md` | Governance | Audit Event Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/avala-product-law.md` | Governance | Avala Product Law | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/compliance-claim-boundary.md` | Governance | Compliance Claim Boundary | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/evidence-requirements-model.md` | Governance | Evidence Requirements Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/hitl-policy-model.md` | Governance | Human-In-The-Loop Policy Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/governance/incident-and-kill-switch-model.md` | Governance | Incident And Kill Switch Model | Keep | Governance/control model; keep as enterprise reference. |
| `docs/planning/m0.2-build-control-pack-plan.md` | Planning | M0.2 Build Control Pack Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m1-avala-govern-lite-hardening-implementation-plan.md` | Planning | M1 Avala Govern Lite Hardening Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m1-avala-govern-lite-hardening-plan.md` | Planning | M1 Avala Govern Lite Hardening Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m2-governed-delivery-pack-implementation-plan.md` | Planning | M2 Governed Delivery Pack Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m2-governed-delivery-pack-plan.md` | Planning | M2 Governed Delivery Pack Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m2.1-visual-demo-smoke-plan.md` | Planning | M2.1 Visual Demo Smoke & Narrative Polish Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m2.2-demo-readiness-polish-plan.md` | Planning | M2.2 Demo Readiness Polish Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3-server-side-ai-byok-hardening-implementation-plan.md` | Planning | M3 Server-Side AI / BYOK Hardening Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3-server-side-ai-byok-hardening-plan.md` | Planning | M3 Server-Side AI BYOK Hardening Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3-slice-roadmap.md` | Planning | M3 Slice Roadmap | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.1-browser-ai-boundary-lockdown-implementation-plan.md` | Planning | M3.1 Browser AI Boundary Lockdown Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.1a-mode-contract-fail-closed-orchestrator-plan.md` | Planning | M3.1a Mode Contract + Fail-Closed Orchestrator Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.1b-browser-key-provider-isolation-plan.md` | Planning | M3.1b Browser Key / Provider Prop Isolation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.1c-static-ai-boundary-scan-automation-plan.md` | Planning | M3.1c Static AI Boundary Scan Automation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2-edge-provider-config-key-reference-plan.md` | Planning | M3.2 Edge Provider Config / Key-Reference Planning | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2a-provider-config-key-reference-contract-plan.md` | Planning | M3.2a Provider Config / Key-Reference Contract Planning | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2aa-deployed-blocked-smoke-final-execution.md` | Planning | M3.2aa Deployed Blocked-Smoke Final Execution | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2ab-provider-governance-deployment-closure-pack.md` | Planning | M3.2ab Provider Governance Deployment Closure Pack | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2b-provider-config-schema-rls-proposal.md` | Planning | M3.2b Provider Config Schema/RLS Proposal | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2c-edge-resolver-contract-plan.md` | Planning | M3.2c Edge Resolver Contract Planning | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2d-provider-audit-evidence-contract-plan.md` | Planning | M3.2d Provider Audit/Evidence Event Contract Planning | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2e-provider-config-implementation-readiness-gate.md` | Planning | M3.2e Provider Config Implementation Readiness Gate | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2f-provider-config-ap-decision-pack.md` | Planning | M3.2f Provider Config AP Decision Pack | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2g-provider-config-schema-rls-authorization-plan.md` | Planning | M3.2g Provider Config Schema/RLS Authorization Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2h-provider-config-schema-rls-migration.md` | Planning | M3.2h Provider Config Schema/RLS Migration | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2i-provider-config-rls-evidence-resolver-readiness.md` | Planning | M3.2i Provider Config RLS Evidence And Resolver Readiness Review | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2j-server-side-provider-resolver-contract-planning.md` | Planning | M3.2j Server-Side Provider Resolver Contract Planning | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2k-server-side-provider-resolver-implementation-plan.md` | Planning | M3.2k Server-Side Provider Resolver Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2l-provider-resolver-decision-logic.md` | Planning | M3.2l Provider Resolver Decision Logic | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2m-resolver-edge-function-integration-plan.md` | Planning | M3.2m Resolver Edge Function Integration Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2n-dbval-provider-governance-bootstrap-validation.md` | Planning | M3.2n-dbval Provider Governance Bootstrap And DB Validation | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2n-readiness-non-production-db-validation.md` | Planning | M3.2n-readiness Non-Production Database Validation | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2n-resolver-edge-function-integration-implementation.md` | Planning | M3.2n Resolver Edge Function Integration Implementation | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2o-non-production-resolver-edge-smoke-plan.md` | Planning | M3.2o Non-Production Resolver Edge Smoke Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2p-non-production-resolver-edge-smoke-mocked.md` | Planning | M3.2p Non-Production Resolver Edge Smoke Mocked | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2q-non-production-deployed-edge-smoke-plan.md` | Planning | M3.2q Non-Production Deployed Edge Smoke Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2r-non-production-deployed-edge-smoke-mocked-first.md` | Planning | M3.2r Non-Production Deployed Edge Smoke Mocked First | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2s-non-production-edge-invocation-readiness.md` | Planning | M3.2s Non-Production Edge Invocation Readiness | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2t-non-production-deployed-blocked-smoke.md` | Planning | M3.2t Non-Production Deployed Blocked-Smoke Execution | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2u-supabase-cli-deployment-readiness.md` | Planning | M3.2u Supabase CLI Deployment Readiness | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2v-auth-cli-auth-db-connectivity-readiness.md` | Planning | M3.2v-auth Supabase CLI Auth And DB Connectivity Readiness | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2v-dbfix-non-production-db-connectivity-restoration.md` | Planning | M3.2v-dbfix Non-Production DB Connectivity Restoration Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2w-non-production-deployed-blocked-smoke-retry.md` | Planning | M3.2w Non-Production Deployed Blocked-Smoke Retry | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2x-edge-deployment-bundle-readiness-repair.md` | Planning | M3.2x Edge Deployment Bundle Readiness Repair | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m3.2y-deployed-blocked-smoke-after-bundle-repair.md` | Planning | M3.2y Deployed Blocked-Smoke After Bundle Repair Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4-demo-polish-plan.md` | Planning | M4 Demo Polish Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.0a-full-repo-inventory-logic-map.md` | Planning | M4.0a Full Repository Inventory And Logic Map | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1-critical-enterprise-readiness-fix-plan.md` | Planning | M4.1 Critical Enterprise Readiness Fix Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1a-decision-pack-contract-rendering-fix.md` | Planning | M4.1a Decision Pack Contract And Rendering Fix | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1b-assess-to-studio-full-handoff-payload-fix.md` | Planning | M4.1b Assess-to-Studio Full Handoff Payload Fix | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1c-docs-to-delivery-lineage-evidence-refs-fix.md` | Planning | M4.1c Docs-to-Delivery Lineage / Evidence Refs Fix | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1d-1-central-view-rbac-guard-helper-tests.md` | Planning | M4.1d-1 Central View/RBAC Guard Helper And Tests | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1d-2-app-central-guard-integration.md` | Planning | M4.1d-2 App.tsx Central Guard Integration | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1d-3-sidebar-modulejourney-guard-metadata-alignment.md` | Planning | M4.1d-3 Sidebar And ModuleJourney Guard Metadata Alignment | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1d-4-persisted-view-scope-cleanup-safe-fallback.md` | Planning | M4.1d-4 Persisted View/Scope Cleanup And Safe Fallback | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.1d-route-rbac-guard-design-implementation-plan.md` | Planning | M4.1d Central View/RBAC Guard Design And Implementation Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.2-ui-reality-check-golden-path-screen-audit.md` | Planning | M4.2 UI Reality Check And Golden Path Screen Audit | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.2a-buyer-demo-ui-copy-empty-state-fix-pass.md` | Planning | M4.2a Buyer-Demo UI Copy And Empty-State Fix Pass | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m4.2b-canonical-golden-path-demo-data-plan.md` | Planning | M4.2b Canonical Golden Path Demo Data Plan | Archive | Historical milestone plan; preserve as evidence and remove from current roadmap authority. |
| `docs/planning/m5-avala-health-proof-pack-plan.md` | Planning | M5 Avala Health Proof Pack Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5-enterprise-readiness-planning-gate.md` | Planning | M5 Enterprise Readiness Planning Gate | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.0-enterprise-supabase-readiness-plan.md` | Planning | M5.0 Enterprise Supabase Readiness Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.2-supabase-auth-organization-workspace-schema-plan.md` | Planning | M5.2 Supabase Auth / Organization / Workspace Schema Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.2b-artifact-ownership-columns-migration-plan.md` | Planning | M5.2b Artifact Ownership Columns Migration Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.2d-studio-docs-ownership-columns-migration-plan.md` | Planning | M5.2d Studio Docs Ownership Columns Migration Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.2e-delivery-ownership-columns-migration-plan.md` | Planning | M5.2e Delivery Ownership Columns Migration Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/m5.2g-delivery-work-item-ownership-migration-plan.md` | Planning | M5.2g Delivery Work Item Ownership Migration Plan | Update | Active plan; needs post-merge status/evidence clarification. |
| `docs/planning/m5.3-rls-policy-design-test-plan.md` | Planning | M5.3 RLS Policy Design And Test Plan | Keep | Current enterprise-readiness planning record; update only for supersession notes. |
| `docs/planning/milestone-roadmap.md` | Planning | Milestone Roadmap | Update | Current roadmap index conflicts with later M5 enterprise-readiness evidence. |
| `docs/quality/architecture-scorecard.md` | Quality | Architecture Scorecard | Update | Standing quality/control reference; reconcile with current CI and M5 track. |
| `docs/quality/docs-consistency-audit.md` | Quality | Docs Consistency Audit | Keep | Current audit artifact; retain as quality evidence until superseded by a later audit. |
| `docs/quality/m0.2-final-evidence-review.md` | Quality | M0.2 Final Evidence Review | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m0.2-post-merge-verification.md` | Quality | M0.2 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m1-final-evidence-review.md` | Quality | M1 Final Evidence Review | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m1-post-merge-verification.md` | Quality | M1 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2-final-evidence-review.md` | Quality | M2 Final Evidence Review | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2-post-merge-verification.md` | Quality | M2 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2.1-post-merge-verification.md` | Quality | M2.1 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2.1-visual-demo-smoke-evidence.md` | Quality | M2.1 Visual Demo Smoke Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2.2-final-evidence-review.md` | Quality | M2.2 Final Evidence Review | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m2.2-post-merge-verification.md` | Quality | M2.2 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.0-ai-boundary-planning-evidence.md` | Quality | M3.0 AI Boundary Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.0-post-merge-verification.md` | Quality | M3.0 Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1-browser-ai-boundary-lockdown-planning-evidence.md` | Quality | M3.1 Browser AI Boundary Lockdown Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1-browser-ai-boundary-lockdown-planning-post-merge-verification.md` | Quality | M3.1 Browser AI Boundary Lockdown Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1a-final-evidence-review.md` | Quality | M3.1a Final Evidence Review | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1a-post-merge-verification.md` | Quality | M3.1a Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1b-browser-key-provider-isolation-implementation-evidence.md` | Quality | M3.1b Browser Key / Provider Prop Isolation Implementation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1b-browser-key-provider-isolation-implementation-post-merge-verification.md` | Quality | M3.1b Browser Key / Provider Prop Isolation Implementation Post-merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1b-browser-key-provider-isolation-planning-evidence.md` | Quality | M3.1b Browser Key / Provider Isolation Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1b-browser-key-provider-isolation-planning-post-merge-verification.md` | Quality | M3.1b Browser Key / Provider Prop Isolation Planning Post-merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1c-static-ai-boundary-scan-automation-implementation-evidence.md` | Quality | M3.1c Static AI Boundary Scan Automation Implementation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1c-static-ai-boundary-scan-automation-implementation-post-merge-verification.md` | Quality | M3.1c Static AI Boundary Scan Automation Implementation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1c-static-ai-boundary-scan-automation-planning-evidence.md` | Quality | M3.1c Static AI Boundary Scan Automation Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.1c-static-ai-boundary-scan-automation-planning-post-merge-verification.md` | Quality | M3.1c Static AI Boundary Scan Automation Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2-edge-provider-config-key-reference-planning-evidence.md` | Quality | M3.2 Edge Provider Config / Key-Reference Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2-edge-provider-config-key-reference-planning-post-merge-verification.md` | Quality | M3.2 Edge Provider Config / Key-Reference Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2a-provider-config-key-reference-contract-planning-evidence.md` | Quality | M3.2a Provider Config / Key-Reference Contract Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2a-provider-config-key-reference-contract-planning-post-merge-verification.md` | Quality | M3.2a Provider Config / Key-Reference Contract Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2aa-deployed-blocked-smoke-final-execution-evidence.md` | Quality | M3.2aa Deployed Blocked-Smoke Final Execution Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2aa-deployed-blocked-smoke-final-execution-post-merge-verification.md` | Quality | M3.2aa Deployed Blocked-Smoke Final Execution Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2ab-provider-governance-deployment-closure-evidence.md` | Quality | M3.2ab Provider Governance Deployment Closure Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2ab-provider-governance-deployment-closure-post-merge-verification.md` | Quality | M3.2ab Provider Governance Deployment Closure Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2b-provider-config-schema-rls-proposal-evidence.md` | Quality | M3.2b Provider Config Schema/RLS Proposal Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2b-provider-config-schema-rls-proposal-post-merge-verification.md` | Quality | M3.2b Provider Config Schema/RLS Proposal Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2c-edge-resolver-contract-planning-evidence.md` | Quality | M3.2c Edge Resolver Contract Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2c-edge-resolver-contract-planning-post-merge-verification.md` | Quality | M3.2c Edge Resolver Contract Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2d-provider-audit-evidence-contract-planning-evidence.md` | Quality | M3.2d Provider Audit/Evidence Event Contract Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2d-provider-audit-evidence-contract-planning-post-merge-verification.md` | Quality | M3.2d Provider Audit/Evidence Event Contract Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2e-provider-config-implementation-readiness-evidence.md` | Quality | M3.2e Provider Config Implementation Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2e-provider-config-implementation-readiness-post-merge-verification.md` | Quality | M3.2e Provider Config Implementation Readiness Gate Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2f-provider-config-ap-decision-pack-evidence.md` | Quality | M3.2f Provider Config AP Decision Pack Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2f-provider-config-ap-decision-pack-post-merge-verification.md` | Quality | M3.2f Provider Config AP Decision Pack Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2g-provider-config-schema-rls-authorization-evidence.md` | Quality | M3.2g Provider Config Schema/RLS Authorization Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2g-provider-config-schema-rls-authorization-post-merge-verification.md` | Quality | M3.2g Provider Config Schema/RLS Authorization Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2h-provider-config-schema-rls-migration-evidence.md` | Quality | M3.2h Provider Config Schema/RLS Migration Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2h-provider-config-schema-rls-migration-post-merge-verification.md` | Quality | M3.2h Provider Config Schema/RLS Migration Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2i-provider-config-rls-evidence-resolver-readiness-evidence.md` | Quality | M3.2i Provider Config RLS Evidence And Resolver Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2i-provider-config-rls-evidence-resolver-readiness-post-merge-verification.md` | Quality | M3.2i Provider Config RLS Evidence And Resolver Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2j-server-side-provider-resolver-contract-planning-evidence.md` | Quality | M3.2j Server-Side Provider Resolver Contract Planning Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2j-server-side-provider-resolver-contract-planning-post-merge-verification.md` | Quality | M3.2j Server-Side Provider Resolver Contract Planning Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2k-server-side-provider-resolver-implementation-plan-evidence.md` | Quality | M3.2k Server-Side Provider Resolver Implementation Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2k-server-side-provider-resolver-implementation-plan-post-merge-verification.md` | Quality | M3.2k Server-Side Provider Resolver Implementation Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2l-provider-resolver-decision-logic-evidence.md` | Quality | M3.2l Provider Resolver Decision Logic Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2l-provider-resolver-decision-logic-post-merge-verification.md` | Quality | M3.2l Provider Resolver Decision Logic Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2m-resolver-edge-function-integration-plan-evidence.md` | Quality | M3.2m Resolver Edge Function Integration Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2m-resolver-edge-function-integration-plan-post-merge-verification.md` | Quality | M3.2m Resolver Edge Function Integration Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-dbval-provider-governance-bootstrap-validation-evidence.md` | Quality | M3.2n-dbval Provider Governance Bootstrap And DB Validation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-dbval-provider-governance-bootstrap-validation-post-merge-verification.md` | Quality | M3.2n-dbval Provider Governance Bootstrap And DB Validation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-readiness-non-production-db-validation-evidence.md` | Quality | M3.2n-readiness Non-Production Database Validation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-readiness-non-production-db-validation-post-merge-verification.md` | Quality | M3.2n-readiness Non-Production Database Validation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-resolver-edge-function-integration-implementation-evidence.md` | Quality | M3.2n Resolver Edge Function Integration Implementation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2n-resolver-edge-function-integration-implementation-post-merge-verification.md` | Quality | M3.2n Resolver Edge Function Integration Implementation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2o-non-production-resolver-edge-smoke-plan-evidence.md` | Quality | M3.2o Non-Production Resolver Edge Smoke Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2o-non-production-resolver-edge-smoke-plan-post-merge-verification.md` | Quality | M3.2o Non-Production Resolver Edge Smoke Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2p-non-production-resolver-edge-smoke-mocked-evidence.md` | Quality | M3.2p Non-Production Resolver Edge Smoke Mocked Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2p-non-production-resolver-edge-smoke-mocked-post-merge-verification.md` | Quality | M3.2p Non-Production Resolver Edge Smoke Mocked Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2q-non-production-deployed-edge-smoke-plan-evidence.md` | Quality | M3.2q Non-Production Deployed Edge Smoke Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2q-non-production-deployed-edge-smoke-plan-post-merge-verification.md` | Quality | M3.2q Non-Production Deployed Edge Smoke Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2r-non-production-deployed-edge-smoke-mocked-first-evidence.md` | Quality | M3.2r Non-Production Deployed Edge Smoke Mocked First Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2r-non-production-deployed-edge-smoke-mocked-first-post-merge-verification.md` | Quality | M3.2r Non-Production Deployed Edge Smoke Mocked First Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2s-non-production-edge-invocation-readiness-evidence.md` | Quality | M3.2s Non-Production Edge Invocation Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2s-non-production-edge-invocation-readiness-post-merge-verification.md` | Quality | M3.2s Non-Production Edge Invocation Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2t-non-production-deployed-blocked-smoke-evidence.md` | Quality | M3.2t Non-Production Deployed Blocked-Smoke Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2t-non-production-deployed-blocked-smoke-post-merge-verification.md` | Quality | M3.2t Non-Production Deployed Blocked-Smoke Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2u-supabase-cli-deployment-readiness-evidence.md` | Quality | M3.2u Supabase CLI Deployment Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2u-supabase-cli-deployment-readiness-post-merge-verification.md` | Quality | M3.2u Supabase CLI Deployment Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2v-auth-cli-auth-db-connectivity-readiness-evidence.md` | Quality | M3.2v-auth Supabase CLI Auth And DB Connectivity Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2v-auth-cli-auth-db-connectivity-readiness-post-merge-verification.md` | Quality | M3.2v-auth Supabase CLI Auth And DB Connectivity Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2v-dbfix-non-production-db-connectivity-restoration-evidence.md` | Quality | M3.2v-dbfix Non-Production DB Connectivity Restoration Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2v-dbfix-non-production-db-connectivity-restoration-post-merge-verification.md` | Quality | M3.2v-dbfix Non-Production DB Connectivity Restoration Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2w-non-production-deployed-blocked-smoke-retry-evidence.md` | Quality | M3.2w Non-Production Deployed Blocked-Smoke Retry Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2w-non-production-deployed-blocked-smoke-retry-post-merge-verification.md` | Quality | M3.2w Non-Production Deployed Blocked-Smoke Retry Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2x-edge-deployment-bundle-readiness-repair-evidence.md` | Quality | M3.2x Edge Deployment Bundle Readiness Repair Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2x-edge-deployment-bundle-readiness-repair-post-merge-verification.md` | Quality | M3.2x Edge Deployment Bundle Readiness Repair Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2y-deployed-blocked-smoke-after-bundle-repair-evidence.md` | Quality | M3.2y Deployed Blocked-Smoke After Bundle Repair Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2y-deployed-blocked-smoke-after-bundle-repair-post-merge-verification.md` | Quality | M3.2y Deployed Blocked-Smoke After Bundle Repair Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2z-remote-runtime-config-readiness-evidence.md` | Quality | M3.2z Remote Runtime Config Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m3.2z-remote-runtime-config-readiness-post-merge-verification.md` | Quality | M3.2z Remote Runtime Config Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.0a-full-repo-inventory-logic-map-evidence.md` | Quality | M4.0a Full Repository Inventory And Logic Map Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.0a-full-repo-inventory-logic-map-post-merge-verification.md` | Quality | M4.0a Full Repository Inventory And Logic Map Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1-critical-enterprise-readiness-fix-plan-evidence.md` | Quality | M4.1 Critical Enterprise Readiness Fix Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1-critical-enterprise-readiness-fix-plan-post-merge-verification.md` | Quality | M4.1 Critical Enterprise Readiness Fix Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1a-decision-pack-contract-rendering-fix-evidence.md` | Quality | M4.1a Decision Pack Contract And Rendering Fix Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1a-decision-pack-contract-rendering-fix-post-merge-verification.md` | Quality | M4.1a Decision Pack Contract And Rendering Fix Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1b-assess-to-studio-full-handoff-payload-fix-evidence.md` | Quality | M4.1b Assess-to-Studio Full Handoff Payload Fix Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1b-assess-to-studio-full-handoff-payload-fix-post-merge-verification.md` | Quality | M4.1b Assess-to-Studio Full Handoff Payload Fix Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1c-docs-to-delivery-lineage-evidence-refs-fix-evidence.md` | Quality | M4.1c Docs-to-Delivery Lineage / Evidence Refs Fix Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1c-docs-to-delivery-lineage-evidence-refs-fix-post-merge-verification.md` | Quality | M4.1c Docs-to-Delivery Lineage / Evidence Refs Fix Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-1-audit-gate-remediation-evidence.md` | Quality | M4.1d-1 Audit Gate Remediation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-1-audit-gate-remediation-post-merge-verification.md` | Quality | M4.1d-1 Audit Gate Remediation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-1-central-view-rbac-guard-helper-tests-evidence.md` | Quality | M4.1d-1 Central View/RBAC Guard Helper Tests Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-1-central-view-rbac-guard-helper-tests-post-merge-verification.md` | Quality | M4.1d-1 Central View/RBAC Guard Helper Tests Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-2-app-central-guard-integration-evidence.md` | Quality | M4.1d-2 App.tsx Central Guard Integration Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-2-app-central-guard-integration-post-merge-verification.md` | Quality | M4.1d-2 App.tsx Central Guard Integration Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-3-sidebar-modulejourney-guard-metadata-alignment-evidence.md` | Quality | M4.1d-3 Sidebar And ModuleJourney Guard Metadata Alignment Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-3-sidebar-modulejourney-guard-metadata-alignment-post-merge-verification.md` | Quality | M4.1d-3 Sidebar And ModuleJourney Guard Metadata Alignment Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-4-persisted-view-scope-cleanup-safe-fallback-evidence.md` | Quality | M4.1d-4 Persisted View/Scope Cleanup And Safe Fallback Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-4-persisted-view-scope-cleanup-safe-fallback-post-merge-verification.md` | Quality | M4.1d-4 Persisted View/Scope Cleanup And Safe Fallback Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-route-rbac-guard-design-plan-evidence.md` | Quality | M4.1d Route/RBAC Guard Design Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.1d-route-rbac-guard-design-plan-post-merge-verification.md` | Quality | M4.1d Route/RBAC Guard Design Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2-ui-reality-check-golden-path-screen-audit-evidence.md` | Quality | M4.2 UI Reality Check And Golden Path Screen Audit Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2-ui-reality-check-golden-path-screen-audit-post-merge-verification.md` | Quality | M4.2 UI Reality Check And Golden Path Screen Audit Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2a-buyer-demo-ui-copy-empty-state-fix-pass-evidence.md` | Quality | M4.2a Buyer-Demo UI Copy And Empty-State Fix Pass Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2a-buyer-demo-ui-copy-empty-state-fix-pass-post-merge-verification.md` | Quality | M4.2a Buyer-Demo UI Copy And Empty-State Fix Pass Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2b-canonical-golden-path-demo-data-plan-evidence.md` | Quality | M4.2b Canonical Golden Path Demo Data Plan Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2b-canonical-golden-path-demo-data-plan-post-merge-verification.md` | Quality | M4.2b Canonical Golden Path Demo Data Plan Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2c-1-canonical-demo-seed-foundation-evidence.md` | Quality | M4.2c-1 Canonical Demo Seed Foundation Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2c-1-canonical-demo-seed-foundation-post-merge-verification.md` | Quality | M4.2c-1 Canonical Demo Seed Foundation Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2c-2-canonical-studio-docs-delivery-monitor-demo-data-evidence.md` | Quality | M4.2c-2 Canonical Studio Docs Delivery Monitor Demo Data Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2c-2-canonical-studio-docs-delivery-monitor-demo-data-post-merge-verification.md` | Quality | M4.2c-2 Canonical Studio Docs Delivery Monitor Demo Data Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2d-buyer-demo-golden-path-validation-reset-readiness-evidence.md` | Quality | M4.2d Buyer-Demo Golden Path Validation And Reset Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2d-buyer-demo-golden-path-validation-reset-readiness-post-merge-verification.md` | Quality | M4.2d Buyer-Demo Golden Path Validation And Reset Readiness Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2e-govern-lite-lifecycle-visibility-demo-copy-alignment-evidence.md` | Quality | M4.2e Govern Lite Lifecycle Visibility And Demo Copy Alignment Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2e-govern-lite-lifecycle-visibility-demo-copy-alignment-post-merge-verification.md` | Quality | M4.2e Govern Lite Lifecycle Visibility And Demo Copy Alignment Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2f-historical-demo-fixture-legacy-copy-cleanup-evidence.md` | Quality | M4.2f Historical Demo Fixture And Legacy Copy Cleanup Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2f-historical-demo-fixture-legacy-copy-cleanup-post-merge-verification.md` | Quality | M4.2f Historical Demo Fixture And Legacy Copy Cleanup Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2g-buyer-demo-smoke-test-ui-readiness-evidence-post-merge-verification.md` | Quality | M4.2g Buyer-Demo Smoke Test And UI Readiness Evidence Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2g-buyer-demo-smoke-test-ui-readiness-evidence.md` | Quality | M4.2g Buyer-Demo Smoke Test And UI Readiness Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2h-buyer-facing-module-naming-avalaos-brand-meaning-copy-alignment-evidence.md` | Quality | M4.2h Buyer-Facing Module Naming And AvalaOS Brand Meaning Copy Alignment Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.2h-buyer-facing-module-naming-avalaos-brand-meaning-copy-alignment-post-merge-verification.md` | Quality | M4.2h Buyer-Facing Module Naming And AvalaOS Brand Meaning Copy Alignment Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.3-buyer-demo-release-candidate-evidence-post-merge-verification.md` | Quality | M4.3 Buyer-Demo Release Candidate Evidence Pack Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.3-buyer-demo-release-candidate-evidence.md` | Quality | M4.3 Buyer-Demo Release Candidate Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4-external-review-findings-triage-evidence.md` | Quality | M4.4 External Review Findings Triage Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4-external-review-findings-triage-post-merge-verification.md` | Quality | M4.4 External Review Findings Triage Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4a-buyer-demo-rc-fix-pass-evidence.md` | Quality | M4.4a Buyer-Demo RC Fix Pass Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4a-buyer-demo-rc-fix-pass-post-merge-verification.md` | Quality | M4.4a Buyer-Demo RC Fix Pass Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4b-buyer-demo-visual-rehearsal-rc-closure-evidence.md` | Quality | M4.4b Buyer-Demo Visual Rehearsal And RC Closure Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4b-buyer-demo-visual-rehearsal-rc-closure-post-merge-verification.md` | Quality | M4.4b Buyer-Demo Visual Rehearsal And RC Closure Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4c-buyer-demo-monitor-runtime-fix-pass-evidence.md` | Quality | M4.4c Buyer-Demo Monitor Runtime Fix Pass Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4c-buyer-demo-monitor-runtime-fix-pass-post-merge-verification.md` | Quality | M4.4c Buyer-Demo Monitor Runtime Fix Pass Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4d-buyer-demo-visual-rehearsal-recheck-rc-closure-evidence.md` | Quality | M4.4d Buyer-Demo Visual Rehearsal Recheck And RC Closure Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.4d-buyer-demo-visual-rehearsal-recheck-rc-closure-post-merge-verification.md` | Quality | M4.4d Buyer-Demo Visual Rehearsal Recheck And RC Closure Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.5-buyer-demo-rc-closure-m5-readiness-gate-evidence.md` | Quality | M4.5 Buyer-Demo RC Closure And M5 Enterprise Readiness Planning Gate Evidence | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m4.5-buyer-demo-rc-closure-m5-readiness-gate-post-merge-verification.md` | Quality | M4.5 Buyer-Demo RC Closure And M5 Enterprise Readiness Planning Gate Post-Merge Verification | Archive | Historical evidence or post-merge verification record. |
| `docs/quality/m5.0-enterprise-supabase-readiness-evidence.md` | Quality | M5.0 Enterprise Supabase Readiness Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.0-enterprise-supabase-readiness-post-merge-verification.md` | Quality | M5.0 Enterprise Supabase Readiness Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.1-environment-config-secret-hygiene-evidence.md` | Quality | M5.1 Environment Config And Secret Hygiene Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.1-environment-config-secret-hygiene-post-merge-verification.md` | Quality | M5.1 Environment Config And Secret Hygiene Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2-supabase-auth-organization-workspace-schema-plan-evidence.md` | Quality | M5.2 Supabase Auth / Organization / Workspace Schema Plan Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2-supabase-auth-organization-workspace-schema-plan-post-merge-verification.md` | Quality | M5.2 Supabase Auth / Organization / Workspace Schema Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2a-supabase-auth-org-workspace-schema-migration-evidence.md` | Quality | M5.2a Supabase Auth Org Workspace Schema Migration Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2a-supabase-auth-org-workspace-schema-migration-post-merge-verification.md` | Quality | M5.2a Supabase Auth Org Workspace Schema Migration Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2b-artifact-ownership-columns-migration-plan-evidence.md` | Quality | M5.2b Artifact Ownership Columns Migration Plan Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2b-artifact-ownership-columns-migration-plan-post-merge-verification.md` | Quality | M5.2b Artifact Ownership Columns Migration Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2c-assess-govern-ownership-columns-migration-evidence.md` | Quality | M5.2c Assess Govern Ownership Columns Migration Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2c-assess-govern-ownership-columns-migration-post-merge-verification.md` | Quality | M5.2c Assess Govern Ownership Columns Migration Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2d-a-studio-docs-ownership-migration-evidence.md` | Quality | M5.2d-a Studio Docs Ownership Migration Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2d-a-studio-docs-ownership-migration-post-merge-verification.md` | Quality | M5.2d-a Studio Docs Ownership Migration Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2d-studio-docs-ownership-columns-migration-plan-evidence.md` | Quality | M5.2d Studio Docs Ownership Columns Migration Plan Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2d-studio-docs-ownership-columns-migration-plan-post-merge-verification.md` | Quality | M5.2d Studio Docs Ownership Columns Migration Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2e-delivery-ownership-columns-migration-plan-evidence.md` | Quality | M5.2e Delivery Ownership Columns Migration Plan Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2e-delivery-ownership-columns-migration-plan-post-merge-verification.md` | Quality | M5.2e Delivery Ownership Columns Migration Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2f-project-authority-migration-evidence.md` | Quality | M5.2f Project Authority Migration Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2f-project-authority-migration-post-merge-verification.md` | Quality | M5.2f Project Authority Migration Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2g-delivery-work-item-ownership-migration-plan-post-merge-verification.md` | Quality | M5.2g Delivery Work Item Ownership Migration Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.2g-delivery-work-item-ownership-migration-planning-evidence.md` | Quality | M5.2g Delivery Work Item Ownership Migration Planning Evidence | Update | Evidence exists but matching post-merge verification is missing in current inventory. |
| `docs/quality/m5.3-rls-policy-design-test-plan-evidence.md` | Quality | M5.3 RLS Policy Design And Test Plan Evidence | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/m5.3-rls-policy-design-test-plan-post-merge-verification.md` | Quality | M5.3 RLS Policy Design And Test Plan Post-Merge Verification | Keep | Current enterprise-readiness evidence; add supersession notes only where later records changed sequence. |
| `docs/quality/no-go-list.md` | Quality | No-Go List | Update | Standing quality/control reference; reconcile with current CI and M5 track. |
| `docs/quality/readiness-gates.md` | Quality | Readiness Gates | Update | Standing quality/control reference; reconcile with current CI and M5 track. |
| `docs/quality/verification-command-matrix.md` | Quality | Verification Command Matrix | Update | Standing quality/control reference; reconcile with current CI and M5 track. |
| `docs/review/m4.3-claude-premium-enterprise-ui-ux-review-pack.md` | Review | M4.3 Claude Premium Enterprise UI/UX Review Pack | Archive | External review pack or triage record; preserve as historical evidence, not current authority. |
| `docs/review/m4.3-gemini-product-governance-critic-review-pack.md` | Review | M4.3 Gemini Product Governance Critic Review Pack | Archive | External review pack or triage record; preserve as historical evidence, not current authority. |
| `docs/review/m4.4-external-review-findings-triage.md` | Review | M4.4 External Review Findings Triage | Archive | External review pack or triage record; preserve as historical evidence, not current authority. |
| `docs/schema/README.md` | Schema docs | AvalaOS Core Supabase Schema Migrations | Keep | Documentation index/reference for schema contracts; keep with source-of-truth caveat. |
| `docs/security/m5.0-environment-secret-hygiene-gate.md` | Security | M5.0 Environment And Secret Hygiene Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.1-environment-config-secret-hygiene-gate.md` | Security | M5.1 Environment Config And Secret Hygiene Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.2-auth-org-workspace-rls-readiness-gate.md` | Security | M5.2 Auth, Organization, Workspace, And RLS Readiness Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.2b-artifact-ownership-rls-readiness-gate.md` | Security | M5.2b Artifact Ownership RLS Readiness Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.2d-studio-docs-rls-readiness-gate.md` | Security | M5.2d Studio Docs RLS Readiness Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.2e-delivery-rls-readiness-gate.md` | Security | M5.2e Delivery RLS Readiness Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.2g-delivery-work-item-rls-readiness-gate.md` | Security | M5.2g Delivery Work Item RLS Readiness Gate | Keep | Active enterprise-readiness security planning/control record. |
| `docs/security/m5.3-rls-policy-matrix.md` | Security | M5.3 RLS Policy Matrix | Keep | Active enterprise-readiness security planning/control record. |
| `docs/task-ledger.md` | Canonical root | Task Ledger | Update | Ledger has planned/TBD entries that conflict with completed evidence records. |

## Inventory Counts

| Area | Count |
| --- | ---: |
| ADR | 5 |
| Agent canonical skill | 7 |
| Agent control | 3 |
| Agent supplemental rule | 6 |
| Agent supplemental skill | 10 |
| Agent workflow | 8 |
| Architecture | 20 |
| Canonical root | 10 |
| Demo | 10 |
| Governance | 9 |
| Planning | 69 |
| Quality | 173 |
| Review | 3 |
| Schema docs | 1 |
| Security | 8 |

## Verification Results

These results were recorded after creating this audit file. The final `git diff --check` was run after this section was populated.

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Passed | `tsc --noEmit` completed with exit code 0. |
| `npm run test` | Passed | Aggregate suite completed with exit code 0. The generated `.agent/provider-resolver-tests` and `.agent/provider-resolver-integration-tests` folders were removed after verifying they were inside the workspace. |
| `npm run build` | Passed | Vite production build completed with exit code 0. |
| `npm audit --audit-level=moderate` | Passed | Completed with exit code 0 and reported 0 vulnerabilities. |
| `git diff --check` | Passed | Final command completed with exit code 0 after this verification table was populated. Direct trailing-whitespace scan of this untracked audit file also returned no hits. |

## Scope Confirmation

- Only this audit document is intended to be changed in this step.
- No recommended fix in this document is implemented by this step.
- No unsupported compliance claim is made; the audit only describes documentation, quality-gate, and sequencing gaps.
