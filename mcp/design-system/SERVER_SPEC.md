# Design System MCP

## Purpose
Keeps UI, layout, component usage, and upgrade gating patterns consistent.

## Resources
- component_catalog
- page_layout_patterns
- role_visibility_matrix
- upgrade_gating_patterns
- report_ui_guidelines

## Prompts
- propose_page_structure(screen_name)
- validate_component_usage(screen_name)
- generate_upgrade_gate_copy(context)

## Tools
- list_components()
- get_component_spec(component_name)
- validate_screen_layout(screen_definition)
- get_role_access(role_name)

## Guardrails
- Do not introduce ad-hoc component styles when approved components exist
- Free-trial vs paid-state UI must use approved gating patterns