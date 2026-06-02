# Agent Registry Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Required Fields

- Agent or automation name
- Business owner
- Technical owner
- Mapped process
- Systems accessed
- Tools used
- Data sensitivity
- Autonomy level
- Risk level
- Allowed actions
- Blocked actions
- Human approval requirement
- Evidence requirement
- Review cadence
- Audit status

## Rules

- No registry entry is valid without owners.
- Blocked actions must be explicit.
- Evidence requirements must match risk and data sensitivity.
