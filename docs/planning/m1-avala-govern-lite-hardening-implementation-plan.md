# M1 Avala Govern Lite Hardening Implementation Plan

## Goal

Make Avala Govern Lite the first credible AGS review layer for agents and automations by strengthening deterministic governance controls, display surfaces, evidence linkage, and Decision Pack reuse.

Boundary: Avala Assess decides suitability. Avala Govern decides controls.

## Scope

- Extend the Govern Lite model with autonomy rationale, risk rationale, approval policy, evidence policy, evidence gaps, governance status, and next governance action.
- Add a reusable Govern Lite card for assessment review surfaces.
- Reuse the same Govern Lite service/model in Decision Pack markdown and JSON exports.
- Add focused Govern Lite service regression tests.
- Add M1 planning and final evidence review docs.

## Out Of Scope

- Runtime agent execution.
- MCP/A2A runtime controls.
- External system updates.
- New approval execution engine.
- Schema migrations.
- Dependency changes.
- Scoring formula, score output, gate, risk tier, or recommendation changes.
- Health implementation changes.
- Product compliance claims.

## Current Files Likely Touched

- `types.ts`
- `services/avalaGovernLiteService.ts`
- `services/assessmentExportService.ts`
- `components/assess/GuidedAssessmentView.tsx`
- `components/assess/ProcessDetailStubView.tsx`
- `package.json`

## Proposed New Files

- `components/assess/AvalaGovernLiteCardPanel.tsx`
- `services/avalaGovernLiteService.test.ts`
- `docs/planning/m1-avala-govern-lite-hardening-implementation-plan.md`
- `docs/quality/m1-final-evidence-review.md`

## Data And Model Changes

- Extend `AvalaGovernLiteCard` with deterministic Govern Lite control fields.
- Use existing assessment responses, evidence metadata, and existing score outputs as inputs.
- Do not recalculate Assess scores.
- Do not alter scoring formulas, score outputs, gates, risk tiers, or recommendation logic.
- L4 Autonomous Within Guardrails is available only when explicit guardrails are satisfied.
- L5 Blocked / Not Allowed is a valid governance outcome with reason and next governance action.

## UI Changes

UI changes are limited to Govern Lite display/review surfaces only. No workflow execution, no runtime agent behavior, no external action behavior, and no new approval execution engine.

The reusable card shows registry summary, owner/process/system/tool context, autonomy level, risk level, rationales, approval policy, evidence policy, evidence gaps, allowed actions, blocked actions, review frequency, audit status, and next governance action.

## Test Plan

- Add `services/avalaGovernLiteService.test.ts`.
- Add `test:govern-lite` script.
- Include `test:govern-lite` in `npm run test`.
- Cover L4 guardrails, L5 Blocked / Not Allowed, evidence gaps, approval requirements, blocked actions, and export/shared-service behavior.

## Acceptance Criteria

- Govern Lite consumes existing Assess outputs and process context without changing scoring behavior.
- UI surfaces show all required Govern Lite fields.
- Decision Pack markdown and JSON exports use the same Govern Lite card generated for UI.
- Tests pass for guardrails, blocked outcomes, evidence gaps, approvals, blocked actions, and export reuse.
- Wording scan has only allowed hits.
- No package-lock, dependency, schema, scoring, Health, or product-claim changes.

## Verification Commands

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm audit --audit-level=moderate`
- Wording scan for old-name, product-claim, and AI-decision boundary phrases.

## Risks

- UI copy could imply execution instead of governance review.
- Export logic could drift if it calculates Govern Lite separately.
- L4 could be shown when guardrail evidence is insufficient.
- Blocked outcomes could be mistaken for application failure unless displayed clearly.

## Stop Conditions

- Scoring files need modification.
- Scoring behavior changes.
- Health files need modification.
- `package-lock.json` changes.
- Dependency changes are required.
- Schema migration is needed.
- Runtime agent, MCP/A2A, or external action behavior is introduced.
- UI copy implies agents execute actions.
- AI appears to decide scores or approvals.
- Product compliance claims are introduced.

## Suggested Branch Name

`milestone/m1-avala-govern-lite-hardening`

## Suggested Commit Message

`M1 harden Avala Govern Lite`

## Schema And Package Changes

- No schema changes are needed.
- No dependency changes or package-lock changes.
- Only a `package.json` script-only change is allowed for `test:govern-lite`.
