# Agent Risk Model

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

| Risk | Meaning | Required Control |
| --- | --- | --- |
| Low | Limited data, reversible action, low operational impact. | Owner, evidence note, periodic review. |
| Medium | Business impact or sensitive workflow dependency. | Human approval and audit event. |
| High | Material business, customer, financial, or access risk. | Explicit approval, evidence pack, blocked-action list. |
| Critical | High-impact or sensitive operation requiring executive control. | Formal review, kill switch, no unsupervised action. |
| Blocked | Not allowed in current context. | Record block reason and do not execute. |

Risk level must be justified with evidence and owner review.
