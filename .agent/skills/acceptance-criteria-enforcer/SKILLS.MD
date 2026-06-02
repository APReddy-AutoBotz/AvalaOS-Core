---
name: acceptance-criteria-enforcer
description: Use this skill when validating a KlarityPM Assess module against user stories and acceptance criteria before it is marked complete.
---

Acceptance Criteria Enforcer

## Goal
Ensure a module is only marked complete when its acceptance criteria are demonstrably met.

## Instructions
1. Read the module user stories and acceptance criteria.
2. Generate test steps for each acceptance item.
3. Request or inspect proof artifacts:
   - screenshots
   - test results
   - sample outputs
   - logs
4. Mark each criterion:
   - Pass
   - Fail
   - Partial
5. Summarize blockers.

## Constraints
- Do not mark “done” based on code existence alone.
- Do not accept hand-wavy claims without evidence.
- Do not skip negative-path checks.

## Output Format
- Story ID
- Criterion
- Test Method
- Result
- Evidence
- Blockers