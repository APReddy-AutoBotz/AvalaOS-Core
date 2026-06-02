---
name: recommendation-engine-enforcer
description: Use this supplemental skill when converting deterministic Avala Assess scores into primary and secondary technology recommendations.
---

Recommendation Engine Enforcer

## Goal
Generate correct and explainable recommendations from deterministic score outputs.

## Instructions
1. Read:
   - RPA Fit
   - GenAI Fit
   - Agentic Fit
   - HIL Requirement
   - Value Potential
   - Confidence
2. Apply hard-stop rules first.
3. Apply adjusted score logic and gating.
4. Determine:
   - primary recommendation
   - secondary recommendation
   - human control model
5. Generate:
   - why this fits
   - why alternatives do not fit
   - spend-efficiency note
   - caution notes

## Constraints
- Never recommend agentic when gated out by risk, ambiguity, or confidence.
- Never recommend AI when RPA captures the value more cleanly.
- Never hide the reason a path was rejected.
- Never override hard-stops.

## Output Format
- Primary Recommendation
- Secondary Recommendation
- Human Control Model
- Why This
- Why Not Others
- Spend Efficiency Note
- Cautions
