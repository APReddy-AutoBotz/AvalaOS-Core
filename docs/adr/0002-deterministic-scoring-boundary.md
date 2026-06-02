# ADR 0002: Deterministic Scoring Boundary

## Status

Accepted.

## Context

Assess scoring must remain reproducible and testable.

## Decision

Deterministic scoring services are the authority for scores, gates, risk tiers, and recommendations. AI may explain or draft around those outputs but must not change them.

## Consequences

Any scoring change requires explicit approval, score versioning, and regression evidence.

## Non-Goals

This ADR does not change formulas or tests.

## Verification Impact

Run scoring regression through `npm run test` for relevant changes and review changed files for scoring paths.
