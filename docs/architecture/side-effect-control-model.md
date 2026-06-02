# Side-Effect Control Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Side Effects

Side effects are actions that create, update, delete, export, send, execute, or approve something outside a read-only review flow.

## Control Rules

- Assess may calculate and recommend, but must not execute external changes.
- Studio may draft and export when approved, but must preserve source lineage.
- Govern defines approval and evidence rules before execution.
- Delivery may track approved work, but must not become a general project management replacement.
- M0.2 does not add runtime AGS, MCP, A2A, or live agent side effects.

## Stop Conditions

- No owner.
- No approval rule.
- No evidence requirement.
- Unknown data sensitivity.
- Blocked action category.
