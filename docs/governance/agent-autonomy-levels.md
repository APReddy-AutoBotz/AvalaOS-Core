# Agent Autonomy Levels

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

| Level | Name | Meaning | Minimum Control |
| --- | --- | --- | --- |
| L1 | Observe | Reads and reports only. | Owner and data sensitivity recorded. |
| L2 | Advise | Suggests actions but does not execute. | Human review required before action. |
| L3 | Act With Approval | Prepares or performs action after explicit approval. | Approval, evidence, and audit required. |
| L4 | Autonomous Within Guardrails | Acts inside approved limits. | Guardrails, logs, kill switch, review cadence required. |
| L5 | Blocked / Not Allowed | Must not be used for this context. | Block reason and owner decision required. |

M0.2 defines the model only. It does not add runtime agent execution.
