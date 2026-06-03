# M2 Governed Delivery Pack Implementation Plan

## 1. Goal
Create a premium, reviewable, exportable Governed Delivery Pack that composes existing Assess results, Avala Govern Lite controls, Avala Studio document references, Delivery work item references, approval/evidence checklist status, blockers, and audit-ready handoff metadata.

M2 is limited to a TypeScript read model, project-scoped preview, and local Markdown/JSON export.

## 2. Scope
- Add a Delivery Pack read model in `types.ts`.
- Add pure composition and export services.
- Add a project-scoped Delivery Pack view under Avala Delivery Lite.
- Add Month-End Close Evidence Pack demo lineage in mock data only.
- Add deterministic Markdown and JSON exports with injectable `exportedAt`.
- Add focused service regression coverage.
- Add final evidence review documentation.

## 3. Out of Scope
- Runtime agent execution.
- MCP/A2A runtime controls.
- External system updates.
- Health repo or Health file changes.
- Scoring formula, output, gate, risk-tier, threshold, or recommendation changes.
- New compliance claims or certification language.
- Full Jira replacement.
- Full workflow engine.
- Production PDF/DOCX renderer.
- New dependencies.
- Schema migrations.
- Live persistence behavior.

## 4. Current Files Likely Touched
- `types.ts`
- `App.tsx`
- `constants/moduleConfig.ts`
- `components/shared/Sidebar.tsx`
- `components/delivery/ProjectView.tsx`
- `data/mockData.ts`
- `package.json`

## 5. Proposed New Files
- `services/deliveryPackService.ts`
- `services/deliveryPackExportService.ts`
- `services/deliveryPackService.test.ts`
- `components/delivery/DeliveryPackView.tsx`
- `docs/quality/m2-final-evidence-review.md`

## 6. Data/Model Changes
- Add Delivery Pack identity, source refs, decision summary, Govern Lite snapshot, document refs, work item refs, approval/evidence checklist, blockers, audit summary, and export metadata types.
- Add optional `TaskSourceLineageMetadata` and optional `Task.sourceLineage`.
- Use document references and summaries only.
- Keep lineage read-only; no adapter writes, no persistence behavior, and no schema migration.

## 7. UI Changes
- Add `View.DELIVERY_PACK` under the existing Delivery module only.
- Add a project-scoped Delivery Pack navigation item under Avala Delivery Lite advanced tools.
- Add `DeliveryPackView` to present the pack model, lineage status, checklists, blockers, and audit summary.
- Keep lineage display in `DeliveryPackView` only.

## 8. Export Changes
- Add local Markdown export.
- Add local JSON export.
- Use the exact same `DeliveryPack` model rendered by the UI.
- Allow `exportedAt` override for deterministic tests.
- Exclude raw uploaded source content, document bodies, provider payloads, raw prompts, secrets, and tenant-confidential document bodies.

## 9. Test Plan
- Complete Month-End Close demo pack composition.
- Missing lineage flags.
- Approval/evidence checklist derivation.
- Blocked work item summary.
- Markdown export sections.
- JSON export sections.
- UI/export use the same model.
- No scoring mutation.
- Deterministic exportedAt support.

## 10. Acceptance Criteria
- Delivery Pack can be opened from project scope under Avala Delivery Lite.
- Pack composes existing assessment, Govern Lite, Studio document, work item, checklist, blocker, and handoff metadata references.
- Markdown and JSON export locally without adding dependencies.
- Exports avoid raw confidential/source/provider content and use audit-ready handoff wording only.
- Month-End Close demo data shows linked lineage.
- Orphaned work items are visibly flagged in the pack.
- Tests cover the approved scenarios.
- No scoring, Health, schema, dependency, or live adapter behavior changes.

## 11. Verification Commands
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm audit --audit-level=moderate`
- `git diff --check`
- Approved AP wording scan pattern for legacy names, prohibited compliance claims, and prohibited AI-decision phrasing.

## 12. Risks
- Existing document demo approvals may surface pending review states in the pack.
- Existing demo/local storage may not have handoff ledger entries, so the pack must rely on read-only lineage metadata when no ledger entries are present.
- The service must not duplicate or mutate scoring behavior while reading assessment outputs.
- Export copy must remain clear that the pack is audit-ready handoff metadata, not formal compliance certification.

## 13. Stop Conditions
- Scoring files need modification.
- Scoring behavior changes.
- A schema migration is needed.
- `package-lock.json` changes.
- A dependency change is required.
- Health files need modification.
- Runtime execution/MCP/A2A behavior appears.
- Adapter writes or persistence behavior are needed.
- Copy implies AI decides approvals, scores, risk gates, or compliance status.
- Compliance claims are introduced.

## 14. Suggested Branch Name
`milestone/m2-governed-delivery-pack`

## 15. Suggested Commit Message
`M2 add governed delivery pack`

## 16. Whether Package/Schema Changes Are Needed
Package change: yes, script-only. Add `test:delivery-pack` and include it in `npm run test`.

Schema change: no.

Dependency change: no.
