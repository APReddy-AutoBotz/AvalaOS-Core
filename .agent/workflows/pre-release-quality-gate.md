# Pre-Release Quality Gate

## Trigger
Use before releasing a module or major change.

## Inputs
- release_scope
- changed_components
- target environment

## Steps
1. Run smoke scenarios.
2. Validate role access.
3. Validate free-trial gating.
4. Validate handoff integrity.
5. Validate report generation.
6. Validate formula/recommendation regression where applicable.
7. Produce go/no-go note with severity.

## Done Criteria
- Critical checks passed
- Blocking issues listed if present
- Release decision documented

23 and 24