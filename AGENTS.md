# AvalaOS Core Agent Instructions

Read `docs/00_SOURCE_OF_TRUTH.md` before planning, reviewing, or implementing repository work. If instructions conflict, that file wins.

## Minimum Authoritative Reading Sequence

1. `docs/00_SOURCE_OF_TRUTH.md`
2. This `AGENTS.md`
3. `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`
4. `docs/architecture/current-to-target-enterprise-architecture.md`
5. `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`
6. `PLANS.md` for substantial execution work
7. Only the task-specific canonical document routed by `docs/architecture/document-authority-map.md`

Do not read the full historical planning or evidence corpus by default. Historical plans, evidence, reconciliation records, and post-merge verification are consulted only when an active artifact links to them or the task requires a specific audit trail.

## Product Law

- Assess before automation.
- Govern before execution.
- Humans approve risk.
- Evidence proves every decision.

## P0 Stop Gate

The service-role Storage URL escape recorded as `P0-001` in the active risk register is the first gate for PR 1A and every readiness claim.

- Deployment status is `unknown`; do not infer that the vulnerable function is deployed or not deployed.
- Do not inspect or mutate live infrastructure, disable endpoints, review production logs, rotate credentials, or perform incident actions without separate explicit approval.
- Do not claim pilot, production, hosted, deployment, storage, or security readiness while the deployment question is unresolved.
- Follow the decision tree in the acceleration plan before normal PR 1A work.
- Never place secrets, raw logs, signed URLs, customer data, object identifiers, or production infrastructure identifiers in evidence.

## Non-Negotiable Rules

- Do not change scoring formulas, score weights, thresholds, hard stops, or recommendation logic without an explicit score version change and regression tests.
- Do not use AI to decide deterministic scores, risk gates, approvals, or regulated decisions.
- Do not add unsupported compliance claims.
- Do not introduce browser-side provider secrets or browser-side AI execution for pilot or production behavior.
- Do not treat client claims, email matching, demo personas, cached permissions, routes, or UI state as server authorization.
- Do not modify KlarityFlow Health unless the user explicitly requests Health work.
- Do not push to the historical prototype repository.
- Do not add runtime AGS, MCP, A2A, or agent execution behavior unless a later approved milestone authorizes it.
- If a change expands product scope, stop and request approval.

## Delivery Discipline

- A workstream may use one to three substantial vertical PRs when security, schema, deployment, or rollback boundaries require it.
- Do not create plan-only, evidence-only, reconciliation-only, routine post-merge, or closure-only PRs.
- Keep feature documentation, migrations, security controls, tests, verification, evidence, and rollback instructions in the implementation PR that needs them.
- Every implementation PR must include acceptance criteria, feature-specific quality gates, exact verification results, and a safe rollback or read-only fallback.
- Stop after each substantial PR boundary and report evidence; do not fragment one boundary into process-theatre PRs.
- Use the status vocabulary `confirmed source defect`, `suspected defect requiring deeper validation`, `deployment status unknown`, `executed evidence`, `planned verification`, `blocked`, and `not run` precisely.

## Historical Evidence

Historical evidence and post-merge verification under `docs/quality/` are immutable. Update active canonical documents when the current position changes. Do not rewrite closed evidence unless the user explicitly authorizes a corrective addendum.
