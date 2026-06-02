# Build Module From Spec

## Trigger
Use when asked to implement a specific KlarityPM Assess module.

## Inputs
- module_name
- source_spec_reference
- current codebase state

## Steps
1. Read module scope from source spec.
2. Extract user stories and acceptance criteria.
3. List dependencies and interfaces.
4. Scaffold files/components.
5. Implement only in-scope logic.
6. Run acceptance checks.
7. Produce proof artifacts:
   - screenshots
   - test output
   - changed files summary

## Done Criteria
- Module scope complete
- Acceptance criteria checked
- No unauthorized scope creep