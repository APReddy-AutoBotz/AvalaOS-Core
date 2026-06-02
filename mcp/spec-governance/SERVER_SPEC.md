# Spec Governance MCP

## Purpose
Acts as the source-of-truth server for Avala Assess rules, specs, formulas, and policy text.

## Resources
- klaritypm_assess_revised_spec
- klaritypm_assess_scoring_spec
- klaritypm_assess_recommendation_rules
- klaritypm_assess_free_trial_policy
- klaritypm_shared_platform_constraints

## Prompts
- build_module_from_source_spec(module_name)
- audit_scoring_implementation(component_name)
- validate_recommendation_logic(change_summary)

## Tools
- get_spec_section(section_id)
- get_formula(formula_name)
- compare_formula(candidate_formula, formula_name)
- get_policy(policy_name)
- get_current_score_version()

## Guardrails
- Read-only by default
- Any write/update route requires explicit admin mode
- Formula comparisons must return field-level diffs
