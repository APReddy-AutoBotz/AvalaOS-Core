---
name: deterministic-scoring-guardian
description: Use this skill when implementing or reviewing any score, weight, modifier, threshold, hard-stop, or recommendation calculation in KlarityPM Assess.
---

Deterministic Scoring Guardian

## Goal
Protect the approved scoring engine and block any drift from the source-of-truth formulas.

## Instructions
1. Locate the authoritative formula/spec reference.
2. Compare implementation against:
   - variables
   - weights
   - transforms
   - thresholds
   - modifiers
   - hard-stop rules
   - version field usage
3. Validate that:
   - formulas are deterministic
   - values are reproducible
   - no LLM output changes the computed score
4. Run regression tests against known sample inputs.
5. Produce a pass/fail audit with exact mismatches.

## Constraints
- Never accept “approximate” formulas.
- Never replace explicit math with heuristic prose.
- Never allow hidden defaults that change business meaning.
- Never allow score changes without version handling.

## Output Format
- Formula audited
- Matches spec? (Yes/No)
- Mismatches
- Regression status
- Required fixes