# Evidence Architecture

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Evidence Owns

- Source inputs.
- Assumptions.
- Deterministic score rationale.
- Human approval records.
- Governance decisions.
- Handoff lineage.
- Audit events.

## Evidence Rules

- Evidence must identify source, owner, timestamp, and decision supported.
- Missing evidence must be recorded as missing, not inferred.
- Generated docs must preserve references to source assessments.
- Audit events must prove what changed, who approved, and why.

## Evidence Does Not Own

- Scoring formulas.
- Runtime execution.
- Compliance certification.
