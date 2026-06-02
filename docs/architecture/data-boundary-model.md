# Data Boundary Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Data Classes

| Class | Examples | Owner | Control |
| --- | --- | --- | --- |
| Assessment data | Process inputs, volumes, effort, risks. | Avala Assess | Deterministic scoring and evidence linkage. |
| Generated docs | BRD, PRD, PDD, SDD drafts. | Avala Studio | Editable, traceable, human-reviewed. |
| Governance data | Agent registry, autonomy, risk, approvals. | Avala Govern Lite | Owner, approval, evidence, audit status. |
| Delivery data | Work items, blockers, owners, status. | Avala Delivery Lite | Source lineage and handoff controls. |
| Security data | Provider references, audit settings. | Avala Admin / AI Controls | Server-side storage and access controls. |

## Rules

- Browser-side provider secrets are not acceptable for pilot or production behavior.
- Evidence must be linked to the decision it supports.
- Sensitive data requires explicit review and access control.
