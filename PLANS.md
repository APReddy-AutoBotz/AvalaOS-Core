# AvalaOS Core Execution Plan Contract

Use an execution plan for work that crosses product layers, changes security or authority boundaries, changes schema or deployment behavior, spans multiple sessions, or requires a staged rollback. The active enterprise acceleration plan is the governing plan until it is superseded explicitly.

## Plan Location And Lifecycle

- Keep the durable portfolio sequence in `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`.
- Keep the active risk and proof state in `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`.
- Add task-specific execution detail to the implementation PR when the portfolio plan is not sufficient.
- Update the plan, tests, migration notes, evidence, and rollback guidance in the same implementation PR.
- Treat PR #205 as the explicitly authorized one-time docs/config-only enterprise rebaseline; it does not authorize another documentation-only control PR.
- Do not open a separate plan, evidence, reconciliation, post-merge, or closure PR for routine work.

## Required Plan Content

Every substantial plan must be decision-complete and contain:

1. Objective and user/business outcome.
2. In-scope and prohibited changes.
3. Source baseline, dependencies, and entry gates.
4. Trust boundaries and public interfaces or schemas.
5. Data flow, authorization, transactions, audit, idempotency, and stable error behavior.
6. Failure modes, concurrency behavior, and non-disclosure requirements.
7. Migration, compatibility, feature-flag, rollout, and rollback/read-only behavior.
8. Test cases, acceptance criteria, exact verification commands, and evidence locations.
9. Known unknowns and approval-required actions.

## PR Sizing

- Prefer one substantial vertical PR.
- Use two or three only when independently reviewable security, schema, deployment, or rollback boundaries make the separation safer.
- Each PR must deliver working controls or behavior plus its own tests and evidence.
- Feature-specific lint, coverage, tenant isolation, accessibility, performance, migration, and security checks remain in the feature slice.
- A shared quality/tooling PR is allowed only when the capability genuinely serves at least two product slices and cannot sensibly live in either.

## Evidence Language

- `Confirmed source defect`: directly demonstrated by repository source or an executed test.
- `Suspected defect requiring deeper validation`: plausible from source, but exploitability or runtime effect is not yet established.
- `Deployment status unknown`: no approved deployment inventory was executed.
- `Executed evidence`: a command or inspection actually completed and its result is recorded.
- `Planned verification`: a future check that must not be represented as passed.
- `Blocked`: attempted but unavailable or unauthorized.
- `Not run`: intentionally outside the authorized scope.

Evidence must be sanitized. Never store secrets, tokens, raw logs, signed URLs, customer data, storage identifiers, or production infrastructure identifiers.

## Completion

A plan item is complete only when its behavior, tests, acceptance criteria, rollback boundary, documentation, and sanitized evidence are in the same PR and all required checks have a recorded result. Merge, deployment, incident response, credential rotation, and the next workstream require their own explicit authority.
