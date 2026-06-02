# Validate Scoring Change

## Trigger
Use when a formula, threshold, modifier, or hard-stop changes.

## Inputs
- changed_formula_name
- source_spec_reference
- previous version
- new implementation

## Steps
1. Retrieve authoritative formula.
2. Compare old vs new behavior.
3. Confirm version increment.
4. Run golden-case regression.
5. Flag any mismatch.
6. Output go/no-go.

## Done Criteria
- Formula matches approved spec
- Version updated
- Regression passes