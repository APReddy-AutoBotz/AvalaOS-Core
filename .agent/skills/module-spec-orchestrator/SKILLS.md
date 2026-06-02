---
name: module-spec-orchestrator
description: Use this supplemental skill when building an AvalaOS module from an approved source spec. It extracts one module only, defines scope, dependencies, file plan, acceptance checks, and prevents scope creep.
---

Module Spec Orchestrator

## Goal
Build exactly one module from the approved AvalaOS source spec, with clear scope boundaries and traceable outputs.

## Inputs
- Module name
- Source spec path or document reference
- Current platform context (Assess / Docs / Delivery)
- Existing completed modules

## Instructions
1. Read the source spec section for the requested module only.
2. Extract:
   - business purpose
   - user stories
   - acceptance criteria
   - dependencies
   - downstream handoffs
3. Produce:
   - scope summary
   - build tasks
   - file/component list
   - API/data touchpoints
   - test checklist
4. Confirm what must NOT be built yet.
5. Build only the requested module.
6. After implementation, map delivered work back to acceptance criteria.

## Constraints
- Do not build future modules unless explicitly asked.
- Do not alter scoring logic.
- Do not invent undocumented features.
- Do not merge Assess logic into Docs/Delivery logic unless the spec says so.

## Output Format
- Scope
- In Scope
- Out of Scope
- Dependencies
- Files to Create/Update
- Acceptance Checks
- Risks / Open Questions
