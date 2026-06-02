# Module Boundary Matrix

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

| Module | Owns | Must Not Own | Allowed Dependencies | Forbidden Behavior |
| --- | --- | --- | --- | --- |
| Avala Assess | Process intake, deterministic scoring, fitment, decision pack inputs. | Runtime agent execution, live system changes, compliance certification. | Evidence, Govern, Studio handoff data. | AI changing scores, unversioned formula drift. |
| Avala Studio | Editable delivery-ready documents and document handoff. | Final approvals, score decisions, runtime execution. | Approved Assess outputs, evidence references. | Fabricating missing requirements. |
| Avala Govern Lite | Agent/automation registry model, risk, autonomy, approvals, evidence rules. | MCP/A2A runtime controls in M0.2, live agent orchestration. | Assess recommendations, evidence, owners, audit. | Allowing action without owner, approval, and evidence boundaries. |
| Avala Delivery Lite | Governed work item handoff, owners, status, blockers, lineage. | Jira replacement scope, scoring, approvals of regulated risk. | Studio docs, Govern approval state, evidence. | Orphaned work items without source lineage. |
| Avala Monitor | Portfolio visibility, value, risk, blockers, status. | Scoring formulas, agent execution, Health proof vertical ownership. | Assess, Delivery, Govern status. | Creating claims not backed by evidence. |
| Avala Admin / AI Controls | Organization settings, provider controls, BYOK/key references, audit settings. | Browser-side secrets, user-facing scoring decisions. | Server-side AI services, audit log, policy docs. | Raw provider key exposure in browser behavior. |

## Boundary Locations

- Scoring lives in deterministic Assess services and regression tests.
- AI lives in server-side AI paths for pilot and production behavior.
- Evidence, approvals, and audit are governed records linked to source decisions.
