# Test and Regression MCP

## Purpose
Provides deterministic validation for formulas, flows, and report outputs.

## Resources
- regression_matrix
- smoke_test_catalog
- golden_score_cases
- report_snapshot_rules
- release_checklist

## Prompts
- run_module_smoke_suite(module_name)
- validate_formula_regression(formula_name)
- prepare_release_gate(release_scope)

## Tools
- run_smoke_tests(module_name)
- run_formula_regression(formula_name)
- generate_report_snapshot(report_type, case_id)
- compare_snapshot(snapshot_a, snapshot_b)
- get_failed_checks()

## Guardrails
- Failing formula regressions block release
- Snapshot diffs must be classified as cosmetic vs logic-impacting