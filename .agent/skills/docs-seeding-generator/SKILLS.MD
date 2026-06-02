---
name: docs-seeding-generator
description: Use this supplemental skill when converting approved Avala Assess outputs into draft BRD, PRD, PDD, or SDD starter payloads.
---

Docs Seeding Generator

## Goal
Seed structured documentation from approved assessment data without fabricating missing requirements.

## Instructions
1. Confirm the assessment is approved.
2. Extract:
   - process summary
   - business problem
   - assumptions
   - risks
   - scores
   - recommendation
   - roadmap notes
3. Map the structured outputs into the target document format:
   - BRD
   - PRD
   - PDD
   - SDD
4. Preserve traceability links back to the originating assessment.
5. Flag missing inputs instead of inventing them.

## Constraints
- Do not create false business requirements.
- Do not alter approved scores or rationale.
- Do not collapse multiple recommendations into one if the source keeps them separate.

## Output Format
- Source Assessment ID
- Document Type
- Seeded Sections
- Missing Inputs
- Traceability Map
