# Human-In-The-Loop Policy Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Approval Triggers

- Medium or higher risk.
- Sensitive data.
- External system update.
- Irreversible or costly action.
- Low confidence or ambiguous source material.
- Any blocked-action exception request.

## Approval Record

Each approval must capture owner, decision, timestamp, evidence reference, risk level, and allowed action scope.

## Non-Goals

This model does not implement runtime approvals in M0.2.
