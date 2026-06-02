# AvalaOS Core Agent Instructions

Codex must read `docs/00_SOURCE_OF_TRUTH.md` before planning or implementing repository work.

## Product Law

- Assess before automation.
- Govern before execution.
- Humans approve risk.
- Evidence proves every decision.

## Non-Negotiable Rules

- Do not change scoring formulas, score weights, thresholds, hard stops, or recommendation logic without an explicit score version change and regression tests.
- Do not use AI to decide deterministic scores, risk gates, approvals, or regulated decisions.
- Do not add unsupported compliance claims.
- Do not introduce browser-side provider secrets or browser-side AI execution for pilot or production behavior.
- Do not modify KlarityFlow Health unless the user explicitly requests Health work.
- Do not push to the historical prototype repository.
- Do not add runtime AGS, MCP, A2A, or agent execution behavior unless a later approved milestone authorizes it.

## Milestone Discipline

- Stop after each milestone and provide evidence.
- Every implementation must include acceptance criteria and verification.
- If instructions conflict, `docs/00_SOURCE_OF_TRUTH.md` wins.
- If a change would expand product scope, stop and ask for approval.
