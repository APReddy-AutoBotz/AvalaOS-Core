# Promote Assessment To Docs

## Trigger
Use when an approved assessment should seed BRD/PRD/PDD/SDD content.

## Inputs
- assessment_id
- target_doc_type

## Steps
1. Confirm assessment status = approved.
2. Extract structured source fields.
3. Map fields into target document sections.
4. Preserve traceability references.
5. Flag missing required sections.
6. Generate doc seed payload.

## Done Criteria
- Doc seed payload created
- Traceability preserved
- No fabricated fields