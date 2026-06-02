# Schema and Data MCP

## Purpose
Exposes app schema, model definitions, and seed-data helpers.

## Resources
- entity_model_map
- db_schema_reference
- migration_history
- allowed_enum_values
- seed_assessment_samples

## Prompts
- scaffold_entity(entity_name)
- validate_data_model_change(change_summary)
- generate_seed_payload(module_name)

## Tools
- get_entity_schema(entity_name)
- list_enums()
- validate_payload(entity_name, payload)
- generate_migration_stub(change_name)
- fetch_seed_case(case_id)

## Guardrails
- No destructive schema changes without explicit confirmation
- Enum changes must be surfaced as breaking-risk items