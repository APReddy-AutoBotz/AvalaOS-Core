# Integration Boundary

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Allowed Integration Direction

- Assess to Govern for governance card inputs.
- Assess to Studio for approved document seeds.
- Studio to Delivery for approved work item handoff.
- Govern to Delivery for approval and blocked-action constraints.
- Modules to Audit for evidence and traceability.

## Prohibited Integration Direction

- AI provider output directly changing scores.
- Delivery changing Assess scores.
- Monitor creating approvals.
- Browser-side secrets calling provider APIs for pilot or production behavior.
- Runtime agent execution controls during M0.2.

## Integration Acceptance

Every integration must preserve source ID, owner, approval state, and evidence reference where applicable.
