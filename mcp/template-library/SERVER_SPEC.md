# Template Library MCP

## Purpose
Provides reusable process templates, document outlines, and field mappings.

## Resources
- process_family_taxonomy
- finance_procurement_templates
- assessment_question_bank
- brd_outline_template
- prd_outline_template
- pdd_outline_template
- sdd_outline_template

## Prompts
- generate_process_template(template_name)
- map_assessment_to_doc_seed(doc_type)
- suggest_template_pack(industry, function_area)

## Tools
- list_template_packs()
- get_template(template_id)
- validate_template_structure(template_payload)
- clone_template(template_id, new_name)

## Guardrails
- Core scoring fields must remain flagged as protected
- Custom fields must be marked non-core unless explicitly approved