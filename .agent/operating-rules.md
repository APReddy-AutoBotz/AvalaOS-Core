# AvalaOS Operating Rules

## Source Priority

1. `docs/00_SOURCE_OF_TRUTH.md`
2. `AGENTS.md`
3. Governance, architecture, quality, and ADR docs
4. Canonical `.agent/skills/avala-*` files
5. Supplemental legacy `.agent` files

## Required Behavior

- Keep work milestone-scoped.
- Write acceptance criteria before or during implementation.
- Verify with evidence before marking work complete.
- Preserve deterministic scoring behavior unless a scoring milestone explicitly approves a versioned change.
- Keep AI assistance separate from deterministic decisions and human approvals.
- Treat browser-side secrets as prohibited for pilot and production behavior.

## Stop Conditions

- Source-of-truth conflict that cannot be resolved safely.
- Request to add product features during a docs/governance milestone.
- Scoring, Health, AI execution, or package changes outside approved scope.
- Unsupported compliance claim.
- Attempt to push to a non-AvalaOS-Core remote.
