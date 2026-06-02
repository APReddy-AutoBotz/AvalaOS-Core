# Avala Assess Scoring

## Purpose

Protect deterministic Avala Assess scoring and recommendation behavior.

## When To Use

Use for any task that reads, tests, explains, or may affect scores, formulas, thresholds, risk gates, hard stops, or recommendations.

## Non-Negotiable Rules

- Deterministic engines decide scores.
- AI must not decide scores, gates, risk tiers, or recommendations.
- Formula changes require explicit approval, score versioning, changelog notes, and regression tests.

## Inputs

- Scoring files and tests
- Source-of-truth docs
- Regression fixtures

## Outputs

- Scoring boundary assessment
- Test evidence
- Versioning requirement, if any

## Acceptance Criteria

- Existing scoring tests pass.
- No unversioned score drift occurs.
- AI narrative cannot override deterministic outputs.

## Common Failure Modes

- Hidden defaults changing business meaning.
- Updating copy that implies AI owns scores.
- Adjusting thresholds without score versioning.

## Verification Checklist

- Run `npm run test:requirements` or full `npm run test`.
- Review changed files for scoring paths.
- Confirm final report states whether scoring changed.
